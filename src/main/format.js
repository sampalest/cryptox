import path from "node:path";

// CTX1 versioned encrypted file format.
//
//   offset 0  magic "CTX1" (4 bytes)
//   offset 4  version u8 = 1
//   offset 5  flags u8            bit 0 = payload is a tar'd directory; other bits must be 0
//   offset 6  headerLen u16BE     byte length of the JSON blob only
//   offset 8  JSON meta (headerLen bytes)
//             [IV 16][ciphertext][GCM auth tag 16]
//
// JSON meta: { alg, kdf, salt (base64), opslimit, memlimit, keyLen, name }.
// The raw header bytes (offset 0 through the end of the JSON) are passed to
// AES-256-GCM as associated data, so the auth tag covers the header: any
// tampering with the metadata fails decryption.
//
// This module is pure (no fs, no sodium, no node:crypto) so the parser/writer
// is trivially unit-testable and never triggers KDF work.

const MAGIC_V1 = Buffer.from("CTX1", "utf-8");
const VERSION_V1 = 1;
// magic (4) + version (1) + flags (1) + headerLen (2)
const PREFIX_LEN_V1 = MAGIC_V1.length + 1 + 1 + 2;
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
 * Full validation of CTX1 header metadata.
 * @function _validateMeta
 * @param {Object} meta Header metadata.
 */
function _validateMeta(meta) {
    if (typeof meta !== "object" || meta === null || Array.isArray(meta)) throw new FormatError("header meta must be an object");
    if (meta.alg !== ALG_AES_256_GCM) throw new FormatError("unsupported algorithm");
    validateKdfParams(meta);
    sanitizeName(meta.name);
}

/**
 * Identify the on-disk format from the first bytes of a file.
 * "CTX1" and "CTXBOX" diverge at byte 3, so CTX1 is checked first; anything
 * else is treated as the raw legacy layout (IV-first, no header).
 * @function detectFormat
 * @param {Buffer} firstBytes Up to the first 9 bytes of the file.
 * @return {String} "ctx1" | "ctxbox" | "legacy"
 */
function detectFormat(firstBytes) {
    if (!Buffer.isBuffer(firstBytes)) return "legacy";
    if (firstBytes.length >= MAGIC_V1.length && firstBytes.slice(0, MAGIC_V1.length).equals(MAGIC_V1)) return "ctx1";
    if (firstBytes.length >= CTXBOX_MAGIC.length && firstBytes.slice(0, CTXBOX_MAGIC.length).toString("utf-8") === CTXBOX_MAGIC) return "ctxbox";
    return "legacy";
}

/**
 * Build a CTX1 header. Runs the same validation as the parser so the encrypt
 * path can never emit a header the decrypt path would reject.
 * @function buildHeaderV1
 * @param {Object} meta Header metadata ({ alg, kdf, salt, opslimit, memlimit, keyLen, name }).
 * @param {Number} flags Flags byte (FLAG_DIRECTORY or 0).
 * @return {Buffer} The complete header bytes (prefix + JSON).
 */
function buildHeaderV1(meta, flags) {
    if (!Number.isInteger(flags) || (flags & ~KNOWN_FLAGS) !== 0) throw new FormatError("unknown flag bits");
    _validateMeta(meta);
    const json = Buffer.from(JSON.stringify(meta), "utf-8");
    if (json.length > MAX_HEADER_JSON) throw new FormatError("header too large");
    const prefix = Buffer.alloc(PREFIX_LEN_V1);
    MAGIC_V1.copy(prefix, 0);
    prefix.writeUInt8(VERSION_V1, MAGIC_V1.length);
    prefix.writeUInt8(flags, MAGIC_V1.length + 1);
    prefix.writeUInt16BE(json.length, MAGIC_V1.length + 2);
    return Buffer.concat([prefix, json]);
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
    _validateMeta(meta);
    return { flags, headerLen, meta, headerBytes };
}

export default {
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
    buildHeaderV1,
    parsePrefixV1,
    parseHeaderV1,
    validateKdfParams,
    sanitizeName
};
