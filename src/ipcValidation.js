import Constants from "./constants.js";

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

export function normalizeCryptoPayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new TypeError("Crypto payload must be an object.");
    }

    const filePath = payload.file && payload.file.path;
    if (typeof filePath !== "string" || filePath.trim() === "") {
        throw new TypeError("Crypto file path must be a non-empty string.");
    }

    if (typeof payload.password !== "string" || payload.password.length === 0) {
        throw new TypeError("Crypto password must be a non-empty string.");
    }

    return {
        filePath,
        password: payload.password,
        operationId: validateOperationId(payload.operationId)
    };
}

export function validateOperationId(value) {
    if (
        typeof value !== "string" ||
        value.trim() === "" ||
        value.length > 1024
    ) {
        throw new TypeError("Crypto operation id must be a non-empty string under 1025 characters.");
    }

    return value;
}
