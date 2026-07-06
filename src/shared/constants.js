// Extension (APP-12): Lockasaur writes .dino; .ctx stays readable and
// deletable as the legacy Cryptox extension. Format detection is magic-byte
// based, so the extension only drives routing, validation and output naming.
const POINT_EXT = ".dino";
const EXT = "dino";
const LEGACY_POINT_EXT = ".ctx";
const ENCRYPTED_POINT_EXTS = Object.freeze([POINT_EXT, LEGACY_POINT_EXT]);

// Interim file format written by the 0.3.x alphas (read-only support: decrypt
// still understands it, but new files use the CTX1 format, see src/main/format.js).
// Raw legacy files have no magic at all (they begin with a raw 16-byte IV).
// The on-disk CTX1/CTXBOX format identity is unchanged by the .dino rebrand.
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
    LEGACY_POINT_EXT: LEGACY_POINT_EXT,
    ENCRYPTED_POINT_EXTS: ENCRYPTED_POINT_EXTS,
    CTX_MAGIC: CTX_MAGIC,
    CTX_FORMAT_VERSION: CTX_FORMAT_VERSION,
    CRYPTO_ERROR_CODES: CRYPTO_ERROR_CODES,
    KEY_LEN: KEY_LEN
};
