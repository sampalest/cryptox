export function NoValidPassword(message) {
    this.message = message;
    this.name = "NoValidPassword";
}

export function DecryptError(message) {
    this.message = message;
    this.name = "DecryptError";
}

export class CancelledError extends Error {
    constructor(message = "Operation cancelled") {
        super(message);
        this.name = "CancelledError";
        this.cancelled = true;
    }
}