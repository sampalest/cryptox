import path from "node:path";
import Constants from "../shared/constants.js";

// DINO versioned encrypted file format (written by every new encrypt).
//
//   offset 0   magic "DINO" (4 bytes)               in AAD
//   offset 4   version u8 = 1                       in AAD
//   offset 5   flags u8            bit 0 = payload is a tar'd directory      in AAD
//   offset 6   headerLen u16BE     byte length of the JSON blob only         in AAD
//   offset 8   attempts u32BE      MUTABLE, NOT in AAD
//   offset 12  reserved u32BE = 0  MUTABLE, NOT in AAD
//   offset 16  JSON meta (headerLen bytes)          in AAD
//              [IV 16][ciphertext][GCM auth tag 16]
//
// JSON meta: { alg, kdf, salt (base64), opslimit, memlimit, keyLen, name,
// erase: { maxAttempts } (optional) }. AAD = bytes 0..7 + the JSON: the
// 8-byte mutable block is deliberately excluded so the failed-attempt counter
// can be rewritten in place without invalidating the auth tag; everything
// else, including the erase policy itself, is authenticated.
//
// CTX1 is the pre-rebrand layout (same prefix, no mutable block, JSON at
// offset 8, whole header in AAD). It is decrypt-only: never write it.
//
// This module is pure (no fs, no sodium, no node:crypto) so the parser/writer
// is trivially unit-testable and never triggers KDF work.

const MAGIC_DINO = Buffer.from("DINO", "utf-8");
const VERSION_DINO = 1;
const COUNTER_OFFSET = 8;
const MUTABLE_LEN = 8;

const MAGIC_V1 = Buffer.from("CTX1", "utf-8");
const VERSION_V1 = 1;
// magic (4) + version (1) + flags (1) + headerLen (2)
const PREFIX_LEN_V1 = MAGIC_V1.length + 1 + 1 + 2;
// the DINO prefix adds the mutable block before the JSON
const PREFIX_LEN_DINO = PREFIX_LEN_V1 + MUTABLE_LEN;
const MAX_HEADER_JSON = 4096;
const FLAG_DIRECTORY = 0x01;
const KNOWN_FLAGS = FLAG_DIRECTORY;

const IV_LEN = 16;
const TAG_LEN = 16;
const SALT_LEN = 16;

const ALG_AES_256_GCM = "aes-256-gcm";
const KDF_ARGON2ID = "argon2id";
const KEY_LEN = 32;

// Argon2id parameter bounds, hardcoded because sodium constants are only
// available after its async init and this module must stay pure. The ceiling is
// libsodium's MODERATE memory preset (256 MiB), which is exactly what the
// encrypt path writes; a tampered header demanding more is rejected before the
// KDF runs, since AES-256-GCM cannot authenticate the header until stream end so
// a crafted file would otherwise pin that much memory per decrypt (DoS).
const OPSLIMIT_MIN = 1;
const OPSLIMIT_MAX = 4;
const MEMLIMIT_MIN = 8192;
const MEMLIMIT_MAX = 268435456;

const MAX_NAME_LEN = 255;

// Interim format written by the 0.3.x alphas (read-only support):
// [magic "CTXBOX" 6][version u8 = 1][headerLen u16BE][JSON kdf meta][IV][ciphertext][ext 8][tag 16]
const CTXBOX_MAGIC = "CTXBOX";

class FormatError extends Error {
    constructor(message) {
        super(message);
        this.name = "FormatError";
    }
}

/**
 * Validate the original-name metadata field. The name is used to build the
 * decrypt output path, so anything that could escape the target directory
 * (separators, "..", control characters) is rejected.
 * @function sanitizeName
 * @param {String} name Candidate file name from the header.
 * @return {String} The validated name.
 */
function sanitizeName(name) {
    if (typeof name !== "string" || name.length === 0) throw new FormatError("header name must be a non-empty string");
    if (name.length > MAX_NAME_LEN) throw new FormatError("header name too long");
    if (name === "." || name === "..") throw new FormatError("header name not allowed");
    // eslint-disable-next-line no-control-regex
    if (/[/\\\x00-\x1f\x7f]/.test(name)) throw new FormatError("header name contains illegal characters");
    if (name !== path.basename(name)) throw new FormatError("header name must be a bare file name");
    return name;
}

/**
 * Bound-check the Argon2id parameters stored in a file header. Shared with the
 * interim CTXBOX read path, which has the same crafted-header KDF-DoS exposure.
 * @function validateKdfParams
 * @param {Object} meta Parsed header metadata.
 */
function validateKdfParams(meta) {
    if (meta.kdf !== KDF_ARGON2ID) throw new FormatError("unsupported kdf");
    if (typeof meta.salt !== "string") throw new FormatError("header salt must be a string");
    if (Buffer.from(meta.salt, "base64").length !== SALT_LEN) throw new FormatError("header salt must decode to 16 bytes");
    if (!Number.isInteger(meta.opslimit) || meta.opslimit < OPSLIMIT_MIN || meta.opslimit > OPSLIMIT_MAX) {
        throw new FormatError("header opslimit out of range");
    }
    if (!Number.isInteger(meta.memlimit) || meta.memlimit < MEMLIMIT_MIN || meta.memlimit > MEMLIMIT_MAX) {
        throw new FormatError("header memlimit out of range");
    }
    if (meta.keyLen !== KEY_LEN) throw new FormatError("header keyLen must be 32");
}

/**
 * Full validation of header metadata. The erase policy is DINO-only: CTX1
 * files have no counter region, so a CTX1 header carrying one is crafted.
 * @function _validateMeta
 * @param {Object} meta Header metadata.
 * @param {Boolean} allowErase Whether an erase policy may be present.
 */
function _validateMeta(meta, allowErase) {
    if (typeof meta !== "object" || meta === null || Array.isArray(meta)) throw new FormatError("header meta must be an object");
    if (meta.alg !== ALG_AES_256_GCM) throw new FormatError("unsupported algorithm");
    validateKdfParams(meta);
    sanitizeName(meta.name);
    if (meta.erase === undefined) return;
    if (!allowErase) throw new FormatError("erase policy not allowed in this format");
    if (typeof meta.erase !== "object" || meta.erase === null || Array.isArray(meta.erase)) {
        throw new FormatError("header erase must be an object");
    }
    const max = meta.erase.maxAttempts;
    if (!Number.isInteger(max) || max < Constants.ERASE_MAX_ATTEMPTS_MIN || max > Constants.ERASE_MAX_ATTEMPTS_MAX) {
        throw new FormatError("header erase maxAttempts out of range");
    }
}

/**
 * Identify the on-disk format from the first bytes of a file.
 * "CTX1" and "CTXBOX" diverge at byte 3, so CTX1 is checked first among the
 * CTX pair; anything without a known magic is treated as the raw legacy
 * layout (IV-first, no header).
 * @function detectFormat
 * @param {Buffer} firstBytes Up to the first 9 bytes of the file.
 * @return {String} "dino" | "ctx1" | "ctxbox" | "legacy"
 */
function detectFormat(firstBytes) {
    if (!Buffer.isBuffer(firstBytes)) return "legacy";
    if (firstBytes.length >= MAGIC_DINO.length && firstBytes.slice(0, MAGIC_DINO.length).equals(MAGIC_DINO)) return "dino";
    if (firstBytes.length >= MAGIC_V1.length && firstBytes.slice(0, MAGIC_V1.length).equals(MAGIC_V1)) return "ctx1";
    if (firstBytes.length >= CTXBOX_MAGIC.length && firstBytes.slice(0, CTXBOX_MAGIC.length).toString("utf-8") === CTXBOX_MAGIC) return "ctxbox";
    return "legacy";
}

/**
 * Build a DINO header. Runs the same validation as the parser so the encrypt
 * path can never emit a header the decrypt path would reject.
 * @function buildHeaderDino
 * @param {Object} meta Header metadata ({ alg, kdf, salt, opslimit, memlimit,
 *                      keyLen, name, erase? }).
 * @param {Number} flags Flags byte (FLAG_DIRECTORY or 0).
 * @return {Object} { aad, disk }: `disk` is what goes on disk (prefix +
 *                  zeroed mutable block + JSON); `aad` is `disk` without the
 *                  mutable block and is what the cipher authenticates.
 */
function buildHeaderDino(meta, flags) {
    if (!Number.isInteger(flags) || (flags & ~KNOWN_FLAGS) !== 0) throw new FormatError("unknown flag bits");
    _validateMeta(meta, true);
    const json = Buffer.from(JSON.stringify(meta), "utf-8");
    if (json.length > MAX_HEADER_JSON) throw new FormatError("header too large");
    const prefix = Buffer.alloc(PREFIX_LEN_V1);
    MAGIC_DINO.copy(prefix, 0);
    prefix.writeUInt8(VERSION_DINO, MAGIC_DINO.length);
    prefix.writeUInt8(flags, MAGIC_DINO.length + 1);
    prefix.writeUInt16BE(json.length, MAGIC_DINO.length + 2);
    return {
        aad: Buffer.concat([prefix, json]),
        disk: Buffer.concat([prefix, Buffer.alloc(MUTABLE_LEN), json])
    };
}

/**
 * Parse and bound-check the fixed 16-byte DINO prefix (including the mutable
 * block), so callers can read the JSON blob with a known, bounded length.
 * @function parsePrefixDino
 * @param {Buffer} buf At least the first 16 bytes of the file.
 * @return {Object} { version, flags, headerLen, counter }
 */
function parsePrefixDino(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < PREFIX_LEN_DINO) throw new FormatError("file too short for DINO header");
    if (!buf.slice(0, MAGIC_DINO.length).equals(MAGIC_DINO)) throw new FormatError("bad magic");
    const version = buf.readUInt8(MAGIC_DINO.length);
    if (version !== VERSION_DINO) throw new FormatError(`unsupported format version: ${version}`);
    const flags = buf.readUInt8(MAGIC_DINO.length + 1);
    if ((flags & ~KNOWN_FLAGS) !== 0) throw new FormatError("unknown flag bits");
    const headerLen = buf.readUInt16BE(MAGIC_DINO.length + 2);
    if (headerLen < 2 || headerLen > MAX_HEADER_JSON) throw new FormatError("header length out of range");
    const counter = buf.readUInt32BE(COUNTER_OFFSET);
    return { version, flags, headerLen, counter };
}

/**
 * Parse and validate a complete DINO header.
 * @function parseHeaderDino
 * @param {Buffer} headerBuf The raw prefix + mutable block + JSON bytes as read from disk.
 * @param {Number} fileSize Total file size, to reject truncated files early.
 * @return {Object} { flags, headerLen, meta, aadBytes, counter, payloadStart }
 *                  `aadBytes` excludes the mutable block; `payloadStart` is
 *                  the file offset of the IV.
 */
function parseHeaderDino(headerBuf, fileSize) {
    const { flags, headerLen, counter } = parsePrefixDino(headerBuf);
    if (headerBuf.length < PREFIX_LEN_DINO + headerLen) throw new FormatError("truncated header");
    if (fileSize < PREFIX_LEN_DINO + headerLen + IV_LEN + TAG_LEN) throw new FormatError("file too short for DINO payload");
    const json = headerBuf.slice(PREFIX_LEN_DINO, PREFIX_LEN_DINO + headerLen);
    let meta;
    try {
        meta = JSON.parse(json.toString("utf-8"));
    } catch (error) {
        throw new FormatError("header is not valid JSON");
    }
    _validateMeta(meta, true);
    return {
        flags,
        headerLen,
        meta,
        aadBytes: Buffer.concat([headerBuf.slice(0, PREFIX_LEN_V1), json]),
        counter,
        payloadStart: PREFIX_LEN_DINO + headerLen
    };
}

/**
 * Parse and bound-check the fixed 8-byte CTX1 prefix, so callers can read the
 * JSON blob with a known, bounded length (never more than MAX_HEADER_JSON).
 * @function parsePrefixV1
 * @param {Buffer} buf At least the first 8 bytes of the file.
 * @return {Object} { version, flags, headerLen }
 */
function parsePrefixV1(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < PREFIX_LEN_V1) throw new FormatError("file too short for CTX1 header");
    if (!buf.slice(0, MAGIC_V1.length).equals(MAGIC_V1)) throw new FormatError("bad magic");
    const version = buf.readUInt8(MAGIC_V1.length);
    if (version !== VERSION_V1) throw new FormatError(`unsupported format version: ${version}`);
    const flags = buf.readUInt8(MAGIC_V1.length + 1);
    if ((flags & ~KNOWN_FLAGS) !== 0) throw new FormatError("unknown flag bits");
    const headerLen = buf.readUInt16BE(MAGIC_V1.length + 2);
    if (headerLen < 2 || headerLen > MAX_HEADER_JSON) throw new FormatError("header length out of range");
    return { version, flags, headerLen };
}

/**
 * Parse and validate a complete CTX1 header.
 * @function parseHeaderV1
 * @param {Buffer} headerBuf The raw prefix + JSON bytes as read from disk.
 * @param {Number} fileSize Total file size, to reject truncated files early.
 * @return {Object} { flags, headerLen, meta, headerBytes }
 */
function parseHeaderV1(headerBuf, fileSize) {
    const { flags, headerLen } = parsePrefixV1(headerBuf);
    if (headerBuf.length < PREFIX_LEN_V1 + headerLen) throw new FormatError("truncated header");
    if (fileSize < PREFIX_LEN_V1 + headerLen + IV_LEN + TAG_LEN) throw new FormatError("file too short for CTX1 payload");
    const headerBytes = headerBuf.slice(0, PREFIX_LEN_V1 + headerLen);
    let meta;
    try {
        meta = JSON.parse(headerBytes.slice(PREFIX_LEN_V1).toString("utf-8"));
    } catch (error) {
        throw new FormatError("header is not valid JSON");
    }
    _validateMeta(meta, false);
    return { flags, headerLen, meta, headerBytes };
}

export default {
    MAGIC_DINO,
    VERSION_DINO,
    PREFIX_LEN_DINO,
    COUNTER_OFFSET,
    MUTABLE_LEN,
    MAGIC_V1,
    VERSION_V1,
    PREFIX_LEN_V1,
    MAX_HEADER_JSON,
    FLAG_DIRECTORY,
    IV_LEN,
    TAG_LEN,
    SALT_LEN,
    ALG_AES_256_GCM,
    KDF_ARGON2ID,
    KEY_LEN,
    OPSLIMIT_MIN,
    OPSLIMIT_MAX,
    MEMLIMIT_MIN,
    MEMLIMIT_MAX,
    CTXBOX_MAGIC,
    FormatError,
    detectFormat,
    buildHeaderDino,
    parsePrefixDino,
    parseHeaderDino,
    parsePrefixV1,
    parseHeaderV1,
    validateKdfParams,
    sanitizeName
};
