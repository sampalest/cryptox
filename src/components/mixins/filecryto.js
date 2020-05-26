import Crypto from "../../crypto.js";
import Utils from "../../utils.js";
const logger = require("electron-log");

export default {
    name: "file-crypto",
    data: () => {
        return {
            finish: false
        };
    },
    methods: {
        encryptFile(file) {
            const crypto = new Crypto(this.password);
            crypto.encrypt(file, this.percent, this.fileEvent).then(() => {
                this.fileEvent.counter++;
                
                if (this.fileEvent.counter == this.files.length) {
                    if (Utils.isDirectory(file.path)) Utils.rmRf(this.$parent.tempFiles + "/");
                    this.finish = true;
                }
            });
        },
        decryptFile(file) {
            const crypto = new Crypto(this.password);
            crypto.decrypt(file, this.percent)
                .then(() => {
                    this.finish = true;
                })
                .catch(err => {
                    alert("Decrypt error, please try again.");
                    logger.error(err);
                    this.finish = true;
                });
        }
    }
};