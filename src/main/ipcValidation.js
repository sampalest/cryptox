import fs from "fs";
import Constants from "../shared/constants.js";
import { IpcValidationError } from "../shared/exceptions.js";

const Codes = Constants.CRYPTO_ERROR_CODES;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const ALLOWED_EXTERNAL_URLS = new Set([
    "https://github.com/Samuelpe/cryptox",
    "https://github.com/sampalest/cryptox"
]);

export function validateDeletePath(value) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new TypeError("Delete path must be a non-empty string.");
    }

    if (!value.endsWith(Constants.POINT_EXT)) {
        throw new Error(`Only ${Constants.POINT_EXT} files may be deleted.`);
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
    if (filePath.endsWith(Constants.POINT_EXT)) {
        throw new IpcValidationError(Codes.INVALID_FILE_TYPE, `${Constants.POINT_EXT} files are already encrypted.`);
    }
}

export async function assertDecryptSource(filePath) {
    const stats = await statSource(filePath);
    // isFile is false for a symlink under lstat, so symlinked sources are rejected.
    if (!stats.isFile() || !filePath.endsWith(Constants.POINT_EXT)) {
        throw new IpcValidationError(Codes.INVALID_FILE_TYPE, `Only ${Constants.POINT_EXT} files can be decrypted.`);
    }
}
