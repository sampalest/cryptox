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

export class WrongPasswordError extends Error {
    constructor(cause) {
        super("GCM authentication failed.");
        this.name = "WrongPasswordError";
        this.cause = cause;
    }
}

export class ExpiredError extends Error {
    constructor() {
        super("File has expired.");
        this.name = "ExpiredError";
    }
}

export class TimeUnavailableError extends Error {
    constructor(cause) {
        super("Trusted time source unavailable.");
        this.name = "TimeUnavailableError";
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