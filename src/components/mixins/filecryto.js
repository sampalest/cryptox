import Crypto from "../../crypto.js";
export default {
    name: "file-crypto",
    data: () => {
        return {
            finish: false
        };
    },
    methods: {
        encryptFile() {
            const crypto = new Crypto(this.password);
            this.files.forEach(file => {
                crypto.encrypt(file.path, this.percent).then(() => {
                    this.finish = true;
                });
            });
        },
        decryptFile() {
            const crypto = new Crypto(this.password);
            this.files.forEach(file => {
                crypto.decrypt(file.path, this.percent).then(() => {
                    this.finish = true;
                });
            });
        }
    }
};