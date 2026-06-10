export default {
    name: "file-crypto",
    data: () => {
        return {
            finish: false,
            activeOperations: []
        };
    },
    methods: {
        operationId(file) {
            return `${Date.now()}-${file.path}`;
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
        encryptFile(file) {
            const operationId = this.operationId(file);
            const offProgress = window.cryptox.crypto.onProgress(payload => {
                if (payload.operationId === operationId) this.percent.value = payload.value;
            });
            const offStatus = window.cryptox.crypto.onStatus(payload => {
                if (payload.operationId === operationId) Object.assign(this.fileEvent, payload.status);
            });

            this.trackOperation(operationId);
            window.cryptox.crypto.encrypt({ path: file.path }, this.password, operationId).then(result => {
                // A cancelled operation must never count as a success.
                if (result && result.cancelled) return;
                this.fileEvent.counter++;

                if (this.fileEvent.counter == this.files.length) this.finish = true;
            }).finally(() => {
                this.untrackOperation(operationId);
                offProgress();
                offStatus();
            });
        },
        decryptFile(file) {
            const operationId = this.operationId(file);
            const offProgress = window.cryptox.crypto.onProgress(payload => {
                if (payload.operationId === operationId) this.percent.value = payload.value;
            });
            const offStatus = window.cryptox.crypto.onStatus(payload => {
                if (payload.operationId === operationId) Object.assign(this.fileEvent, payload.status);
            });

            this.trackOperation(operationId);
            window.cryptox.crypto.decrypt({ path: file.path }, this.password, operationId)
                .then(async result => {
                    // A cancelled operation must never count as a success.
                    if (result && result.cancelled) return;
                    // Decryption already succeeded; a failed delete prompt must not be reported
                    // as a decrypt error, so keep it isolated from the catch below.
                    try {
                        await window.cryptox.files.confirmDeleteEncrypted(file.path);
                    } catch (deleteErr) {
                        window.cryptox.log.error(deleteErr);
                    }
                    this.finish = true;
                })
                .catch(err => {
                    window.cryptox.log.error(err);
                    alert("Incorrect password or the file is corrupted.");
                    this.cancel();
                })
                .finally(() => {
                    this.untrackOperation(operationId);
                    offProgress();
                    offStatus();
                });
        }
    }
};
