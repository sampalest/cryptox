// Extension: Lockasaur writes .dino; .ctx stays readable and
// deletable as the extension of pre-rebrand releases. Format detection is magic-byte
// based, so the extension only drives routing, validation and output naming.
const POINT_EXT = ".dino";
const EXT = "dino";
const LEGACY_POINT_EXT = ".ctx";
const ENCRYPTED_POINT_EXTS = Object.freeze([POINT_EXT, LEGACY_POINT_EXT]);

// Interim file format written by the 0.3.x alphas (read-only support: decrypt
// still understands it, but new files use the DINO format, see src/main/format.js;
// CTX1 files from pre-DINO builds stay decryptable too).
// Raw legacy files have no magic at all (they begin with a raw 16-byte IV).
const CTX_MAGIC = "CTXBOX";
const CTX_FORMAT_VERSION = 1;

// Stable error codes returned to the renderer by the crypto IPC channels.
const CRYPTO_ERROR_CODES = Object.freeze({
    SENDER_REJECTED: "SENDER_REJECTED",
    INVALID_PAYLOAD: "INVALID_PAYLOAD",
    FILE_NOT_FOUND: "FILE_NOT_FOUND",
    INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
    OPERATION_FAILED: "OPERATION_FAILED",
    WRONG_PASSWORD: "WRONG_PASSWORD",
    FILE_ERASED: "FILE_ERASED"
});

// Erase-after-failed-attempts policy. The IPC payload only accepts the exact
// values the UI offers; the DINO format parser stays lenient within MIN..MAX
// so future builds can offer other counts without a format change.
const ERASE_ATTEMPT_OPTIONS = Object.freeze([3, 5, 10]);
const ERASE_MAX_ATTEMPTS_MIN = 1;
const ERASE_MAX_ATTEMPTS_MAX = 10;
const ERASE_MAX_ATTEMPTS_DEFAULT = 5;

// Key derivation. Argon2id ops/mem limits are resolved at runtime from libsodium's
// MODERATE presets (see crypto.js) and stored per-file in the header, so these are
// only documented defaults. AES-256 needs a 32-byte key.
const KEY_LEN = 32;

// Transparent gutter (px) reserved around #app on frameless platforms
// (win32/linux) so the CSS window shadow can paint without being clipped
// at the window bounds. Mirrored in sass/components/master.scss
// (#app.platform-frameless); keep the two values in sync.
const FRAMELESS_GUTTER = 32;

export default {
    EXT: EXT,
    POINT_EXT: POINT_EXT,
    LEGACY_POINT_EXT: LEGACY_POINT_EXT,
    ENCRYPTED_POINT_EXTS: ENCRYPTED_POINT_EXTS,
    CTX_MAGIC: CTX_MAGIC,
    CTX_FORMAT_VERSION: CTX_FORMAT_VERSION,
    CRYPTO_ERROR_CODES: CRYPTO_ERROR_CODES,
    ERASE_ATTEMPT_OPTIONS: ERASE_ATTEMPT_OPTIONS,
    ERASE_MAX_ATTEMPTS_MIN: ERASE_MAX_ATTEMPTS_MIN,
    ERASE_MAX_ATTEMPTS_MAX: ERASE_MAX_ATTEMPTS_MAX,
    ERASE_MAX_ATTEMPTS_DEFAULT: ERASE_MAX_ATTEMPTS_DEFAULT,
    KEY_LEN: KEY_LEN,
    FRAMELESS_GUTTER: FRAMELESS_GUTTER
};
