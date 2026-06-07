// Temporal
const TMP = "/tmp/cryptox";

// Extension
const POINT_EXT = ".ctx";
const EXT =  "ctx";

// Exceptions
const PASSWORD_ERROR = "password_error";

// File format: new .ctx files start with this magic + version, followed by a
// JSON KDF header. Legacy files have no magic (they begin with a raw 16-byte IV).
const CTX_MAGIC = "CTXBOX";
const CTX_FORMAT_VERSION = 1;

// Key derivation. Argon2id ops/mem limits are resolved at runtime from libsodium's
// MODERATE presets (see crypto.js) and stored per-file in the header, so these are
// only documented defaults. AES-256 needs a 32-byte key.
const KEY_LEN = 32;

export default {
    EXT: EXT,
    POINT_EXT: POINT_EXT,
    PASSWORD_ERROR: PASSWORD_ERROR,
    TMP: TMP,
    CTX_MAGIC: CTX_MAGIC,
    CTX_FORMAT_VERSION: CTX_FORMAT_VERSION,
    KEY_LEN: KEY_LEN
};
