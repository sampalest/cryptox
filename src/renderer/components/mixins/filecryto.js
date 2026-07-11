import { useDeleteBehaviorStore } from "@/store/deleteBehavior";
import { useErasePolicyStore } from "@/store/erasePolicy";
import { useTimeSourceStore } from "@/store/timeSource";
import { useToastStore } from "@/store/toasts";

// Every CRYPTO_ERROR_CODES value maps to a deliberate string for both kinds, so
// no code ever falls through to a generic message (SENDER_REJECTED and
// INVALID_PAYLOAD were previously unmapped). WRONG_PASSWORD and FILE_ERASED
// are decrypt-only in practice; the encrypt entries exist to keep the map total.
const FAILURE_MESSAGES = {
    encrypt: {
        SENDER_REJECTED: "The request was rejected.",
        INVALID_PAYLOAD: "The request was invalid.",
        FILE_NOT_FOUND: "The file could not be found.",
        INVALID_FILE_TYPE: "This file cannot be encrypted.",
        OPERATION_FAILED: "Encryption failed.",
        WRONG_PASSWORD: "Encryption failed.",
        FILE_ERASED: "Encryption failed.",
        FILE_EXPIRED: "Encryption failed.",
        TIME_UNAVAILABLE: "Encryption failed."
    },
    decrypt: {
        SENDER_REJECTED: "The request was rejected.",
        INVALID_PAYLOAD: "The request was invalid.",
        FILE_NOT_FOUND: "The file could not be found.",
        INVALID_FILE_TYPE: "Only .dino and .ctx files can be decrypted.",
        OPERATION_FAILED: "Incorrect password or the file is corrupted.",
        WRONG_PASSWORD: "Incorrect password or the file is corrupted.",
        FILE_ERASED: "This file was erased because the failed-attempt limit was reached.",
        FILE_EXPIRED: "This file has expired and can no longer be decrypted.",
        TIME_UNAVAILABLE: "The trusted time source could not be reached, and your settings block decrypting expiring files without it."
    }
};

// The attempts count is computed by the main process, never user content.
function wrongPasswordAlert(result) {
    if (Number.isInteger(result.attemptsRemaining) && result.attemptsRemaining > 0) {
        const plural = result.attemptsRemaining === 1 ? "attempt" : "attempts";
        return `Incorrect password. ${result.attemptsRemaining} ${plural} remaining before this file is permanently erased.`;
    }
    return FAILURE_MESSAGES.decrypt.WRONG_PASSWORD;
}

// expiresAt is a numeric instant read from the authenticated header and
// forwarded by the main process; formatting stays renderer-side.
function expiredAlert(result) {
    let message = FAILURE_MESSAGES.decrypt.FILE_EXPIRED;
    if (Number.isSafeInteger(result.expiresAt)) {
        message = `This file expired on ${new Date(result.expiresAt).toLocaleString()} and can no longer be decrypted.`;
    }
    if (result.trustedTimeUnavailable) {
        message = `${message} The time server was unreachable, so the system clock was used.`;
    }
    return message;
}

const POLICY_ERROR_NOTE = "The failed-attempt protection could not update this file.";

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
                window.lockasaur.crypto.cancel(operationId).catch(err => window.lockasaur.log.error(err));
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
            window.lockasaur.log.error(`crypto ${kind} failed: ${code || "NO_RESULT"}`);
            const messages = FAILURE_MESSAGES[kind];
            let message = messages[code] || (result && result.message) || "The operation failed.";
            if (kind === "decrypt" && code === "WRONG_PASSWORD") message = wrongPasswordAlert(result);
            if (kind === "decrypt" && code === "FILE_EXPIRED") message = expiredAlert(result);
            if (result && result.policyError) message = `${message} ${POLICY_ERROR_NOTE}`;
            useToastStore().error(message);
            // A wrong password with attempts left keeps the selection loaded and
            // returns to the password screen; attemptsRemaining 0 means the
            // failed-attempt limit was hit, which unloads like any other failure.
            if (kind === "decrypt" && code === "WRONG_PASSWORD" && !(Number.isInteger(result.attemptsRemaining) && result.attemptsRemaining <= 0)) {
                return this.retryPassword();
            }
            this.cancel();
        },
        encryptFile(file) {
            const operationId = this.operationId();
            const offProgress = window.lockasaur.crypto.onProgress(payload => {
                if (payload.operationId === operationId) this.percent.value = payload.value;
            });
            const offStatus = window.lockasaur.crypto.onStatus(payload => {
                if (payload.operationId === operationId) Object.assign(this.fileEvent, payload.status);
            });
            this.addHandlers(offProgress, offStatus);

            this.trackOperation(operationId);
            // Rebuilt as a plain object: this.expiration is a Vue reactive
            // Proxy (Home data), and proxies fail the contextBridge clone.
            const expiration = this.expiration ? { at: this.expiration.at } : undefined;
            window.lockasaur.crypto.encrypt({ path: file.path }, this.password, operationId, useErasePolicyStore().policyPayload, expiration).then(async result => {
                if (!result || result.ok === false) return this.handleCryptoFailure("encrypt", result);
                // A cancelled operation must never count as a success.
                if (result.cancelled) return;
                // Encryption already succeeded; a failed delete must not be
                // reported as an encrypt error, so keep it isolated from the catch below.
                try {
                    const behavior = useDeleteBehaviorStore();
                    const res = await window.lockasaur.files.confirmDeleteOriginal(file.path, behavior.mode, behavior.deleteOriginal);
                    if (res && res.error) useToastStore().warning("The original could not be deleted. You can remove it manually.");
                } catch (deleteErr) {
                    window.lockasaur.log.error(deleteErr);
                }
                this.fileEvent.counter++;

                if (this.fileEvent.counter == this.files.length) this.finish = true;
            }).catch(() => {
                // Transport-level safety net; structured failures resolve above.
                window.lockasaur.log.error("crypto encrypt failed: IPC_TRANSPORT");
                useToastStore().error("Encryption failed.");
                this.cancel();
            }).finally(() => {
                this.untrackOperation(operationId);
                this.releaseHandlers([offProgress, offStatus]);
            });
        },
        decryptFile(file) {
            const operationId = this.operationId();
            const offProgress = window.lockasaur.crypto.onProgress(payload => {
                if (payload.operationId === operationId) this.percent.value = payload.value;
            });
            const offStatus = window.lockasaur.crypto.onStatus(payload => {
                if (payload.operationId === operationId) Object.assign(this.fileEvent, payload.status);
            });
            this.addHandlers(offProgress, offStatus);

            this.trackOperation(operationId);
            window.lockasaur.crypto.decrypt({ path: file.path }, this.password, operationId, useTimeSourceStore().sourcePayload)
                .then(async result => {
                    if (!result || result.ok === false) return this.handleCryptoFailure("decrypt", result);
                    // A cancelled operation must never count as a success.
                    if (result.cancelled) return;
                    // Decrypt succeeded but the failed-attempt counter could not
                    // be reset: warn, or the next typo could erase the file.
                    if (result.policyError) useToastStore().warning(POLICY_ERROR_NOTE);
                    // Decryption already succeeded; a failed delete must not be reported
                    // as a decrypt error, so keep it isolated from the catch below.
                    try {
                        const behavior = useDeleteBehaviorStore();
                        const res = await window.lockasaur.files.confirmDeleteEncrypted(file.path, behavior.mode, behavior.deleteEncrypted);
                        if (res && res.error) useToastStore().warning("The encrypted file could not be deleted. You can remove it manually.");
                    } catch (deleteErr) {
                        window.lockasaur.log.error(deleteErr);
                    }
                    // Mirror encrypt: finish only once every selected file is done,
                    // so a multi-file decrypt does not tear the loader down after
                    // the first file while others are still in flight.
                    this.fileEvent.counter++;
                    if (this.fileEvent.counter == this.files.length) this.finish = true;
                })
                .catch(() => {
                    // Transport-level safety net; structured failures resolve above.
                    window.lockasaur.log.error("crypto decrypt failed: IPC_TRANSPORT");
                    useToastStore().error("Incorrect password or the file is corrupted.");
                    this.cancel();
                })
                .finally(() => {
                    this.untrackOperation(operationId);
                    this.releaseHandlers([offProgress, offStatus]);
                });
        }
    }
};
