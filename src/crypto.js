const CryptoJS = require("crypto-js");

export default class Crypto {
    constructor(password) {
        this.password = password;
    }

    encryptFile(base64) {
        return CryptoJS.AES.encrypt(base64, this.password).toString();
    }

    decryptFile(enc) {
        return CryptoJS.AES.decrypt(enc, this.password).toString(CryptoJS.enc.Utf8);
    }
}
