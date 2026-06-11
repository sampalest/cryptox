"use strict";

import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Constants from "./constants.js";
import Crypto from "./crypto.js";
import FileManager from "./filemanager.js";
import OperationRegistry from "./operations.js";
import TempManager from "./temp.js";
import {
    assertDecryptSource,
    assertEncryptSource,
    isTrustedSender,
    normalizeCryptoPayload,
    validateDeletePath,
    validateExternalUrl,
    validateOperationId
} from "./ipcValidation.js";
const isDevelopment = process.env.NODE_ENV !== "production";
import logger from "electron-log";

const runtimeDir = typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;
let rendererReady = false;
let pendingOpenFiles = [];

function sendToRenderer(channel, payload) {
    if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send(channel, payload);
    }
}

function flushPendingOpenFiles() {
    if (!rendererReady) return;
    pendingOpenFiles.forEach(file => sendToRenderer("files:open-file", file));
    pendingOpenFiles = [];
}

function openFile(file) {
    if (!file) return;
    if (!app.isReady() || !win || !rendererReady) {
        pendingOpenFiles.push(file);
        return;
    }
    sendToRenderer("files:open-file", file);
}

function buildApplicationMenu() {
    const template = [];

    if (process.platform === "darwin") {
        template.push({
            label: app.name,
            submenu: [
                {
                    label: "About Cryptox",
                    click: () => sendToRenderer("menu:about")
                },
                { type: "separator" },
                { role: "hide" },
                { role: "hideothers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" }
            ]
        });
    }

    template.push({
        label: "File",
        submenu: [
            {
                label: "Open File",
                accelerator: "CmdOrCtrl+O",
                click: () => sendToRenderer("menu:open-file")
            }
        ]
    });

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));

    if (process.platform === "darwin" && app.dock) {
        app.dock.setMenu(Menu.buildFromTemplate([
            {
                label: "Open file",
                click: () => sendToRenderer("menu:open-file")
            },
            { type: "separator" },
            {
                label: "About...",
                click: () => sendToRenderer("menu:about")
            }
        ]));
    }
}

function createWindow () {
    rendererReady = false;
    win = new BrowserWindow({
        width: 700,
        height: 600,
        title: "Cryptox",
        titleBarStyle: "hiddenInset",
        resizable: false,
        maximizable: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(runtimeDir, "preload.cjs")
        }
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
        if (!process.env.IS_TEST) win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(runtimeDir, "..", "dist", "index.html"));
    }

    win.on("closed", () => {
        win = null;
        rendererReady = false;
    });
}
app.name = "Cryptox";
app.on("open-file", (event, file) => {
    logger.info("Opening file from macOS file association");
    openFile(file);
    event.preventDefault();
});

if (process.platform === "darwin") {
    // To fix chrome-bug on MacOS
    app.commandLine.appendArgument("--enable-features=Metal");
}

// Safety net: tear down in-flight operations, then drop any operation-owned
// temp directories that are still registered (e.g. quit mid-operation).
app.on("will-quit", () => {
    OperationRegistry.cancelAll();
    TempManager.releaseAll();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow();
    }
});

app.on("ready", async () => {
    buildApplicationMenu();
    createWindow();
});

ipcMain.handle("files:renderer-ready", event => {
    if (win && event.sender === win.webContents) {
        rendererReady = true;
        flushPendingOpenFiles();
        if (process.env.CRYPTOX_SMOKE_TEST) {
            runSmokeTest();
        }
    }
});

ipcMain.handle("app:info", () => ({
    locale: app.getLocale(),
    name: app.name,
    platform: process.platform
}));

ipcMain.handle("dialog:open-files", async () => {
    const files = await dialog.showOpenDialog(win, {
        properties: ["openFile", "openDirectory"],
        filters: [{
            name: "All Files", extensions: ["*"]
        }]
    });

    return files.filePaths;
});

ipcMain.handle("shell:open-external", (_, url) => shell.openExternal(validateExternalUrl(url)));

// Crypto channels always resolve with a structured result instead of
// rejecting: ipcMain.handle rejection serialization strips custom error
// fields, and the renderer must distinguish success, "cancelled" and typed
// failures. Failure messages are fixed strings; user-controlled payload
// content (paths, passwords, operation ids) never goes into them or the log.
const Codes = Constants.CRYPTO_ERROR_CODES;

function failure(code, message) {
    return { ok: false, code, message };
}

function toCryptoFailure(error, fallbackMessage) {
    if (error && error.name === "IpcValidationError") {
        return failure(error.code, error.message);
    }
    if (error && error.name === "PathBusyError") {
        return failure(Codes.OPERATION_FAILED, "Another operation is already running on this file.");
    }
    logger.error(`crypto request rejected: ${error && error.name}`);
    return failure(Codes.OPERATION_FAILED, fallbackMessage);
}

async function runRegisteredOperation(operationId, run, fallbackMessage) {
    try {
        await run();
        return { ok: true, cancelled: false };
    } catch (error) {
        if (error && error.name === "CancelledError") return { ok: true, cancelled: true };
        logger.error(`crypto operation failed: ${error && error.name}`);
        return failure(Codes.OPERATION_FAILED, fallbackMessage);
    } finally {
        OperationRegistry.finish(operationId);
    }
}

ipcMain.handle("crypto:encrypt", async (event, payload) => {
    if (!isTrustedSender(event, win)) return failure(Codes.SENDER_REJECTED, "Request was rejected.");
    const fallbackMessage = "Encryption failed.";
    let filePath, password, operationId;
    try {
        ({ filePath, password, operationId } = normalizeCryptoPayload(payload));
        await assertEncryptSource(filePath);
    } catch (error) {
        return toCryptoFailure(error, fallbackMessage);
    }
    const crypto = new Crypto(password, operationId);
    const normalizedFile = new FileManager(filePath);
    // Lock the source and the predicted primary output. uniquePath/"wx" already
    // make output collisions non-destructive; the lock keeps a second operation
    // from racing the same file at all.
    const parsed = path.parse(filePath);
    try {
        OperationRegistry.register(operationId, crypto, [
            filePath,
            path.join(parsed.dir, parsed.name + Constants.POINT_EXT)
        ]);
    } catch (error) {
        return toCryptoFailure(error, fallbackMessage);
    }
    return runRegisteredOperation(operationId, () =>
        crypto.encrypt(normalizedFile, { value: 0 }, {}, {
            onProgress: value => event.sender.send("crypto:progress", { operationId, value }),
            onStatus: status => event.sender.send("crypto:status", { operationId, status })
        }), fallbackMessage
    );
});

ipcMain.handle("crypto:decrypt", async (event, payload) => {
    if (!isTrustedSender(event, win)) return failure(Codes.SENDER_REJECTED, "Request was rejected.");
    const fallbackMessage = "Incorrect password or the file is corrupted.";
    let filePath, password, operationId;
    try {
        ({ filePath, password, operationId } = normalizeCryptoPayload(payload));
        await assertDecryptSource(filePath);
    } catch (error) {
        return toCryptoFailure(error, fallbackMessage);
    }
    const crypto = new Crypto(password, operationId);
    const normalizedFile = new FileManager(filePath);
    // The output name is only known after the header parse, and the plaintext
    // is staged then moved atomically, so locking the input is enough.
    try {
        OperationRegistry.register(operationId, crypto, [filePath]);
    } catch (error) {
        return toCryptoFailure(error, fallbackMessage);
    }
    return runRegisteredOperation(operationId, () =>
        crypto.decrypt(normalizedFile, { value: 0 }, {
            onProgress: value => event.sender.send("crypto:progress", { operationId, value }),
            onStatus: status => event.sender.send("crypto:status", { operationId, status })
        }), fallbackMessage
    );
});

ipcMain.handle("crypto:cancel", (event, payload) => {
    if (!isTrustedSender(event, win)) return failure(Codes.SENDER_REJECTED, "Request was rejected.");
    try {
        return { ok: true, cancelled: Boolean(OperationRegistry.cancel(validateOperationId(payload))) };
    } catch (error) {
        return toCryptoFailure(error, "Cancel failed.");
    }
});

ipcMain.handle("files:confirm-delete-encrypted", async (_, filePath) => {
    const target = validateDeletePath(filePath);
    const { response } = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["Delete", "Keep"],
        defaultId: 1,
        cancelId: 1,
        title: "Delete encrypted file",
        message: "Decryption successful.",
        detail: "Do you want to delete the encrypted .ctx file?"
    });

    if (response !== 0) return false;

    await fs.promises.unlink(target);
    return true;
});

ipcMain.handle("log:error", (_, error) => {
    logger.error(error);
});

async function runSmokeTest() {
    try {
        const hasBridge = await win.webContents.executeJavaScript(
            "Boolean(window.cryptox && window.cryptox.app && window.cryptox.crypto && window.cryptox.files)"
        );
        if (!hasBridge) {
            throw new Error("Preload bridge is unavailable.");
        }
        logger.info("Cryptox smoke test passed.");
        app.exit(0);
    } catch (error) {
        logger.error(error);
        app.exit(1);
    }
}

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
    if (process.platform === "win32") {
        process.on("message", data => {
            if (data === "graceful-exit") {
                app.quit();
            }
        });
    } else {
        process.on("SIGTERM", () => {
            app.quit();
        });
    }
}
