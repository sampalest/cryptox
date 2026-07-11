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

// Decrypt refused because the file's authenticated expiration instant has
// passed. Raised outside the decipher-error classification so it is never
// wrapped as WrongPasswordError and never burns erase-policy attempts.
export class ExpiredError extends Error {
    constructor() {
        super("File has expired.");
        this.name = "ExpiredError";
    }
}

// The configured trusted time source could not produce a verdict and the user
// chose fail-closed. Fixed message; the failing host never appears in it.
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