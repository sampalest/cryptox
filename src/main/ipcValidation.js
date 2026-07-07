import fs from "fs";
import Constants from "../shared/constants.js";
import { IpcValidationError } from "../shared/exceptions.js";

const Codes = Constants.CRYPTO_ERROR_CODES;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const ALLOWED_EXTERNAL_URLS = new Set([
    "https://github.com/sampalest/cryptox"
]);

// The open-dialog kind is renderer-supplied, so it is allowlisted. Undefined
// (the menu's plain "open" invoke) means "files"; anything else unexpected
// returns null and the handler answers with an inert empty selection.
const OPEN_DIALOG_KINDS = new Set(["files", "folder"]);

export function normalizeOpenDialogKind(value) {
    if (value === undefined) return "files";
    return OPEN_DIALOG_KINDS.has(value) ? value : null;
}

// CTX-17: the app:set-icon handler resolves the id to a bundled PNG, so the
// renderer-supplied value is allowlisted rather than used as a path fragment.
// Ids mirror the appearance variants scripts/generate-appicon.mjs writes to
// public/appicons; anything unexpected returns null and the handler answers
// with an inert false.
const APP_ICON_IDS = new Set(["default", "dark", "clear-light", "clear-dark", "tinted-light", "tinted-dark"]);

export function normalizeAppIconId(value) {
    return APP_ICON_IDS.has(value) ? value : null;
}

export function validateDeletePath(value) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new TypeError("Delete path must be a non-empty string.");
    }

    // .dino or the legacy .ctx: both are app-produced encrypted files the
    // post-decrypt prompt may offer to delete.
    if (!Constants.ENCRYPTED_POINT_EXTS.some(ext => value.endsWith(ext))) {
        throw new Error("Only encrypted files may be deleted.");
    }

    return value;
}

// The post-encrypt delete prompt may only target a source path the main
// process itself recorded from a successfully completed encrypt operation,
// so a hostile renderer can never steer deletion toward an arbitrary path.
// The caller owns the recorded set and consumes entries once prompted.
export function validateOriginalDeletePath(value, allowedPaths) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new TypeError("Delete path must be a non-empty string.");
    }

    if (!allowedPaths || !allowedPaths.has(value)) {
        throw new Error("Only just-encrypted originals may be deleted.");
    }

    return value;
}

export function validateExternalUrl(value) {
    if (typeof value !== "string") {
        throw new TypeError("External URL must be a string.");
    }

    const url = new URL(value);
    if (url.protocol !== "https:" || !ALLOWED_EXTERNAL_URLS.has(url.href.replace(/\/$/, ""))) {
        throw new Error("External URL is not allowed.");
    }

    return url.href.replace(/\/$/, "");
}

// Only the app window may drive crypto operations. Any other WebContents
// (devtools, a compromised webview, a second window) is rejected.
export function isTrustedSender(event, win) {
    return Boolean(
        win &&
        !win.isDestroyed() &&
        event &&
        event.sender === win.webContents
    );
}

export function normalizeCryptoPayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new IpcValidationError(Codes.INVALID_PAYLOAD, "Crypto payload must be an object.");
    }

    const filePath = payload.file && payload.file.path;
    if (typeof filePath !== "string" || filePath.trim() === "") {
        throw new IpcValidationError(Codes.INVALID_PAYLOAD, "Crypto file path must be a non-empty string.");
    }

    if (typeof payload.password !== "string" || payload.password.length === 0) {
        throw new IpcValidationError(Codes.INVALID_PAYLOAD, "Crypto password must be a non-empty string.");
    }

    return {
        filePath,
        password: payload.password,
        operationId: validateOperationId(payload.operationId)
    };
}

export function validateOperationId(value) {
    if (typeof value !== "string" || !OPERATION_ID_PATTERN.test(value)) {
        throw new IpcValidationError(
            Codes.INVALID_PAYLOAD,
            "Crypto operation id must be 1-64 characters from [A-Za-z0-9_-]."
        );
    }

    return value;
}

// Stat the source before anything is locked or started. Messages stay fixed
// strings: the user-supplied path must not leak into errors or logs.
async function statSource(filePath) {
    try {
        // lstat, not stat: do not follow symlinks. The encrypt path later uses
        // Utils.isDirectory (also lstat), so validating with stat would diverge,
        // a symlinked directory passing here then being stream-encrypted as its
        // link target. A symlink reports neither isFile nor isDirectory, so the
        // type checks below reject it instead.
        return await fs.promises.lstat(filePath);
    } catch (error) {
        if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
            throw new IpcValidationError(Codes.FILE_NOT_FOUND, "Source file was not found.");
        }
        throw new IpcValidationError(Codes.OPERATION_FAILED, "Source file could not be read.");
    }
}

export async function assertEncryptSource(filePath) {
    const stats = await statSource(filePath);
    if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) {
        throw new IpcValidationError(Codes.INVALID_FILE_TYPE, "Only regular files and folders can be encrypted.");
    }
    // Reject the legacy extension too, or a .ctx could be re-encrypted into a
    // nested .ctx.dino.
    if (Constants.ENCRYPTED_POINT_EXTS.some(ext => filePath.endsWith(ext))) {
        throw new IpcValidationError(Codes.INVALID_FILE_TYPE, "This file is already encrypted.");
    }
}

export async function assertDecryptSource(filePath) {
    const stats = await statSource(filePath);
    // isFile is false for a symlink under lstat, so symlinked sources are rejected.
    if (!stats.isFile() || !Constants.ENCRYPTED_POINT_EXTS.some(ext => filePath.endsWith(ext))) {
        throw new IpcValidationError(Codes.INVALID_FILE_TYPE, "Only .dino and .ctx files can be decrypted.");
    }
}
