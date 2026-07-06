// Every CRYPTO_ERROR_CODES value maps to a deliberate string for both kinds, so
// no code ever falls through to a generic message (SENDER_REJECTED and
// INVALID_PAYLOAD were previously unmapped).
const FAILURE_MESSAGES = {
    encrypt: {
        SENDER_REJECTED: "The request was rejected.",
        INVALID_PAYLOAD: "The request was invalid.",
        FILE_NOT_FOUND: "The file could not be found.",
        INVALID_FILE_TYPE: "This file cannot be encrypted.",
        OPERATION_FAILED: "Encryption failed."
    },
    decrypt: {
        SENDER_REJECTED: "The request was rejected.",
        INVALID_PAYLOAD: "The request was invalid.",
        FILE_NOT_FOUND: "The file could not be found.",
        INVALID_FILE_TYPE: "Only .dino and .ctx files can be decrypted.",
        OPERATION_FAILED: "Incorrect password or the file is corrupted."
    }
};

export default {
    name: "file-crypto",
    data: () => {
        return {
            finish: false,
            activeOperations: [],
            // crypto:progress / crypto:status unsubscribers for in-flight
            // operations, so a component can release them on unmount instead of
            // only when each promise settles (see EncryptLoader.beforeUnmount).
            offHandlers: []
        };
    },
    methods: {
        operationId() {
            return window.crypto.randomUUID();
        },
        trackOperation(operationId) {
            this.activeOperations.push(operationId);
        },
        untrackOperation(operationId) {
            this.activeOperations = this.activeOperations.filter(id => id !== operationId);
        },
        cancelOperations() {
            this.activeOperations.forEach(operationId => {
                window.cryptox.crypto.cancel(operationId).catch(err => window.cryptox.log.error(err));
            });
        },
        addHandlers(...offs) {
            this.offHandlers.push(...offs);
        },
        // Call and forget the given unsubscribers if still registered. Used in
        // each operation's finally; releaseAllHandlers mops up the rest on
        // unmount. Idempotent, so the two paths never double-call an off.
        releaseHandlers(offs) {
            offs.forEach(off => {
                const i = this.offHandlers.indexOf(off);
                if (i !== -1) {
                    this.offHandlers.splice(i, 1);
                    off();
                }
            });
        },
        releaseAllHandlers() {
            this.offHandlers.forEach(off => off());
            this.offHandlers = [];
        },
        // Typed failure from the main process: log only the stable code (the
        // message may be shown but must never be logged with payload content).
        handleCryptoFailure(kind, result) {
            const code = result && result.code;
            window.cryptox.log.error(`crypto ${kind} failed: ${code || "NO_RESULT"}`);
            const messages = FAILURE_MESSAGES[kind];
            alert(messages[code] || (result && result.message) || "The operation failed.");
            this.cancel();
        },
        encryptFile(file) {
            const operationId = this.operationId();
            const offProgress = window.cryptox.crypto.onProgress(payload => {
                if (payload.operationId === operationId) this.percent.value = payload.value;
            });
            const offStatus = window.cryptox.crypto.onStatus(payload => {
                if (payload.operationId === operationId) Object.assign(this.fileEvent, payload.status);
            });
            this.addHandlers(offProgress, offStatus);

            this.trackOperation(operationId);
            window.cryptox.crypto.encrypt({ path: file.path }, this.password, operationId).then(result => {
                if (!result || result.ok === false) return this.handleCryptoFailure("encrypt", result);
                // A cancelled operation must never count as a success.
                if (result.cancelled) return;
                this.fileEvent.counter++;

                if (this.fileEvent.counter == this.files.length) this.finish = true;
            }).catch(() => {
                // Transport-level safety net; structured failures resolve above.
                window.cryptox.log.error("crypto encrypt failed: IPC_TRANSPORT");
                alert("Encryption failed.");
                this.cancel();
            }).finally(() => {
                this.untrackOperation(operationId);
                this.releaseHandlers([offProgress, offStatus]);
            });
        },
        decryptFile(file) {
            const operationId = this.operationId();
            const offProgress = window.cryptox.crypto.onProgress(payload => {
                if (payload.operationId === operationId) this.percent.value = payload.value;
            });
            const offStatus = window.cryptox.crypto.onStatus(payload => {
                if (payload.operationId === operationId) Object.assign(this.fileEvent, payload.status);
            });
            this.addHandlers(offProgress, offStatus);

            this.trackOperation(operationId);
            window.cryptox.crypto.decrypt({ path: file.path }, this.password, operationId)
                .then(async result => {
                    if (!result || result.ok === false) return this.handleCryptoFailure("decrypt", result);
                    // A cancelled operation must never count as a success.
                    if (result.cancelled) return;
                    // Decryption already succeeded; a failed delete prompt must not be reported
                    // as a decrypt error, so keep it isolated from the catch below.
                    try {
                        await window.cryptox.files.confirmDeleteEncrypted(file.path);
                    } catch (deleteErr) {
                        window.cryptox.log.error(deleteErr);
                    }
                    // Mirror encrypt: finish only once every selected file is done,
                    // so a multi-file decrypt does not tear the loader down after
                    // the first file while others are still in flight.
                    this.fileEvent.counter++;
                    if (this.fileEvent.counter == this.files.length) this.finish = true;
                })
                .catch(() => {
                    // Transport-level safety net; structured failures resolve above.
                    window.cryptox.log.error("crypto decrypt failed: IPC_TRANSPORT");
                    alert("Incorrect password or the file is corrupted.");
                    this.cancel();
                })
                .finally(() => {
                    this.untrackOperation(operationId);
                    this.releaseHandlers([offProgress, offStatus]);
                });
        }
    }
};
