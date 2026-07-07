import Constants from "../shared/constants.js";
import { CancelledError } from "../shared/exceptions.js";
import Format from "./format.js";
import TempManager from "./temp.js";
import Utils from "./utils.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sodium from "libsodium-wrappers-sumo";
import IVector from "./vector.js";
const AES256 = "aes-256-gcm";

export default class Crypto {
    constructor(password, operationId = crypto.randomUUID()) {
        this.password = password;
        this.operationId = operationId;
        this._cancelled = false;
        this._destroyables = new Set();
    }

    /**
     * Cancel this operation: destroy any in-flight streams and make every
     * later checkpoint abort with CancelledError. The synchronous Argon2id
     * KDF and tar/untar steps cannot be interrupted mid-call, so a cancel
     * issued during them takes effect at the next checkpoint.
     * @function cancel
     */
    cancel() {
        if (this._cancelled) return;
        this._cancelled = true;
        const error = new CancelledError();
        for (const stream of [...this._destroyables]) {
            stream.destroy(error);
        }
    }

    /**
     * Check if this operation has been cancelled and throw if so.
     * @function _checkCancelled
     * @throws {CancelledError}
     */
    _checkCancelled() {
        if (this._cancelled) throw new CancelledError();
    }

    /**
     * Track streams that must be destroyed on cancel.
     * @function _track
     * @param  {...any} streams
     */
    _track(...streams) {
        streams.forEach(stream => this._destroyables.add(stream));
    }

    /**
     * Untrack all streams.
     * @function _untrackAll
     */
    _untrackAll() {
        this._destroyables.clear();
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
     * Read exactly `length` bytes at `start`. Unlike a read stream, this can
     * never silently return a partial range: a short read (truncated file)
     * throws instead of hanging or handing back garbage offsets.
     * @function _readBytes
     * @param {String} filePath File path.
     * @param {Number} start Byte offset to read from.
     * @param {Number} length Number of bytes to read.
     * @return {Promise.<Buffer>}
     */
    async _readBytes(filePath, start, length) {
        const handle = await fs.promises.open(filePath, "r");
        try {
            const buffer = Buffer.alloc(length);
            const { bytesRead } = await handle.read(buffer, 0, length, start);
            if (bytesRead !== length) throw new Format.FormatError("file is truncated");
            return buffer;
        } finally {
            await handle.close();
        }
    }

    /**
     * Compress folder and make only one file
     * @function _compressFolder
     * @param {File} file File.
     * @param {Object} fileEvent Loader Interface object pointer.
     * @return {Object}
     */
    async _compressFolder(file, fileEvent, onStatus, tempDir) {
        fileEvent.loader = true;
        fileEvent.msg = "Reading files...";
        if (onStatus) onStatus({ loader: true, msg: fileEvent.msg });

        var args = {
            "output": path.join(tempDir, `${file.name}.tar`),
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
        try {
            // Await inside the try so the operation-owned temp directory is
            // released on success and on any failure alike.
            return await this._encrypt(file, completeFile, fileEvent, events);
        } finally {
            TempManager.release(this.operationId);
        }
    }

    async _encrypt(file, completeFile, fileEvent, events = {}) {
        this._checkCancelled();
        const onProgress = events.onProgress;
        const onStatus = events.onStatus;
        fileEvent.filename = file.name;
        if (onStatus) onStatus({ filename: fileEvent.filename });
        let completedSize = 0;
        let size = fs.statSync(file.path).size;
        const parsedSource = path.parse(file.path);
        let endfile = path.join(parsedSource.dir, parsedSource.name + Constants.POINT_EXT);
        let isDirectory = Utils.isDirectory(file.path);
        let filepath = file.path;
        if (isDirectory) {
            const tempDir = await TempManager.acquire(this.operationId);
            let obj = await this._compressFolder(file, fileEvent, onStatus, tempDir);
            size = obj.size;
            filepath = obj.filepath;
            endfile = obj.endfile;
            this._checkCancelled();
        }

        await this._ready();
        const opslimit = sodium.crypto_pwhash_OPSLIMIT_MODERATE;
        const memlimit = sodium.crypto_pwhash_MEMLIMIT_MODERATE;
        const salt = Buffer.from(sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES));
        // Argon2id is synchronous and CPU/memory heavy; show the indeterminate bar while it runs.
        if (onStatus) onStatus({ loader: true, msg: "Preparing secure key..." });
        const CIPHER_KEY = this._deriveKeyArgon2id(salt, opslimit, memlimit, Constants.KEY_LEN);
        if (onStatus) onStatus({ loader: false });
        this._checkCancelled();

        // CTX1 header: the original name travels in the (authenticated) header
        // instead of a trailing padded-extension field, and a flag bit marks
        // directory payloads instead of the old magic "tar" extension.
        const header = Format.buildHeaderV1({
            alg: Format.ALG_AES_256_GCM,
            kdf: Format.KDF_ARGON2ID,
            salt: salt.toString("base64"),
            opslimit: opslimit,
            memlimit: memlimit,
            keyLen: Constants.KEY_LEN,
            name: isDirectory ? `${file.name}.tar` : file.name
        }, isDirectory ? Format.FLAG_DIRECTORY : 0);

        // The ciphertext is staged in a hidden, randomly named temp file next
        // to the destination (mirroring _streamDecrypt) and only moved into
        // place after the auth tag is appended: a partial, failed or
        // cancelled encryption is never visible at the final path, and the
        // free "name (n).ctx" variant is resolved at move time.
        return new Promise((resolve, reject) => {
            const initVect = crypto.randomBytes(16);
            const writePath = this._tempOutputPath(endfile);
            const readStream = fs.createReadStream(filepath);
            const cipher = crypto.createCipheriv(AES256, CIPHER_KEY, initVect);
            // The header is associated data: the GCM tag authenticates it, so
            // any tampering with the stored metadata fails decryption.
            cipher.setAAD(header);
            const appendInitVect = new IVector(initVect);
            const writeStream = fs.createWriteStream(writePath, { flags: "wx" });
            this._track(readStream, cipher, writeStream);
            // Header is written first so the file is [header][IV][ciphertext][authTag].
            writeStream.write(header);

            // Destroying one stream of the pipeline makes the others error
            // too, so teardown must be idempotent and remove the staged
            // output exactly once.
            let settled = false;
            const removeStagedOutput = () => {
                try {
                    // The staged output has a random operation-owned name,
                    // so it is always ours to remove.
                    if (fs.existsSync(writePath)) fs.unlinkSync(writePath);
                } catch (cleanupError) {
                    // Best-effort cleanup; surface the original error.
                }
            };
            const handleError = error => {
                if (settled) return;
                settled = true;
                readStream.destroy();
                cipher.destroy();
                writeStream.destroy();
                removeStagedOutput();
                this._untrackAll();
                reject(error);
            };

            writeStream.on("finish", async () => {
                if (settled) return;
                settled = true;
                this._untrackAll();
                // A cancel can race stream completion: never finalize a
                // cancelled output, even if every byte made it to disk.
                if (this._cancelled) {
                    removeStagedOutput();
                    reject(new CancelledError());
                    return;
                }
                // The streamed bytes are queued but the output is still the
                // hidden staged file: tell the UI finalization is running and
                // reserve 100% for "flushed and visible at the final path".
                if (onStatus) onStatus({ loader: true, msg: "Saving file..." });
                try {
                    fs.appendFileSync(writePath, cipher.getAuthTag());
                    await this._flushToDisk(writePath);
                    this._moveIntoPlace(writePath, endfile);
                } catch (error) {
                    if (onStatus) onStatus({ loader: false });
                    removeStagedOutput();
                    return reject(error);
                }
                if (onStatus) onStatus({ loader: false });
                completeFile.value = 100;
                if (onProgress) onProgress(100);
                resolve();
            });

            readStream.on("error", handleError);
            cipher.on("error", handleError);
            writeStream.on("error", handleError);

            // Count plaintext bytes read against the plaintext size so progress runs a
            // clean 0->99% (counting the cipher output would also include the prepended
            // IV). 100% is reserved for the moment the output is visible at its final
            // path, after the auth tag is appended and the staged file moved into place.
            readStream.on("data", buffer => {
                completedSize += buffer.length;
                let complete = Math.min(parseInt((completedSize / size * 100)), 99);
                if (complete != completeFile.value) {
                    completeFile.value = complete;
                    if (onProgress) onProgress(complete);
                }
            });

            readStream
                .pipe(cipher)
                .pipe(appendInitVect)
                .pipe(writeStream);
        });
    }

    /**
     * Decrypt File. Dispatches on the on-disk format: CTX1 (authenticated
     * header), interim CTXBOX (0.3.x alphas, read-only) or raw legacy
     * (IV-first, SHA-256 key).
     * @async
     * @function decrypt
     * @param {String} file File path
     * @param {Number} completeFile Necesary to save percent of decryption.
     * @return {Promise}
     */
    async decrypt(file, completeFile, events = {}) {
        try {
            // All three paths resolve only after extraction completed, so a
            // single release here covers success and failure for each format.
            const size = fs.statSync(file.path).size;
            const head = await this._readBytes(file.path, 0, Math.min(size, 9));
            switch (Format.detectFormat(head)) {
            case "ctx1":
                return await this._decryptV1(file, size, completeFile, events);
            case "ctxbox":
                return await this._decryptInterim(file, size, completeFile, events);
            default:
                return await this._decryptLegacy(file, size, completeFile, events);
            }
        } finally {
            TempManager.release(this.operationId);
        }
    }

    /**
     * Decrypt a CTX1 file: bounded header parse, Argon2id key from the stored
     * params, header bytes verified as GCM associated data, output name taken
     * from the (authenticated) header.
     * @function _decryptV1
     */
    async _decryptV1(file, size, completeFile, events = {}) {
        this._checkCancelled();
        const prefix = await this._readBytes(file.path, 0, Format.PREFIX_LEN_V1);
        const { headerLen } = Format.parsePrefixV1(prefix);
        if (size < Format.PREFIX_LEN_V1 + headerLen + Format.IV_LEN + Format.TAG_LEN) {
            throw new Format.FormatError("file too short for CTX1 payload");
        }
        const headerBuf = await this._readBytes(file.path, 0, Format.PREFIX_LEN_V1 + headerLen);
        const { flags, meta, headerBytes } = Format.parseHeaderV1(headerBuf, size);

        await this._ready();
        // Argon2id is synchronous and CPU/memory heavy; show the indeterminate bar while it runs.
        if (events.onStatus) events.onStatus({ loader: true, msg: "Preparing secure key..." });
        const cipherKey = this._deriveKeyArgon2id(Buffer.from(meta.salt, "base64"), meta.opslimit, meta.memlimit, meta.keyLen);
        if (events.onStatus) events.onStatus({ loader: false });
        this._checkCancelled();

        const headerEnd = headerBytes.length;
        const iv = await this._readBytes(file.path, headerEnd, Format.IV_LEN);
        const authTag = await this._readBytes(file.path, size - Format.TAG_LEN, Format.TAG_LEN);

        const targetDir = path.dirname(file.path);
        const isDirectory = (flags & Format.FLAG_DIRECTORY) !== 0;
        let outPath, extractTo;
        if (isDirectory) {
            // Payload is a tar'd directory: write the archive to this
            // operation's temp directory, then extract next to the .ctx file
            // under the original directory name.
            const dirName = path.parse(meta.name).name;
            if (!dirName) throw new Format.FormatError("header name has no directory stem");
            const tempDir = await TempManager.acquire(this.operationId);
            outPath = path.join(tempDir, meta.name);
            extractTo = Utils.uniquePath(path.join(targetDir, dirName), true);
        } else {
            // Desired final path only: the plaintext is staged in a hidden
            // temp file and the free "name (n)" variant is resolved when the
            // authenticated output is moved into place.
            outPath = path.join(targetDir, meta.name);
        }

        return this._streamDecrypt({
            filePath: file.path,
            cipherKey: cipherKey,
            iv: iv,
            authTag: authTag,
            aad: headerBytes,
            ctStart: headerEnd + Format.IV_LEN,
            ctEnd: size - Format.TAG_LEN - 1,
            outPath: outPath,
            extractTo: extractTo,
            completeFile: completeFile,
            onProgress: events.onProgress,
            onStatus: events.onStatus
        });
    }

    /**
     * Decrypt an interim CTXBOX file (written by the 0.3.x alphas):
     * [magic 6][version u8][headerLen u16BE][JSON kdf meta][IV][ciphertext][ext 8][tag 16].
     * The header cannot be authenticated retroactively, but parsing is bounded
     * and the KDF params are clamped to the same limits as CTX1.
     * @function _decryptInterim
     */
    async _decryptInterim(file, size, completeFile, events = {}) {
        this._checkCancelled();
        const magicLen = Constants.CTX_MAGIC.length;
        const prefixLen = magicLen + 1 + 2;
        const head = await this._readBytes(file.path, 0, prefixLen);
        if (head.readUInt8(magicLen) !== Constants.CTX_FORMAT_VERSION) {
            throw new Format.FormatError(`unsupported format version: ${head.readUInt8(magicLen)}`);
        }
        const headerLen = head.readUInt16BE(magicLen + 1);
        if (headerLen < 2 || headerLen > Format.MAX_HEADER_JSON) throw new Format.FormatError("header length out of range");
        // header + IV + ext field + auth tag must fit in the file.
        if (size < prefixLen + headerLen + Format.IV_LEN + 8 + Format.TAG_LEN) {
            throw new Format.FormatError("file too short for CTXBOX payload");
        }
        const jsonBuf = await this._readBytes(file.path, prefixLen, headerLen);
        let meta;
        try {
            meta = JSON.parse(jsonBuf.toString("utf-8"));
        } catch (error) {
            throw new Format.FormatError("header is not valid JSON");
        }
        Format.validateKdfParams(meta);

        await this._ready();
        // Argon2id is synchronous and CPU/memory heavy; show the indeterminate bar while it runs.
        if (events.onStatus) events.onStatus({ loader: true, msg: "Preparing secure key..." });
        const cipherKey = this._deriveKeyArgon2id(Buffer.from(meta.salt, "base64"), meta.opslimit, meta.memlimit, meta.keyLen);
        if (events.onStatus) events.onStatus({ loader: false });
        this._checkCancelled();

        return this._decryptTrailingExt(file, size, completeFile, events, cipherKey, prefixLen + headerLen);
    }

    /**
     * Decrypt a raw legacy file: [IV 16][ciphertext][ext 8][tag 16], key is the
     * unsalted SHA-256 of the password (read-only backward compatibility).
     * @function _decryptLegacy
     */
    async _decryptLegacy(file, size, completeFile, events = {}) {
        this._checkCancelled();
        // IV + ext field + auth tag is the minimum possible legacy file.
        if (size < Format.IV_LEN + 8 + Format.TAG_LEN) throw new Format.FormatError("file too short for legacy payload");
        return this._decryptTrailingExt(file, size, completeFile, events, this._getCipherKey(), 0);
    }

    /**
     * Shared tail of the interim/legacy paths: both store an 8-byte '*'-padded
     * extension before the trailing auth tag, with the IV at `ivStart`.
     * @function _decryptTrailingExt
     */
    async _decryptTrailingExt(file, size, completeFile, events, cipherKey, ivStart) {
        const extSize = 8;
        const iv = await this._readBytes(file.path, ivStart, Format.IV_LEN);
        const bufferExt = await this._readBytes(file.path, size - (Format.TAG_LEN + extSize), extSize);
        const authTag = await this._readBytes(file.path, size - Format.TAG_LEN, Format.TAG_LEN);

        // Remove all "*" padding from the extension.
        const ext = bufferExt.filter(byte => byte != 42).toString("utf-8");
        // Strip only the trailing .ctx, keeping multi-dot stems intact
        // ("multi.dot.name.ctx" -> "multi.dot.name.txt").
        const parsedSource = path.parse(file.path);
        const outName = ext ? `${parsedSource.name}.${ext}` : parsedSource.name;
        // The trailing ext field is NOT covered by the GCM tag in these old
        // layouts: reject anything that could steer the output path.
        Format.sanitizeName(outName);
        // If not a folder save in file directory else in the operation's temp
        // directory. For files this is the desired final path only; the free
        // "name (n)" variant is resolved when the authenticated output is
        // moved into place.
        const isTar = ext === "tar";
        const outPath = isTar
            ? path.join(await TempManager.acquire(this.operationId), `${parsedSource.name}.tar`)
            : path.join(parsedSource.dir, outName);

        return this._streamDecrypt({
            filePath: file.path,
            cipherKey: cipherKey,
            iv: iv,
            authTag: authTag,
            ctStart: ivStart + Format.IV_LEN,
            ctEnd: size - (Format.TAG_LEN + extSize) - 1,
            outPath: outPath,
            extractTo: isTar ? Utils.uniquePath(path.join(parsedSource.dir, parsedSource.name), true) : undefined,
            completeFile: completeFile,
            onProgress: events.onProgress,
            onStatus: events.onStatus
        });
    }

    /**
     * Flush a staged output file's data to disk (fsync) before it is moved
     * into place. Stream writes only queue bytes in the OS write cache: for
     * large files the kernel keeps flushing for seconds after the streams
     * finish, so without this the operation would report success while the
     * output is not yet physically stored.
     * @function _flushToDisk
     * @param {String} filePath Staged output path.
     * @return {Promise.<void>}
     */
    async _flushToDisk(filePath) {
        const handle = await fs.promises.open(filePath, "r+");
        try {
            await handle.sync();
        } finally {
            await handle.close();
        }
    }

    /**
     * Hidden staging path for operation output (ciphertext on encrypt,
     * plaintext on decrypt): a randomly named dotfile in the same directory
     * as the final destination, so the final move never crosses filesystems
     * and is atomic.
     * @function _tempOutputPath
     * @param {String} finalPath Desired final output path.
     * @return {String}
     */
    _tempOutputPath(finalPath) {
        return path.join(path.dirname(finalPath), `.lockasaur-part-${crypto.randomBytes(8).toString("hex")}`);
    }

    /**
     * Move the finished output from its staging path to the first free
     * "name (n)" variant of the desired path. link(2) fails with EEXIST instead
     * of overwriting (unlike rename), so a lost race re-resolves the name; on
     * filesystems without hard links fall back to a re-check plus rename.
     * @function _moveIntoPlace
     * @param {String} tempPath Staged plaintext path (operation-owned).
     * @param {String} desiredPath Wanted final output path.
     * @return {String} The path the output landed at.
     */
    _moveIntoPlace(tempPath, desiredPath) {
        const LINK_UNSUPPORTED = ["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"];
        for (let attempt = 0; attempt < 5; attempt++) {
            const target = Utils.uniquePath(desiredPath);
            try {
                fs.linkSync(tempPath, target);
                fs.unlinkSync(tempPath);
                return target;
            } catch (error) {
                if (error.code === "EEXIST") continue;
                if (LINK_UNSUPPORTED.includes(error.code)) {
                    if (fs.existsSync(target)) continue;
                    fs.renameSync(tempPath, target);
                    return target;
                }
                throw error;
            }
        }
        throw new Error(`could not move output into place for ${desiredPath}`);
    }

    /**
     * Common streaming decrypt core: read the ciphertext slice, pipe it through
     * AES-256-GCM (with the header as associated data when given), and stage
     * the plaintext in a hidden temp file. Only after GCM authentication
     * succeeds is the output moved to its final path (or, for directory
     * archives, validated and extracted there), so a wrong password, tampered
     * ciphertext or interrupted stream never leaves plaintext at the final
     * destination. On any failure the staged output is removed before rejecting.
     * @function _streamDecrypt
     * @param {Object} job { filePath, cipherKey, iv, authTag, aad?, ctStart, ctEnd, outPath, extractTo?, completeFile, onProgress?, onStatus? }
     * @return {Promise}
     */
    _streamDecrypt({ filePath, cipherKey, iv, authTag, aad, ctStart, ctEnd, outPath, extractTo, completeFile, onProgress, onStatus }) {
        return new Promise((resolve, reject) => {
            try {
                this._checkCancelled();
                const decipher = crypto.createDecipheriv(AES256, cipherKey, iv).setAuthTag(authTag);
                if (aad) decipher.setAAD(aad);
                // Ciphertext slice length: progress is measured against this so the bar runs a
                // clean 0->100% (the full file size includes the header/IV/authTag overhead).
                const cipherLength = ctEnd - ctStart + 1;
                // Archive payloads already stream into the operation's temp
                // directory; file payloads are staged next to the destination
                // and only moved into place after authentication.
                const writePath = extractTo ? outPath : this._tempOutputPath(outPath);

                const finalize = async () => {
                    this._untrackAll();
                    // A cancel can race stream completion: never move a
                    // cancelled output into place, even fully authenticated.
                    if (this._cancelled) return cleanupAndReject(new CancelledError());
                    // The plaintext is authenticated but still staged/hidden:
                    // tell the UI finalization is running and reserve 100% for
                    // "visible at the final path".
                    if (onStatus) onStatus({ loader: true, msg: extractTo ? "Extracting files..." : "Saving file..." });
                    try {
                        if (extractTo) {
                            // Await extraction so success is not reported (nor the UI
                            // unblocked) before the archive is fully and safely unpacked.
                            await Utils.unzipDirectory(writePath, extractTo);
                        } else {
                            await this._flushToDisk(writePath);
                            this._moveIntoPlace(writePath, outPath);
                        }
                    } catch (error) {
                        return cleanupAndReject(error);
                    }
                    if (onStatus) onStatus({ loader: false });
                    completeFile.value = 100;
                    if (onProgress) onProgress(100);
                    resolve();
                };

                const cleanupAndReject = error => {
                    this._untrackAll();
                    // A failed finalization must not leave the indeterminate bar up.
                    if (onStatus) onStatus({ loader: false });
                    try {
                        if (fs.existsSync(writePath)) fs.unlinkSync(writePath);
                    } catch (cleanupError) {
                        // Best-effort cleanup; surface the original decrypt error.
                    }
                    reject(error);
                };

                if (cipherLength <= 0) {
                    // Empty plaintext: GCM still authenticates the tag (and AAD)
                    // on final(), but a read stream cannot express a zero-length
                    // range (start > end is rejected by fs).
                    try {
                        decipher.final();
                        fs.writeFileSync(writePath, Buffer.alloc(0), { flag: "wx" });
                    } catch (error) {
                        return cleanupAndReject(error);
                    }
                    finalize();
                    return;
                }

                const readStream = fs.createReadStream(filePath, { start: ctStart, end: ctEnd });
                const writeStream = fs.createWriteStream(writePath, { flags: "wx" });
                this._track(readStream, decipher, writeStream);
                writeStream.on("finish", finalize);

                // A wrong password (or tampered header) fails GCM auth only at stream
                // end, after partial garbage has been written. Tear down the streams
                // and remove the bogus output before rejecting.
                const handleError = error => {
                    readStream.destroy();
                    writeStream.destroy();
                    cleanupAndReject(error);
                };
                readStream.on("error", handleError);
                decipher.on("error", handleError);
                writeStream.on("error", handleError);

                // Streaming runs 0->99%; 100% is reserved for the moment the
                // output is visible at its final path (moved or extracted).
                let completedSize = 0;
                readStream
                    .pipe(decipher)
                    .on("data", buffer => {
                        completedSize += buffer.length;
                        let complete = Math.min(parseInt((completedSize / cipherLength * 100)), 99);
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
