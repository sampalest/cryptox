"use strict";

import { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, screen, shell } from "electron";
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
    normalizeDeleteMode,
    normalizeOpenDialogKind,
    normalizeWindowSizeId,
    validateEncryptedDeletePath,
    validateExternalUrl,
    validateOperationId,
    validateOriginalDeletePath
} from "./ipcValidation.js";
import { removeEncrypted, removeOriginal } from "./deletion.js";
const isDevelopment = process.env.NODE_ENV !== "production";
import logger from "electron-log";

const runtimeDir = typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// The fixed window presets the renderer may pick from by allowlisted id
// (window:set-size). Dimensions never cross the IPC boundary: each preset is
// only a zoom factor over the 700x660 design (618px content + 42px titlebar),
// so every size is the same layout scaled proportionally and the CSS viewport
// stays at the design size. L (756x713 visible) still fits a 1366x768 work
// area with a taskbar; XL (875x825) targets larger displays and is refused
// where it cannot fit.
const WINDOW_DESIGN_SIZE = { width: 700, height: 660 };
const WINDOW_SIZE_PRESETS = {
    "default": { zoom: 1 },
    "l": { zoom: 1.08 },
    "xl": { zoom: 1.25 }
};

// The last preset the main process accepted; a recreated window (macOS dock
// activate) comes back at the same size without waiting for the renderer.
let appliedWindowSize = "default";

// OS window bounds for a preset: the visible design plus, on Win/Linux, the
// FRAMELESS_GUTTER on every side (room for the CSS shadow, see createWindow).
// The gutter scales with the zoom like everything else in the CSS viewport.
function windowBoundsForPreset(preset) {
    const gutter = (process.platform === "win32" || process.platform === "linux")
        ? Constants.FRAMELESS_GUTTER : 0;
    return {
        width: Math.round((WINDOW_DESIGN_SIZE.width + gutter * 2) * preset.zoom),
        height: Math.round((WINDOW_DESIGN_SIZE.height + gutter * 2) * preset.zoom)
    };
}

function applyWindowSize(id) {
    if (!win || win.isDestroyed()) return false;
    const preset = WINDOW_SIZE_PRESETS[id];
    const target = windowBoundsForPreset(preset);
    const bounds = win.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    // Refuse presets the current display cannot hold: the renderer store rolls
    // the choice back, so an oversized preset is unavailable rather than broken.
    if (target.width > area.width || target.height > area.height) return false;
    // Keep the window's center where it is, clamped into the work area.
    const x = Math.round(Math.max(area.x, Math.min(bounds.x + (bounds.width - target.width) / 2, area.x + area.width - target.width)));
    const y = Math.round(Math.max(area.y, Math.min(bounds.y + (bounds.height - target.height) / 2, area.y + area.height - target.height)));
    // Zoom first, resize second: Chromium can take a beat to propagate a zoom
    // change, and an unscaled layout inside the already-resized window reads
    // as broken, while the reverse transient hides inside the resize itself.
    win.webContents.setZoomFactor(preset.zoom);
    // min == max pins the size (see createWindow), so the limits must widen
    // before the resize and re-lock after it, with the window kept
    // non-resizable throughout.
    win.setMinimumSize(1, 1);
    win.setMaximumSize(0, 0);
    win.setBounds({ x, y, width: target.width, height: target.height });
    win.setMinimumSize(target.width, target.height);
    win.setMaximumSize(target.width, target.height);
    win.setResizable(false);
    win.setMaximizable(false);
    win.setFullScreenable(false);
    appliedWindowSize = id;
    return true;
}

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
    // Every platform runs a transparent window whose visible frame is
    // the CSS-rounded #app. macOS keeps its native traffic lights ("hidden"
    // titlebar style, repositioned into the 42px chrome bar); Win/Linux are
    // fully frameless with custom controls in the renderer titlebar. On the
    // frameless platforms the window is FRAMELESS_GUTTER larger than #app on
    // every side so the CSS window shadow can paint without being clipped at
    // the window bounds; the visible app stays at the preset's design size
    // (windowBoundsForPreset adds the gutter).
    const initialPreset = WINDOW_SIZE_PRESETS[appliedWindowSize];
    const initial = windowBoundsForPreset(initialPreset);
    win = new BrowserWindow({
        width: initial.width,
        height: initial.height,
        minWidth: initial.width,
        maxWidth: initial.width,
        minHeight: initial.height,
        maxHeight: initial.height,
        title: "Lockasaur",
        show: false,
        frame: !useCustomFrame,
        transparent: true,
        backgroundColor: "#00000000",
        // The shadow on Win/Linux is drawn by the renderer (see master.scss);
        // the OS must not add a rectangular one tracing the transparent bounds.
        hasShadow: !useCustomFrame,
        titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
        trafficLightPosition: { x: 14, y: 14 },
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            // A recreated window (macOS dock activate) keeps the applied
            // preset's zoom without waiting for the renderer to reapply it.
            zoomFactor: initialPreset.zoom,
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

    // Chromium persists per-origin zoom in the profile, which can disagree
    // with the applied preset (e.g. a saved larger preset that no longer fits
    // the display leaves the window at default bounds while the persisted
    // zoom restores the larger factor). The applied preset owns the zoom, so
    // re-assert it on every load.
    win.webContents.on("did-finish-load", () => {
        win.webContents.setZoomFactor(WINDOW_SIZE_PRESETS[appliedWindowSize].zoom);
    });

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

// The Settings icon picker (macOS Dock icon only). The renderer sends
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
        // Electron cannot decode .icns (createFromPath returns an empty
        // image), so the icns equivalent is built by hand: one NativeImage
        // carrying the 512 px file as the 1x representation and the 1024 px
        // @2x file as the retina one, letting macOS pick the right scale
        // instead of upscaling a single bitmap.
        const image = nativeImage.createEmpty();
        for (const [scaleFactor, file] of [[1, `${id}.png`], [2, `${id}@2x.png`]]) {
            const variantPath = path.join(appIconsDir, file);
            if (fs.existsSync(variantPath)) {
                image.addRepresentation({ scaleFactor, buffer: fs.readFileSync(variantPath) });
            }
        }
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

ipcMain.handle("window:set-size", (event, sizeId) => {
    if (!isTrustedSender(event, win)) return false;
    const id = normalizeWindowSizeId(sizeId);
    if (!id) return false;
    try {
        return applyWindowSize(id);
    } catch {
        // Fixed string: the renderer-supplied value stays out of the log.
        logger.error("window:set-size failed");
        return false;
    }
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

// Encrypted sources of successfully completed decrypt operations, eligible for
// the post-decrypt delete. Same one-shot contract as deletableOriginals: the
// renderer can never steer deletion toward a .dino/.ctx path it did not just
// decrypt, which matters now that trash/permanent modes skip the confirm dialog.
const deletableEncrypted = new Set();

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
    const result = await runRegisteredOperation(operationId, () =>
        crypto.decrypt(normalizedFile, { value: 0 }, {
            onProgress: value => event.sender.send("crypto:progress", { operationId, value }),
            onStatus: status => event.sender.send("crypto:status", { operationId, status })
        }), fallbackMessage
    );
    // Only a fully completed decrypt makes its encrypted source deletable; a
    // cancelled or failed operation must leave the ciphertext untouchable.
    if (result.ok && !result.cancelled) deletableEncrypted.add(filePath);
    return result;
});

ipcMain.handle("crypto:cancel", (event, payload) => {
    if (!isTrustedSender(event, win)) return failure(Codes.SENDER_REJECTED, "Request was rejected.");
    try {
        return { ok: true, cancelled: Boolean(OperationRegistry.cancel(validateOperationId(payload))) };
    } catch (error) {
        return toCryptoFailure(error, "Cancel failed.");
    }
});

ipcMain.handle("files:confirm-delete-encrypted", async (event, filePath, mode, requested) => {
    if (!isTrustedSender(event, win)) return { deleted: false };
    const deleteMode = normalizeDeleteMode(mode);
    if (deleteMode === null) return { deleted: false };
    const target = validateEncryptedDeletePath(filePath, deletableEncrypted);
    // Single-use: whatever the mode or answer, the same path cannot be
    // offered again without another completed decrypt.
    deletableEncrypted.delete(target);
    if (deleteMode === "ask") {
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
    } else if (requested !== true) {
        return { deleted: false };
    }
    const result = await removeEncrypted(target, deleteMode === "ask" ? "trash" : deleteMode);
    if (result.error) logger.error("files:confirm-delete-encrypted could not remove the file");
    return result;
});

ipcMain.handle("files:confirm-delete-original", async (event, filePath, mode, requested) => {
    if (!isTrustedSender(event, win)) return { deleted: false };
    const deleteMode = normalizeDeleteMode(mode);
    if (deleteMode === null) return { deleted: false };
    const target = validateOriginalDeletePath(filePath, deletableOriginals);
    // Single-use: whatever the mode or answer, the same path cannot be
    // offered again without another completed encrypt.
    deletableOriginals.delete(target);
    if (deleteMode === "ask") {
        const { response } = await dialog.showMessageBox(win, {
            type: "question",
            buttons: ["Delete", "Keep"],
            defaultId: 1,
            cancelId: 1,
            title: "Delete original",
            message: "Encryption successful.",
            detail: "Do you want to permanently delete the original? The encrypted file will be kept."
        });
        if (response !== 0) return { deleted: false };
    } else if (requested !== true) {
        return { deleted: false };
    }
    const result = await removeOriginal(target, deleteMode === "ask" ? "permanent" : deleteMode);
    if (result.error) logger.error("files:confirm-delete-original could not remove the original");
    return result;
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
        // elsewhere) and rejects anything outside the allowlist.
        const [validIcon, invalidIcon] = await win.webContents.executeJavaScript(
            "Promise.all([window.lockasaur.app.setIcon(\"dark\"), window.lockasaur.app.setIcon(\"../evil\")])"
        );
        if (validIcon !== (process.platform === "darwin") || invalidIcon !== false) {
            throw new Error("app:set-icon did not behave as expected.");
        }
        // Window bounds must include the frameless shadow gutter on Win/Linux
        // and stay at the bare design size on macOS.
        const gutter = (process.platform === "win32" || process.platform === "linux")
            ? Constants.FRAMELESS_GUTTER : 0;
        const [contentWidth, contentHeight] = win.getContentSize();
        if (contentWidth !== 700 + gutter * 2 || contentHeight !== 660 + gutter * 2) {
            throw new Error("Window content size does not match the expected design size.");
        }
        // window:set-size applies only allowlisted preset ids; the default
        // preset is a size-preserving reapply, so the bounds check above
        // still holds afterwards.
        const [validSize, invalidSize] = await win.webContents.executeJavaScript(
            "Promise.all([window.lockasaur.window.setSize(\"default\"), window.lockasaur.window.setSize(\"9999x9999\")])"
        );
        if (validSize !== true || invalidSize !== false) {
            throw new Error("window:set-size did not behave as expected.");
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
