# Cryptox code security audit

| | |
|---|---|
| **Date** | 2026-06-13 |
| **Version audited** | 0.3.8-alpha |
| **Commit** | `2c4d334` (branch `develop`) |
| **Scope** | Crypto core and main-process code: `src/main/crypto.js`, `format.js`, `vector.js`, `utils.js`, `ipcValidation.js`, `operations.js`, `temp.js`, `index.js`, `src/shared/*`, plus the IPC surface in `src/preload/index.js`. |
| **Method** | Per-file read of the listed modules, cross-checked against the "Security invariants" section of CLAUDE.md. Every finding below was re-read at the cited line by the author before inclusion. |

## Executive summary

The cryptographic core is sound. Nonce and salt generation, header-as-associated-data, the `wx` plus atomic-move staging discipline, tar extraction hardening, cancellation/completion race handling, and the operation-id allowlist are all correctly implemented, and every security invariant listed in CLAUDE.md was confirmed enforced in code. There are **no Critical or High findings**.

The one item worth acting on is a Medium denial-of-service surface: the Argon2id memory clamp permits up to 1 GiB per decrypt of an attacker-supplied file. The remaining items are robustness and hygiene improvements (defense-in-depth sender checks on non-crypto handlers, a Windows-only path-split bug, a symlink stat inconsistency, dead `console`-logging helpers).

## Findings

| ID | Severity | Location | Summary |
|---|---|---|---|
| CODE-01 | Medium | `format.js:43` | Argon2id memory clamp ceiling is 1 GiB, so a crafted header can pin gigabytes per decrypt (DoS). |
| CODE-02 | Low | `filemanager.js:3` | File name derived by splitting on `/` only; breaks on Windows paths (contained by `sanitizeName`). |
| CODE-03 | Low | `utils.js:122`, `ipcValidation.js:84` | `lstat` (encrypt) vs `stat` (validation) symlink inconsistency, plus a stat-to-use TOCTOU window. |
| CODE-04 | Low | `index.js:188-213, 320-340` | Non-crypto IPC handlers do not call `isTrustedSender` (defense-in-depth gap). |
| CODE-05 | Info | `utils.js:8-11, 27, 148-156` | Dead helpers use raw `console` logging and a no-arg `reject()`. |
| CODE-06 | Info | `crypto.js:449-486` | Legacy/CTXBOX unauthenticated `ext` field steers the tar branch (contained, by design). |

---

### CODE-01 (Medium): Argon2id memory clamp ceiling permits 1 GiB per decrypt

**Location:** `src/main/format.js:43` (`MEMLIMIT_MAX = 1073741824`), enforced at `format.js:89-91`, reached from the decrypt KDF paths in `crypto.js`.

**Description:** `validateKdfParams` clamps a header's `memlimit` to a 1 GiB ceiling and `opslimit` to 4 (the libsodium SENSITIVE preset). Because AES-256-GCM only authenticates at stream end, the Argon2id derivation needed to produce the key runs *before* any tag check can reject a tampered header. A hostile `.ctx` (CTX1 or interim CTXBOX) can therefore legitimately request a single derivation that allocates 1 GiB and runs the maximum ops count. The clamp itself is correct and the intent is documented at `format.js:36-39`; the concern is only that the chosen ceiling is the worst case.

**Impact:** A user who decrypts a malicious file (or a folder of them) faces a per-file 1 GiB transient allocation plus heavy CPU. On low-memory machines this can drive the process to OOM. This is a denial of service, not a confidentiality break.

**Recommendation:** The app's own encrypt path only ever writes MODERATE params (opslimit 3, 256 MiB, in `crypto.js`). Lower `MEMLIMIT_MAX` to the MODERATE preset (256 MiB) or a small multiple. Files the app produced still validate; only adversarially inflated headers are rejected. If forward compatibility with larger presets is wanted, keep 1 GiB but document the ceiling as the deliberate upper bound the app will tolerate.

### CODE-02 (Low): FileManager splits on "/" only, breaking Windows paths

**Location:** `src/shared/filemanager.js:3-6`.

**Description:** `this.name` is computed as `path.split("/").pop()`. On Windows a path like `C:\Users\me\secret.txt` has no forward slash, so `name` becomes the whole path. That value feeds the CTX1 header `name` field, which then runs through `sanitizeName` (`format.js:66-74`); since `sanitizeName` rejects `\`, a Windows path throws `FormatError` rather than smuggling anything dangerous.

**Impact:** No security bypass (the sanitizer is the backstop). On the Windows/Linux targets named as planned in CLAUDE.md, directory encryption and the embedded original-name would be unreliable. On the current macOS target it is benign.

**Recommendation:** Use `path.basename(path)` so the name is correct on all platforms, leaving `sanitizeName` as the security backstop rather than the only thing preventing a malformed name.

### CODE-03 (Low): lstat vs stat symlink inconsistency and stat-to-use TOCTOU

**Location:** `src/main/utils.js:122-124` (`isDirectory` uses `fs.lstatSync`), `src/main/ipcValidation.js:84-102` (`assertEncryptSource` uses `fs.promises.stat`).

**Description:** `assertEncryptSource` follows symlinks (`stat`) and accepts a regular file or directory. The encrypt path later calls `Utils.isDirectory`, which uses `lstat` (does not follow). A symlink pointing at a directory passes validation (stat sees a directory) but `isDirectory` returns false (lstat sees a link), so the encrypt path would `createReadStream` the symlink, which the OS follows, encrypting the target as a single file. There is also a classic TOCTOU window between the validation `stat` and the later stream open. `OperationRegistry` locks the path against other in-app operations but not against external filesystem changes.

**Impact:** Low. The path is chosen by the user through a native dialog, so this is largely self-inflicted, and the main process already holds the user's rights, so no privilege boundary is crossed. Mainly a correctness and robustness concern.

**Recommendation:** Pick one symlink policy and apply it in both places (reject symlinked sources outright, or use matching stat semantics). Where practical, re-stat through the open file descriptor rather than the path.

### CODE-04 (Low): non-crypto IPC handlers lack isTrustedSender

**Location:** `src/main/index.js:188-213` and `:320-340`.

**Description:** The CLAUDE.md invariant "every crypto IPC handler first checks `isTrustedSender`" is correctly enforced for `crypto:encrypt`, `crypto:decrypt`, and `crypto:cancel`. The non-crypto handlers do not call it: `dialog:open-files`, `shell:open-external` (mitigated by the URL allowlist), `files:confirm-delete-encrypted` (mitigated by the `.ctx`-only allowlist and native confirm), `log:error`, and `app:info`. `files:renderer-ready` does an inline `event.sender === win.webContents` check.

**Impact:** Low, and arguably not a live exposure given the renderer containment controls (sandbox, context isolation, denied window-open, navigation guard, CSP), which leave no realistic second WebContents to forge these calls. The invariant as literally written is satisfied; this is a defense-in-depth gap, not a violation.

**Recommendation:** Gate `files:confirm-delete-encrypted` (the most sensitive), and ideally `dialog:open-files` and `shell:open-external`, behind `isTrustedSender` for consistency. Cheap, and it removes any doubt if the containment model ever changes.

### CODE-05 (Info): dead helpers use raw console logging

**Location:** `src/main/utils.js:8-11` (`getFilesDir`, `console.error(err)` plus a no-arg `reject()` that does not `return`), `:27` (`zipDirectory` `console.error`), `:148-156` (`textToBuffer` `console.log`).

**Description:** These use `console.*` rather than the fixed-string `electron-log` discipline used elsewhere, and `getFilesDir`/`textToBuffer` appear to be unused. `getFilesDir`'s `console.error(err)` would print a raw fs error (possibly including a path) to stderr, and its no-arg `reject()` without a `return` also reaches `resolve(undefined)`, a latent correctness bug if revived.

**Impact:** Info. Not in the structured log and not returned to the renderer.

**Recommendation:** Remove the unused `getFilesDir` and `textToBuffer`, and drop the `console.error` in `zipDirectory` (the rejection already surfaces the error). Keeps the "fixed strings only" logging discipline uniform.

### CODE-06 (Info): legacy ext field steers the tar branch

**Location:** `src/main/crypto.js:449-486`.

**Description:** The unauthenticated 8-byte trailing `ext` field in legacy/CTXBOX files is read, de-padded, used to build the output name, and then passed through `sanitizeName` before any path is built, exactly as required. One nuance: the `ext === "tar"` decision is driven by this attacker-controllable field, so a tampered legacy file can flip a file payload into the tar-extraction path or vice versa. The tar path is itself hardened (see verified invariants) and `sanitizeName` still runs, so this yields no traversal; worst case is an extraction attempt on non-tar data that fails cleanly.

**Impact:** Info. These are decrypt-only legacy paths, unauthenticated by design.

**Recommendation:** None required. Optionally document that the ext-driven `isTar` branch on legacy files is attacker-influenced but contained by tar validation.

---

## Verified invariants

Each item below was confirmed enforced in code at the cited location.

- **IV and key uniqueness:** fresh 16-byte random IV per operation (`crypto.js:210`), per-file Argon2id key from a fresh 16-byte random salt (`crypto.js:185`); IV emitted even for empty plaintext (`vector.js:21-27`).
- **Header as associated data:** encrypt sets the full header as GCM AAD (`crypto.js:216`); CTX1 decrypt passes the header bytes as AAD (`crypto.js:381`). Tampered metadata fails the tag.
- **Auth-tag timing and wrong-password handling:** tag appended only after streaming (`crypto.js:263`) and verified at `decipher.final()`; staged plaintext is removed before rejecting on auth failure (`crypto.js:604-643`). Partial garbage never reaches the final path.
- **Argon2id bounds:** `validateKdfParams` enforces argon2id, a 16-byte salt, integer opslimit 1..4, integer memlimit 8192..1 GiB, keyLen 32 (`format.js:82-93`). See CODE-01 on the ceiling.
- **Bounded header parsing:** `MAX_HEADER_JSON` 4096 enforced (`format.js:134, 158`), header length range-checked, file-size lower bounds checked before reads.
- **sanitizeName:** rejects empty, over-255, `.`/`..`, separators, and control chars, and requires a bare basename (`format.js:66-74`); applied to CTX1 header name and to the derived legacy output name (`crypto.js:463`).
- **Staged outputs, never overwrite:** random `.cryptox-part-<hex>` dotfile opened `wx` (`crypto.js:218`); `_moveIntoPlace` uses `link(2)` (fails on EEXIST) with a guarded rename fallback, re-resolving the name on collision (`crypto.js:530-549`).
- **fsync before move:** `_flushToDisk` fsyncs the staged file before the atomic same-filesystem move (`crypto.js:498-505`).
- **Cancellation vs completion:** both finalizers re-check `_cancelled` before finalizing and instead remove output and reject (`crypto.js:253-257, 581`); `cancel()` destroys tracked streams (`crypto.js:31-38`). A cancel racing a fully written stream never finalizes output.
- **Partial-output cleanup:** staged file removed on any failure via idempotent teardown (`crypto.js:227-249, 604-616`).
- **Tar extraction hardening:** `_validateTarEntry` rejects non-file/non-directory types, absolute paths, `..` segments, and any name resolving outside the root; extraction goes to a fresh `mkdtemp` sibling and only renames in after a clean finish (`utils.js:41-119`).
- **Temp dir hygiene:** per-operation `mkdtemp` (0700), released unconditionally in `finally`, torn down on `will-quit` (`temp.js:22-55`, `crypto.js` finally blocks, `index.js:164-167`).
- **OperationRegistry locking:** resolves paths and rejects a second operation touching the same input/output with `PathBusyError` (`operations.js:33-43`); released in `finally`.
- **IPC sender trust and payload validation for crypto channels:** `isTrustedSender` first, then `normalizeCryptoPayload`, operation-id `^[A-Za-z0-9_-]{1,64}$`, and stat-based source checks (`index.js:253, 285, 312`; `ipcValidation.js:40-109`).
- **Delete allowlist:** `validateDeletePath` rejects non-`.ctx` paths, always behind a native confirm (`ipcValidation.js:13-23`, `index.js:320-336`).
- **External-URL allowlist:** https-only exact match against two hardcoded GitHub URLs; no bypass found (`ipcValidation.js:8-36`).
- **Fixed error strings:** crypto handlers return structured `{ ok, code, message }` with fixed strings, logging only `error.name` (`index.js:228-249`).
- **format.js purity:** imports only `node:path`; no fs, sodium, or crypto, so it never triggers KDF work (`format.js:1`).
- **Legacy SHA-256 key is decrypt-only:** `_getCipherKey` is referenced only from `_decryptLegacy` (`crypto.js:66-68, 441`); all encryption uses Argon2id.
