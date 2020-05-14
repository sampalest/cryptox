export function NoValidPassword(message) {
    this.message = message;
    this.name = "NoValidPassword";
}

export function DecryptError(message) {
    this.message = message;
    this.name = "DecryptError";
}