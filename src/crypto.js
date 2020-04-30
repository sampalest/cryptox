const CryptoJS = require("crypto-js");

export default class Crypto {
    constructor(password) {
        this.password = password;
    }

    encryptFile(base64) {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(CryptoJS.AES.encrypt(base64, this.password).toString());
            }, 500);
        });
    }

    decryptFile(enc) {
        return new Promise(resolve => {
            resolve(CryptoJS.AES.decrypt(enc, this.password).toString(CryptoJS.enc.Utf8));
        });
    }
}
