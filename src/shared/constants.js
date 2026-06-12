// Extension
const POINT_EXT = ".ctx";
const EXT =  "ctx";

// Exceptions
const PASSWORD_ERROR = "password_error";

// Interim file format written by the 0.3.x alphas (read-only support: decrypt
// still understands it, but new files use the CTX1 format, see src/main/format.js).
// Raw legacy files have no magic at all (they begin with a raw 16-byte IV).
const CTX_MAGIC = "CTXBOX";
const CTX_FORMAT_VERSION = 1;

// Stable error codes returned to the renderer by the crypto IPC channels.
const CRYPTO_ERROR_CODES = Object.freeze({
    SENDER_REJECTED: "SENDER_REJECTED",
    INVALID_PAYLOAD: "INVALID_PAYLOAD",
    FILE_NOT_FOUND: "FILE_NOT_FOUND",
    INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
    OPERATION_FAILED: "OPERATION_FAILED"
});

// Key derivation. Argon2id ops/mem limits are resolved at runtime from libsodium's
// MODERATE presets (see crypto.js) and stored per-file in the header, so these are
// only documented defaults. AES-256 needs a 32-byte key.
const KEY_LEN = 32;

export default {
    EXT: EXT,
    POINT_EXT: POINT_EXT,
    PASSWORD_ERROR: PASSWORD_ERROR,
    CTX_MAGIC: CTX_MAGIC,
    CTX_FORMAT_VERSION: CTX_FORMAT_VERSION,
    CRYPTO_ERROR_CODES: CRYPTO_ERROR_CODES,
    KEY_LEN: KEY_LEN
};
