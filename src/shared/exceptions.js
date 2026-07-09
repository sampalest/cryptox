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

// GCM authentication failure during decrypt: a wrong password or a tampered
// file, cryptographically indistinguishable. The message is a fixed string and
// the original stream error rides along as cause (logged by name only).
export class WrongPasswordError extends Error {
    constructor(cause) {
        super("GCM authentication failed.");
        this.name = "WrongPasswordError";
        this.cause = cause;
    }
}

export class CancelledError extends Error {
    constructor(message = "Operation cancelled") {
        super(message);
        this.name = "CancelledError";
        this.cancelled = true;
    }
}