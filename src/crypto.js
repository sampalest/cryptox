import Constants from "./constants.js";
import Utils from "./utils.js";
// import * as e from "./exceptions.js";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const IVector = require("./vector.js");
// const zlib = require("zlib");
const AES256 = "aes-256-gcm";

export default class Crypto {
    constructor(password) {
        this.password = password;
    }

    /**
     * Obtain cipher key
     * @function _getCipherKey
     */
    _getCipherKey() {
        return crypto.createHash("sha256").update(this.password).digest();
    }

    /**
     * Get positional bytes
     * @function _getPositionalBytes
     * @param {Object} obj Object with start and end parameters.
     * @param {File} file File.
     * @return {Promise.<Buffer>}
     */
    _getPositionalBytes(file, obj) {
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
     * Compress folder and make only one file
     * @function _compressFolder     
     * @param {File} file File.
     * @param {Object} fileEvent Loader Interface object pointer. 
     * @return {Object}
     */
    async _compressFolder(file, fileEvent) {
        fileEvent.loader = true;
        fileEvent.msg = "Reading files...";
        
        Utils.createTempFiles();
        var args = {
            "output": `${Constants.LNXTMP}/${file.name}.tar`,
            "path": file.path,
            "level": 1
        };
        await Utils.zipDirectory(args);
        fileEvent.loader = false;

        return {
            "endfile": file.path.concat(Constants.POINT_EXT),
            "filepath": args.output,
            "size": fs.statSync(args.output).size
        };
    }

    /**
     * Encrypt File
     * @function encrypt
     * @param {String} file File path
     * @param {Object} completeFile Necessary to save percent of encryption (pointer of Vue var).
     * @param {Object} fileEvent Vue var: necessary for UI.
     * @return {Promise}
     */
    async encrypt(file, completeFile, fileEvent) {
        fileEvent.filename = file.name;
        let completedSize = 0;
        let size = fs.statSync(file.path).size;
        let endfile = file.path.split(".")[0].concat(Constants.POINT_EXT);
        let isDirectory = Utils.isDirectory(file.path);
        let filepath = file.path;
        if (isDirectory) {
            let obj = await this._compressFolder(file, fileEvent);
            size = obj.size;
            filepath = obj.filepath;
            endfile = obj.endfile;
        }

        return new Promise(resolve => {
            const initVect = crypto.randomBytes(16);
            const CIPHER_KEY = this._getCipherKey();
            const readStream = fs.createReadStream(filepath);
            const cipher = crypto.createCipheriv(AES256, CIPHER_KEY, initVect);
            const appendInitVect = new IVector(initVect);
            const writeStream = fs.createWriteStream(path.join(endfile));

            writeStream.on("finish", () => {
                let authTag = cipher.getAuthTag();
                let splitfile = file.name.split(".");
                let extension = splitfile[splitfile.length - 1];
                let fillExt = isDirectory ? Utils.fillExtension("tar") : Utils.fillExtension(extension);
                let extBuffer = Buffer.from(fillExt, "utf-8");
                fs.appendFileSync(endfile, Buffer.concat([extBuffer, authTag]));
                resolve();
            });
            
            readStream
                .pipe(cipher)
                .pipe(appendInitVect)
                .on("data", buffer => {
                    completedSize += buffer.length;
                    let complete = parseInt((completedSize / size * 100));
                    if (complete != completeFile.value) completeFile.value = complete;
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
        const authTagPosition = 16;
        const extPosition = authTagPosition + 8;

        let completedSize = 0;
        let size = fs.statSync(file.path).size;
        // Read first 16 bytes to get iv and next 16 bytes to get the authTag necessary for GCM
        const iv = await this._getPositionalBytes(file.path, { end: 15 });
        const bufferExt = await this._getPositionalBytes(file.path, { start: size - 24, end: size - (authTagPosition + 1) });
        const authTag = await this._getPositionalBytes(file.path, { start: size - authTagPosition, end: size });
        var ext = bufferExt.filter(byte => byte != 42);
        const readStream = fs.createReadStream(file.path, { start: 16, end: size - (extPosition + 1) });
        const cipherKey = this._getCipherKey();
        const decipher = crypto.createDecipheriv(AES256, cipherKey, iv).setAuthTag(authTag);
        return new Promise((resolve, reject) => {
            try {
                // If not a folder save in file directory else in temporal directory
                if (ext.toString("utf-8") === "tar") Utils.createTempFiles();
                const unencFile = ext.toString("utf-8") !== "tar" ? file.path.split(".")[0].concat(`.${ext}`) : `${Constants.LNXTMP}/${file.name.split(".")[0]}.tar`;
                const writeStream = fs.createWriteStream(unencFile);
                writeStream.on("finish", () => {
                    if (ext.toString("utf-8") === "tar") {
                        Utils.unzipDirectory(unencFile, file.path.split(".")[0]);
                    }
                    resolve();
                });
            
                readStream
                    .pipe(decipher)
                    .on("data", buffer => {
                        completedSize += buffer.length;
                        let complete = parseInt((completedSize / size * 100));
                        if (complete != completeFile.value) completeFile.value = complete;
                    })
                    .pipe(writeStream);

            } catch (error) {
                reject(error);
            }
        });
    }
}