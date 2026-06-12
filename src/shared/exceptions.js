export function NoValidPassword(message) {
    this.message = message;
    this.name = "NoValidPassword";
}

export function DecryptError(message) {
    this.message = message;
    this.name = "DecryptError";
}

export class IpcValidationError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "IpcValidationError";
        this.code = code;
    }
}

export class CancelledError extends Error {
    constructor(message = "Operation cancelled") {
        super(message);
        this.name = "CancelledError";
        this.cancelled = true;
    }
}