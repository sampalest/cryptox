import Constants from "./constants.js";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const FileType = require("file-type");
const stream = require("stream");
// const zlib = require("zlib");
const IVector = require("./vector.js");
const AES256 = "aes-256-gcm";

export default class Crypto {
    constructor(password) {
        this.password = password;
    }
    /**
     * Obtain cipher key
     * @function getCipherKey
    */
    getCipherKey() {
        return crypto.createHash("sha256").update(this.password).digest();
    }

    /**
     * Get positional bytes
     * @function getPositionalBytes
     * @param {Object} obj Object with start and end parameters.
     * @param {File} file File.
     * @return {Promise.<Buffer>}
     */
    getPositionalBytes(file, obj) {
        return new Promise(resolve => {
            var rs = fs.createReadStream(file, obj);
            var bytes;
            rs.on("data", (chunk) => {
                bytes = chunk;
            });
            rs.on("close", () => {
                resolve(bytes);
            });
        });
    }

    /**
     * Encrypt File
     * @function encrypt
     * @param {String} file File path
     * @param {Object} completeFile Necessary to save percent of encryption (pointer of Vue var).
     * @return {Promise}
     */
    encrypt(file, completeFile) {
        let completedSize = 0;
        let size = fs.statSync(file).size;
        return new Promise(resolve => {
            let endfile = file.split(".")[0].concat(Constants.POINT_EXT);
            let initVect = crypto.randomBytes(16);
            let CIPHER_KEY = this.getCipherKey();
            let readStream = fs.createReadStream(file);
            let cipher = crypto.createCipheriv(AES256, CIPHER_KEY, initVect);
            let appendInitVect = new IVector(initVect);
            let writeStream = fs.createWriteStream(path.join(endfile));

            writeStream.on("finish", () => {
                let authTag = cipher.getAuthTag();
                fs.appendFileSync(endfile, authTag);
                resolve();
            });

            readStream
                .pipe(cipher)
                .pipe(appendInitVect)
                .on("data", buffer => {
                    completedSize += buffer.length;
                    let complete = parseInt((completedSize / size * 100));
                    if (complete != completeFile.value) completeFile.value = complete;
                    // console.log("Progress:\t", completeFile);
                })
                .pipe(writeStream);
        });
    }
    /**
     * Decrypt File
     * @async
     * @function decrypt
     * @param {String} file File path
     * @param {Number} completeFile Necesary to save percent of decryption.
     * @return {Promise}
     */
    async decrypt(file, completeFile) {
        let completedSize = 0;
        let size = fs.statSync(file).size;
        // Read first 16 bytes to get iv and next 16 bytes to get the authTag necessary for GCM
        let iv = await this.getPositionalBytes(file, { end: 15 });
        let authTag = await this.getPositionalBytes(file, { start: size-16, end: size });
        let readStream = fs.createReadStream(file, { start: 16, end: size-17 });
        let cipherKey = this.getCipherKey();
        let decipher = crypto.createDecipheriv(AES256, cipherKey, iv).setAuthTag(authTag);
        let fileTypeStream = await FileType.stream(stream.pipeline(readStream, decipher, err => {
            if (err) console.log(err);
        }));
        let writeStream = fs.createWriteStream(file.split(".")[0].concat("." + fileTypeStream.fileType.ext));

        return new Promise(resolve => {
            writeStream.on("finish", () => {
                resolve();
            });
        
            fileTypeStream
                .on("data", buffer => {
                    completedSize += buffer.length;
                    let complete = parseInt((completedSize / size * 100));
                    if (complete != completeFile.value) completeFile.value = complete;
                })
                .pipe(writeStream);
        });
    }
}