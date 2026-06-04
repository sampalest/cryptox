export default {
    name: "file-crypto",
    data: () => {
        return {
            finish: false
        };
    },
    methods: {
        operationId(file) {
            return `${Date.now()}-${file.path}`;
        },
        encryptFile(file) {
            const operationId = this.operationId(file);
            const offProgress = window.cryptox.crypto.onProgress(payload => {
                if (payload.operationId === operationId) this.percent.value = payload.value;
            });
            const offStatus = window.cryptox.crypto.onStatus(payload => {
                if (payload.operationId === operationId) Object.assign(this.fileEvent, payload.status);
            });

            window.cryptox.crypto.encrypt(file, this.password, operationId).then(() => {
                this.fileEvent.counter++;
                
                if (this.fileEvent.counter == this.files.length) this.finish = true;
            }).finally(() => {
                offProgress();
                offStatus();
            });
        },
        decryptFile(file) {
            const operationId = this.operationId(file);
            const offProgress = window.cryptox.crypto.onProgress(payload => {
                if (payload.operationId === operationId) this.percent.value = payload.value;
            });

            window.cryptox.crypto.decrypt(file, this.password, operationId)
                .then(() => {
                    this.finish = true;
                })
                .catch(err => {
                    alert("Decrypt error, please try again.");
                    window.cryptox.log.error(err);
                    this.finish = true;
                })
                .finally(() => {
                    offProgress();
                });
        }
    }
};
