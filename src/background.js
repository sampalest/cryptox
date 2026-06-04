"use strict";

import { app, protocol, BrowserWindow, Menu, dialog, ipcMain, shell } from "electron";
import createProtocol from "vue-cli-plugin-electron-builder/lib/createProtocol";
import path from "path";
import Crypto from "./crypto.js";
import FileManager from "./filemanager.js";
const isDevelopment = process.env.NODE_ENV !== "production";
const logger = require("electron-log");

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;
let pendingOpenFile = null;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{scheme: "app", privileges: { secure: true, standard: true } }]);

function sendToRenderer(channel, payload) {
    if (win && win.webContents) {
        win.webContents.send(channel, payload);
    }
}

function openFile(file) {
    if (!file) return;
    if (!app.isReady() || !win) {
        pendingOpenFile = file;
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
            preload: path.join(__dirname, "preload.js")
        }
    });

    if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
        win.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
        if (!process.env.IS_TEST) win.webContents.openDevTools();
    } else {
        createProtocol("app");
        // Load the index.html when not in development
        win.loadURL("app://./index.html");
    }

    win.on("closed", () => {
        win = null;
    });

    win.webContents.once("did-finish-load", () => {
        if (pendingOpenFile) {
            sendToRenderer("files:open-file", pendingOpenFile);
            pendingOpenFile = null;
        }
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

ipcMain.handle("shell:open-external", (_, url) => shell.openExternal(url));

ipcMain.handle("crypto:encrypt", async (event, { file, password, operationId }) => {
    const crypto = new Crypto(password);
    const normalizedFile = new FileManager(file.path);
    await crypto.encrypt(normalizedFile, { value: 0 }, {}, {
        onProgress: value => event.sender.send("crypto:progress", { operationId, value }),
        onStatus: status => event.sender.send("crypto:status", { operationId, status })
    });
});

ipcMain.handle("crypto:decrypt", async (event, { file, password, operationId }) => {
    const crypto = new Crypto(password);
    const normalizedFile = new FileManager(file.path);
    await crypto.decrypt(normalizedFile, { value: 0 }, {
        onProgress: value => event.sender.send("crypto:progress", { operationId, value })
    });
});

ipcMain.handle("log:error", (_, error) => {
    logger.error(error);
});

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
