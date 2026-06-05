"use strict";

import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import Crypto from "./crypto.js";
import FileManager from "./filemanager.js";
import { normalizeCryptoPayload, validateExternalUrl } from "./ipcValidation.js";
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
    platform: process.platform,
    tempPath: app.getPath("temp")
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

ipcMain.handle("crypto:encrypt", async (event, payload) => {
    const { filePath, password, operationId } = normalizeCryptoPayload(payload);
    const crypto = new Crypto(password);
    const normalizedFile = new FileManager(filePath);
    await crypto.encrypt(normalizedFile, { value: 0 }, {}, {
        onProgress: value => event.sender.send("crypto:progress", { operationId, value }),
        onStatus: status => event.sender.send("crypto:status", { operationId, status })
    });
});

ipcMain.handle("crypto:decrypt", async (event, payload) => {
    const { filePath, password, operationId } = normalizeCryptoPayload(payload);
    const crypto = new Crypto(password);
    const normalizedFile = new FileManager(filePath);
    await crypto.decrypt(normalizedFile, { value: 0 }, {
        onProgress: value => event.sender.send("crypto:progress", { operationId, value })
    });
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
