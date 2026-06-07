import Constants from "./constants.js";
import Utils from "./utils.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sodium from "libsodium-wrappers-sumo";
import IVector from "./vector.js";
const AES256 = "aes-256-gcm";

export default class Crypto {
    constructor(password) {
        this.password = password;
    }

    /**
     * Ensure libsodium's WASM runtime is initialised before any KDF call.
     * @function _ready
     * @return {Promise.<void>}
     */
    async _ready() {
        await sodium.ready;
    }

    /**
     * Legacy cipher key: raw SHA-256 of the password. Insecure (no salt, fast),
     * kept ONLY to decrypt legacy `.ctx` files written before the Argon2id format.
     * @function _getCipherKey
     */
    _getCipherKey() {
        return crypto.createHash("sha256").update(this.password).digest();
    }

    /**
     * Derive the AES key from the password with Argon2id (memory-hard KDF).
     * @function _deriveKeyArgon2id
     * @param {Buffer} salt Per-file random salt (crypto_pwhash_SALTBYTES).
     * @param {Number} opslimit Argon2id ops limit.
     * @param {Number} memlimit Argon2id memory limit (bytes).
     * @param {Number} keyLen Derived key length in bytes.
     * @return {Buffer}
     */
    _deriveKeyArgon2id(salt, opslimit, memlimit, keyLen) {
        const key = sodium.crypto_pwhash(
            keyLen,
            this.password,
            salt,
            opslimit,
            memlimit,
            sodium.crypto_pwhash_ALG_ARGON2ID13
        );
        return Buffer.from(key);
    }

    /**
     * Build the new-format file header: MAGIC + version + uint16 length + JSON meta.
     * @function _buildHeader
     * @param {Object} meta KDF metadata stored as JSON.
     * @return {Buffer}
     */
    _buildHeader(meta) {
        const json = Buffer.from(JSON.stringify(meta), "utf-8");
        const prefix = Buffer.alloc(Constants.CTX_MAGIC.length + 1 + 2);
        prefix.write(Constants.CTX_MAGIC, 0, "utf-8");
        prefix.writeUInt8(Constants.CTX_FORMAT_VERSION, Constants.CTX_MAGIC.length);
        prefix.writeUInt16BE(json.length, Constants.CTX_MAGIC.length + 1);
        return Buffer.concat([prefix, json]);
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
    async _compressFolder(file, fileEvent, onStatus) {
        fileEvent.loader = true;
        fileEvent.msg = "Reading files...";
        if (onStatus) onStatus({ loader: true, msg: fileEvent.msg });
                
        var args = {
            "output": `${Constants.TMP}/${file.name}.tar`,
            "path": file.path,
            "level": 1
        };
        await Utils.zipDirectory(args);
        fileEvent.loader = false;
        if (onStatus) onStatus({ loader: false });

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
    async encrypt(file, completeFile, fileEvent, events = {}) {
        const onProgress = events.onProgress;
        const onStatus = events.onStatus;
        fileEvent.filename = file.name;
        if (onStatus) onStatus({ filename: fileEvent.filename });
        let completedSize = 0;
        let size = fs.statSync(file.path).size;
        let endfile = file.path.split(".")[0].concat(Constants.POINT_EXT);
        let isDirectory = Utils.isDirectory(file.path);
        let filepath = file.path;
        if (isDirectory) {
            Utils.createTempFiles();
            let obj = await this._compressFolder(file, fileEvent, onStatus);
            size = obj.size;
            filepath = obj.filepath;
            endfile = obj.endfile;
        }

        await this._ready();
        const opslimit = sodium.crypto_pwhash_OPSLIMIT_MODERATE;
        const memlimit = sodium.crypto_pwhash_MEMLIMIT_MODERATE;
        const salt = Buffer.from(sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES));
        const CIPHER_KEY = this._deriveKeyArgon2id(salt, opslimit, memlimit, Constants.KEY_LEN);
        const header = this._buildHeader({
            kdf: "argon2id",
            salt: salt.toString("base64"),
            opslimit: opslimit,
            memlimit: memlimit,
            keyLen: Constants.KEY_LEN
        });

        return new Promise((resolve, reject) => {
            const initVect = crypto.randomBytes(16);
            const readStream = fs.createReadStream(filepath);
            const cipher = crypto.createCipheriv(AES256, CIPHER_KEY, initVect);
            const appendInitVect = new IVector(initVect);
            const writeStream = fs.createWriteStream(path.join(endfile));
            // Header is written first so the file is [header][IV][ciphertext][ext][authTag].
            writeStream.write(header);

            writeStream.on("finish", () => {
                let authTag = cipher.getAuthTag();
                let splitfile = file.name.split(".");
                let extension = splitfile[splitfile.length - 1];
                let fillExt = isDirectory ? Utils.fillExtension("tar") : Utils.fillExtension(extension);
                let extBuffer = Buffer.from(fillExt, "utf-8");
                fs.appendFileSync(endfile, Buffer.concat([extBuffer, authTag]));
                if (isDirectory) Utils.rmRf(Constants.TMP);
                resolve();
            });

            readStream.on("error", reject);
            cipher.on("error", reject);
            writeStream.on("error", reject);
            
            readStream
                .pipe(cipher)
                .pipe(appendInitVect)
                .on("data", buffer => {
                    completedSize += buffer.length;
                    let complete = parseInt((completedSize / size * 100));
                    if (complete != completeFile.value) {
                        completeFile.value = complete;
                        if (onProgress) onProgress(complete);
                    }
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
    async decrypt(file, completeFile, events = {}) {
        const onProgress = events.onProgress;
        const size = fs.statSync(file.path).size;
        const extSize = 8;
        const authTagSize = 16;
        const ivSize = 16;
        const extPosition = authTagSize + 8;

        const bufferExtStart = size - (authTagSize + extSize);
        const bufferExtEnd = size - (authTagSize + 1);
        const authTagStart = size - authTagSize;
        const endFile = size - (extPosition + 1);

        // Detect format: new files begin with MAGIC + version + uint16 header length,
        // followed by a JSON KDF header. Legacy files begin directly with the 16-byte IV
        // (a random IV colliding with the 6-byte magic is ~1/2^48, acceptably rare).
        const magicLen = Constants.CTX_MAGIC.length;
        const prefixLen = magicLen + 1 + 2;
        const head = await this._getPositionalBytes(file.path, { start: 0, end: prefixLen - 1 });
        const isNewFormat = head.length >= prefixLen
            && head.slice(0, magicLen).toString("utf-8") === Constants.CTX_MAGIC
            && head.readUInt8(magicLen) === Constants.CTX_FORMAT_VERSION;

        let cipherKey;
        let ivStart;
        if (isNewFormat) {
            const headerLen = head.readUInt16BE(magicLen + 1);
            const headerTotalBytes = prefixLen + headerLen;
            const jsonBuf = await this._getPositionalBytes(file.path, { start: prefixLen, end: headerTotalBytes - 1 });
            const meta = JSON.parse(jsonBuf.toString("utf-8"));
            await this._ready();
            cipherKey = this._deriveKeyArgon2id(Buffer.from(meta.salt, "base64"), meta.opslimit, meta.memlimit, meta.keyLen);
            ivStart = headerTotalBytes;
        } else {
            cipherKey = this._getCipherKey();
            ivStart = 0;
        }
        const startFile = ivStart + ivSize;

        let completedSize = 0;
        // Read the IV, then 8 bytes for the extension and 16 bytes for the GCM authTag.
        const iv = await this._getPositionalBytes(file.path, { start: ivStart, end: ivStart + ivSize - 1 });
        const bufferExt = await this._getPositionalBytes(file.path, { start: bufferExtStart, end: bufferExtEnd });
        const authTag = await this._getPositionalBytes(file.path, { start: authTagStart, end: size });
        return new Promise((resolve, reject) => {
            try {
                // Remove all "*" from extension.
                var ext = bufferExt.filter(byte => byte != 42);
                const decipher = crypto.createDecipheriv(AES256, cipherKey, iv).setAuthTag(authTag);
                const readStream = fs.createReadStream(file.path, { start: startFile, end: endFile });
                // If not a folder save in file directory else in temporal directory.
                if (ext.toString("utf-8") === "tar") Utils.createTempFiles();
                const unencFile = ext.toString("utf-8") !== "tar" ? file.path.split(".")[0].concat(`.${ext}`) : `${Constants.TMP}/${file.name.split(".")[0]}.tar`;
                const writeStream = fs.createWriteStream(unencFile);
                writeStream.on("finish", () => {
                    if (ext.toString("utf-8") === "tar") {
                        Utils.unzipDirectory(unencFile, file.path.split(".")[0]);
                    }
                    resolve();
                });

                readStream.on("error", reject);
                decipher.on("error", reject);
                writeStream.on("error", reject);
            
                readStream
                    .pipe(decipher)
                    .on("data", buffer => {
                        completedSize += buffer.length;
                        let complete = parseInt((completedSize / size * 100));
                        if (complete != completeFile.value) {
                            completeFile.value = complete;
                            if (onProgress) onProgress(complete);
                        }
                    })
                    .pipe(writeStream);

            } catch (error) {
                reject(error);
            }
        });
    }
}
