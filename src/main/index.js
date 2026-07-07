"use strict";

import { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, shell } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import Constants from "../shared/constants.js";
import Crypto from "./crypto.js";
import FileManager from "../shared/filemanager.js";
import OperationRegistry from "./operations.js";
import TempManager from "./temp.js";
import {
    assertDecryptSource,
    assertEncryptSource,
    isTrustedSender,
    normalizeAppIconId,
    normalizeCryptoPayload,
    normalizeOpenDialogKind,
    validateDeletePath,
    validateExternalUrl,
    validateOperationId,
    validateOriginalDeletePath
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
    if (process.platform !== "darwin") {
        Menu.setApplicationMenu(null);
        return;
    }

    const template = [];

    template.push({
        label: app.name,
        submenu: [
            {
                label: "About Lockasaur",
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

// The window is created hidden and shown on the first of three
// signals, so launch never flashes an empty transparent frame: ready-to-show
// (normal path), files:renderer-ready (fallback: ready-to-show has a history
// of firing late for transparent frameless windows on Win/Linux), or a safety
// timer (a broken renderer must never leave an invisible app).
function showWindowWhenReady() {
    if (win && !win.isDestroyed() && !win.isVisible()) {
        win.show();
    }
}

function createWindow () {
    rendererReady = false;
    const useCustomFrame = process.platform === "win32" || process.platform === "linux";
    // APP-12: every platform runs a transparent window whose visible frame is
    // the CSS-rounded #app. macOS keeps its native traffic lights ("hidden"
    // titlebar style, repositioned into the 42px chrome bar); Win/Linux are
    // fully frameless with custom controls in the renderer titlebar.
    win = new BrowserWindow({
        width: 700,
        // 660 = the design's 618px content area + the 42px in-app titlebar, so
        // the tallest screen (home) keeps top/bottom margin without clipping
        // (the window is fixed-size, so content must fit; APP-12).
        height: 660,
        title: "Lockasaur",
        show: false,
        frame: !useCustomFrame,
        transparent: true,
        backgroundColor: "#00000000",
        titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
        trafficLightPosition: { x: 14, y: 14 },
        resizable: false,
        maximizable: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            preload: path.join(runtimeDir, "preload.cjs")
        }
    });

    // Deny by default: this app needs no web permissions (geolocation, media,
    // notifications, devices). Electron would otherwise auto-grant some of these
    // for trusted content, so a future renderer regression cannot acquire them.
    const { session } = win.webContents;
    session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    session.setDevicePermissionHandler(() => false);

    // The app never opens child windows; external links go through the
    // shell:open-external allowlist instead.
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    // Only the dev server (dev) or the bundled index.html (prod) may load.
    const allowedNavigationUrl = process.env.VITE_DEV_SERVER_URL
        ? new URL(process.env.VITE_DEV_SERVER_URL).origin
        : pathToFileURL(path.join(runtimeDir, "..", "dist", "index.html")).href;
    win.webContents.on("will-navigate", (event, url) => {
        const target = process.env.VITE_DEV_SERVER_URL ? new URL(url).origin : url;
        if (target !== allowedNavigationUrl) {
            logger.error("Blocked unexpected renderer navigation.");
            event.preventDefault();
        }
    });

    win.once("ready-to-show", showWindowWhenReady);
    const showFallbackTimer = setTimeout(showWindowWhenReady, 2000);

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
        if (!process.env.IS_TEST) win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(runtimeDir, "..", "dist", "index.html"));
    }

    win.on("closed", () => {
        clearTimeout(showFallbackTimer);
        win = null;
        rendererReady = false;
    });
}
app.name = "Lockasaur";
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
    if (!isTrustedSender(event, win)) return;
    rendererReady = true;
    showWindowWhenReady();
    flushPendingOpenFiles();
    if (process.env.LOCKASAUR_SMOKE_TEST) {
        runSmokeTest();
    }
});

ipcMain.handle("app:info", event => {
    if (!isTrustedSender(event, win)) return undefined;
    return {
        locale: app.getLocale(),
        name: app.name,
        platform: process.platform
    };
});

// CTX-17: the Settings icon picker (macOS Dock icon only). The renderer sends
// an allowlisted id, never a path; it resolves against the PNGs bundled under
// dist/appicons (public/appicons in dev, mirroring how index.html is located).
const appIconsDir = process.env.VITE_DEV_SERVER_URL
    ? path.join(runtimeDir, "..", "public", "appicons")
    : path.join(runtimeDir, "..", "dist", "appicons");

ipcMain.handle("app:set-icon", (event, iconId) => {
    if (!isTrustedSender(event, win)) return false;
    const id = normalizeAppIconId(iconId);
    if (!id || process.platform !== "darwin" || !app.dock) return false;
    try {
        if (id === "default") {
            // Reset to the bundle icon: a static image would freeze one
            // appearance, while the bundle's Assets.car keeps the Dock icon
            // following the system light/dark appearance on macOS 26+.
            app.dock.setIcon(null);
            return true;
        }
        const image = nativeImage.createFromPath(path.join(appIconsDir, `${id}.png`));
        if (image.isEmpty()) return false;
        app.dock.setIcon(image);
        return true;
    } catch {
        // Fixed string: the renderer-supplied value stays out of the log.
        logger.error("app:set-icon failed");
        return false;
    }
});

ipcMain.handle("window:minimize", event => {
    if (!isTrustedSender(event, win)) return;
    win.minimize();
});

ipcMain.handle("window:close", event => {
    if (!isTrustedSender(event, win)) return;
    win.close();
});

ipcMain.handle("dialog:open-files", async (event, kind) => {
    if (!isTrustedSender(event, win)) return [];
    const dialogKind = normalizeOpenDialogKind(kind);
    if (!dialogKind) return [];

    // One dialog can select both files and folders only on macOS; Windows and
    // Linux degrade ["openFile", "openDirectory"] to a folder-only picker, so
    // there "files" stays file-only and folders come in via the "folder" kind
    // (the Select Folder button).
    const properties = dialogKind === "folder"
        ? ["openDirectory", "multiSelections"]
        : process.platform === "darwin"
            ? ["openFile", "openDirectory", "multiSelections"]
            : ["openFile", "multiSelections"];

    const files = await dialog.showOpenDialog(win, {
        properties,
        filters: [{
            name: "All Files", extensions: ["*"]
        }]
    });

    return files.filePaths;
});

ipcMain.handle("shell:open-external", (event, url) => {
    if (!isTrustedSender(event, win)) return undefined;
    return shell.openExternal(validateExternalUrl(url));
});

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

// Sources of successfully completed encrypt operations, eligible for the
// post-encrypt delete prompt. Recorded only by the main process and consumed
// one prompt per entry, so the renderer can never request deletion of a path
// it did not just encrypt.
const deletableOriginals = new Set();

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
    const result = await runRegisteredOperation(operationId, () =>
        crypto.encrypt(normalizedFile, { value: 0 }, {}, {
            onProgress: value => event.sender.send("crypto:progress", { operationId, value }),
            onStatus: status => event.sender.send("crypto:status", { operationId, status })
        }), fallbackMessage
    );
    // Only a fully completed encrypt makes its source deletable; a cancelled
    // or failed operation must leave the original untouchable.
    if (result.ok && !result.cancelled) deletableOriginals.add(filePath);
    return result;
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

ipcMain.handle("files:confirm-delete-encrypted", async (event, filePath) => {
    if (!isTrustedSender(event, win)) return { deleted: false };
    const target = validateDeletePath(filePath);
    const { response } = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["Delete", "Keep"],
        defaultId: 1,
        cancelId: 1,
        title: "Delete encrypted file",
        message: "Decryption successful.",
        detail: "Do you want to delete the encrypted file?"
    });

    if (response !== 0) return { deleted: false };

    // The encrypted file is ciphertext, so the system Trash is safe to use
    // here (unlike the plaintext original in files:confirm-delete-original,
    // which must be removed permanently). Trash is the native, iCloud- and
    // permission-aware deletion path: a raw unlink fails on files Finder itself
    // cannot remove (iCloud-managed, restricted), which previously left the
    // file silently in place. Fall back to a permanent unlink where Trash is
    // unavailable (e.g. some Linux setups), and report failure so the renderer
    // can tell the user rather than pretending the file was removed.
    try {
        await shell.trashItem(target);
        return { deleted: true };
    } catch (trashError) {
        try {
            await fs.promises.unlink(target);
            return { deleted: true };
        } catch (unlinkError) {
            logger.error("files:confirm-delete-encrypted could not remove the file");
            return { deleted: false, error: true };
        }
    }
});

ipcMain.handle("files:confirm-delete-original", async (event, filePath) => {
    if (!isTrustedSender(event, win)) return false;
    const target = validateOriginalDeletePath(filePath, deletableOriginals);
    // Single-use: whatever the user answers, the same path cannot be
    // prompted for again without another completed encrypt.
    deletableOriginals.delete(target);
    const { response } = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["Delete", "Keep"],
        defaultId: 1,
        cancelId: 1,
        title: "Delete original",
        message: "Encryption successful.",
        detail: "Do you want to permanently delete the original? The encrypted file will be kept."
    });

    if (response !== 0) return false;

    // Re-lstat at delete time: the recorded path must still be the regular
    // file or folder that was encrypted, not a symlink swapped in afterwards.
    const stats = await fs.promises.lstat(target);
    if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) return false;
    // Permanent removal rather than the system trash: parking the plaintext
    // in the trash would defeat the point of encrypting it.
    await fs.promises.rm(target, { recursive: true });
    return true;
});

ipcMain.handle("log:error", (event, error) => {
    if (!isTrustedSender(event, win)) return;
    logger.error(error);
});

async function runSmokeTest() {
    try {
        const hasBridge = await win.webContents.executeJavaScript(
            "Boolean(window.lockasaur && window.lockasaur.app && window.lockasaur.crypto && window.lockasaur.files)"
        );
        if (!hasBridge) {
            throw new Error("Preload bridge is unavailable.");
        }
        // setWindowOpenHandler must deny renderer-initiated windows.
        await win.webContents.executeJavaScript("window.open(\"https://example.com\"); 0");
        if (BrowserWindow.getAllWindows().length !== 1) {
            throw new Error("Renderer was able to open a new window.");
        }
        // app:set-icon applies an allowlisted id on macOS (an inert false
        // elsewhere) and rejects anything outside the allowlist (CTX-17).
        const [validIcon, invalidIcon] = await win.webContents.executeJavaScript(
            "Promise.all([window.lockasaur.app.setIcon(\"dark\"), window.lockasaur.app.setIcon(\"../evil\")])"
        );
        if (validIcon !== (process.platform === "darwin") || invalidIcon !== false) {
            throw new Error("app:set-icon did not behave as expected.");
        }
        logger.info("Lockasaur smoke test passed.");
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
