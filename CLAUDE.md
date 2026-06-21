# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cryptox is an Electron + Vue 3 desktop app for encrypting files and folders with a password (macOS, Windows/Linux planned). Node 24 LTS (`nvm use`), npm with committed `package-lock.json`.

## Commands

```bash
npm run electron:serve   # run the app in development (Vite dev server + Electron)
npm run lint             # ESLint over src, tests, scripts, configs
npm run test:unit        # Jest unit tests (tests/unit/**/*.spec.js, runInBand)
npm run test:e2e         # builds, then real Electron smoke test (tests/e2e/smoke.js)
npm run test:large       # 1 GB payload tests; override size with CRYPTOX_LARGE_SIZE_MB=128
npm run build            # Vite renderer build into dist/
npm run build:electron   # bundle main + preload into dist-electron/ (background.cjs, preload.cjs)
npm run electron:build   # full package: dmg/zip artifacts via electron-builder
```

Run a single test file: `npx jest tests/unit/crypto.spec.js --runInBand`
Run a single test by name: `npx jest tests/unit/crypto.spec.js --runInBand -t "test name"`

Jest and Vite share the aliases `@` -> `src/renderer` and `@shared` -> `src/shared`; Jest additionally maps `@main` -> `src/main` for unit tests of main-process modules.

## Detailed code reference

Per-file, per-function documentation lives in `docs/claude/`. It goes one level deeper than this file: enough context to change a module without re-reading every other module first. Consult the relevant document before reading a module end to end, and update the matching section in the same commit when you change a documented function's contract (arguments, return shape, side effects, error behavior). Document behavior that exists, not behavior that is planned.

| Document | Covers |
|---|---|
| [main-process.md](docs/claude/main-process.md) | `main/index.js`, `main/ipcValidation.js`, `main/operations.js`, `main/temp.js`, `shared/constants.js`, `shared/exceptions.js`, `shared/filemanager.js` |
| [crypto.md](docs/claude/crypto.md) | `main/crypto.js`, `main/format.js`, `main/utils.js`, `main/vector.js` |
| [renderer.md](docs/claude/renderer.md) | `preload/index.js`, `renderer/main.js`, `App.vue`, `messages.js`, router, Pinia store, views, components, mixins |
| [build-test-release.md](docs/claude/build-test-release.md) | `scripts/`, test suites, CI and release flow |

## Architecture

`src/` is split by Electron process, mirroring the security boundary (the electron-vite convention). Context isolation is on, node integration off. Aliases are identical in vite.config.js, jest.config.js and scripts/build-electron.mjs: `@` resolves to `src/renderer`, `@shared` to `src/shared`, and (Jest only) `@main` to `src/main`. Main-process files use relative imports.

### `src/main/` (Electron main process)

- [index.js](src/main/index.js): window lifecycle, app menu, and every `ipcMain.handle` endpoint (`crypto:encrypt`, `crypto:decrypt`, `crypto:cancel`, `dialog:open-files`, `files:confirm-delete-encrypted`, `shell:open-external`, `app:info`, `log:error`, `files:renderer-ready`). Each handler validates its sender and payload through ipcValidation.js before touching the filesystem.
- [crypto.js](src/main/crypto.js): streaming AES-256-GCM with an Argon2id KDF (libsodium-sumo). One operation is one `Crypto` instance keyed by a validated, client-supplied `operationId`. Directories are tar'd (tar-fs) before encryption. Owns cancellation: `cancel()` destroys in-flight streams so later checkpoints throw `CancelledError`.
- [format.js](src/main/format.js): the versioned `CTX1` container format (magic, version, flags, JSON header used as GCM associated data). Deliberately pure (no fs, no sodium) so it stays unit-testable; keep it that way.
- [ipcValidation.js](src/main/ipcValidation.js): the single gate every IPC handler passes through. Sender trust check, payload normalization, operation-id pattern, delete-path allowlist, external-URL allowlist.
- [operations.js](src/main/operations.js): `OperationRegistry`, a static map of in-flight operations that rejects two operations touching the same normalized path (`PathBusyError`).
- [temp.js](src/main/temp.js): `TempManager`, per-operation `mkdtemp` directories (mode 0700), released unconditionally in `finally`.
- [utils.js](src/main/utils.js): filesystem helpers, including directory tar/untar and the hardened tar-entry validation applied on extraction.
- [vector.js](src/main/vector.js): a Transform stream that prepends the IV to the ciphertext, emitting it even when the plaintext is empty.

### `src/preload/` (context bridge)

- [index.js](src/preload/index.js): exposes the whole IPC surface to the renderer as `window.cryptox` via `contextBridge`. Event subscriptions (`onProgress`, `onStatus`, menu events) return an unsubscribe function. Imports from `electron` only, so the preload stays sandbox-compatible.

### `src/renderer/` (Vue 3 + Pinia + vue-router)

- [main.js](src/renderer/main.js): app entry point.
- `views/`, `components/`: screens and reusable UI pieces.
- `components/mixins/`: shared component behavior; `filecryto.js` drives encrypt/decrypt through `window.cryptox`.
- [store/files.js](src/renderer/store/files.js): the Pinia store holding the selected files.
- [messages.js](src/renderer/messages.js): user-facing strings, keyed by the error codes in shared/constants.js.
- `sass/`: styling, with a vendored Materialize 1.0 under `sass/materialize/` (kept on `@import` deliberately; see the vite.config.js comment).

### `src/shared/` (imported by both processes)

- [constants.js](src/shared/constants.js): IPC error codes (`CRYPTO_ERROR_CODES`), the `.ctx` extension, format constants and the AES key length.
- [exceptions.js](src/shared/exceptions.js): custom error types (`IpcValidationError`, `CancelledError`, plus the legacy `NoValidPassword` and `DecryptError`).
- [filemanager.js](src/shared/filemanager.js): a small helper that wraps a path with its name and extension.

### Crypto pipeline

Each crypto IPC call resolves to a structured result (`{ ok, code, message }`) rather than throwing, because Electron strips custom fields off errors that cross the process boundary (see the comment near the crypto handlers in index.js). Error codes live in [src/shared/constants.js](src/shared/constants.js); the renderer maps them to user-facing text in [src/renderer/messages.js](src/renderer/messages.js).

### Operation flow

How one operation actually runs, end to end:

- **Encrypt**: stat the source; if it is a directory, tar it into the operation's temp dir first. Derive the key with Argon2id from a fresh random salt, build the CTX1 header, then stream plaintext through AES-256-GCM into a staged file laid out as `[header][IV][ciphertext][auth tag]`. Progress reports 0 to 99% during streaming; the tag is appended, the file fsync'd and atomically moved into place, and only then does 100% fire.
- **Decrypt**: detect the format from the leading magic bytes (`Format.detectFormat`): CTX1, interim CTXBOX (0.3.x alphas), or raw legacy (IV first, unsalted SHA-256 key). Parse the bounded header, derive the key, and stream-decrypt into a staged file. GCM authentication only fails at stream end, so a wrong password produces partial garbage that is removed before rejecting. Authenticated output is then moved into place, or for directory payloads the tar is extracted via `Utils.unzipDirectory`.
- **Cancellation**: `Crypto.cancel()` destroys all tracked streams and makes later checkpoints throw `CancelledError`. The synchronous Argon2id and tar steps cannot be interrupted mid-call. A cancel racing stream completion never finalizes output, even if every byte reached disk. Handlers map `CancelledError` to `{ ok: true, cancelled: true }`.
- **Output placement**: outputs are staged as hidden `.cryptox-part-<random>` files in the destination directory (same filesystem, so the final move is atomic), opened with the `wx` flag, and moved to the first free "name (n)" variant via `link(2)` with a rename fallback. Nothing is ever overwritten.

### Build pipeline

The renderer builds with Vite into `dist/`; [scripts/build-electron.mjs](scripts/build-electron.mjs) bundles main and preload separately into `dist-electron/` (everything in `dependencies` plus Node builtins stays external). Both builds must run before packaging or starting Electron without `electron:serve`. `scripts/electron-dev.mjs` orchestrates dev mode via `VITE_DEV_SERVER_URL`.

## Security invariants

These are deliberate security properties of the app, written here so new code preserves them rather than reintroducing the weaknesses they fix. They must survive any refactor. When changing [src/main/index.js](src/main/index.js), [src/preload/index.js](src/preload/index.js), [src/main/ipcValidation.js](src/main/ipcValidation.js), [src/main/crypto.js](src/main/crypto.js), [src/main/format.js](src/main/format.js), or [src/main/utils.js](src/main/utils.js), check the change against this list; run `/security-review` for anything that alters the IPC surface or the file format.

- Renderer isolation: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` (explicit). The renderer reaches the system only through the `window.cryptox` bridge; never widen what preload exposes beyond specific validated channels. Preload must stay sandbox-compatible: imports from `electron` only.
- Renderer containment: `setWindowOpenHandler` denies all renderer-initiated windows; a `will-navigate` guard allows only the dev server origin (dev) or the bundled `dist/index.html` (prod); `index.html` carries a CSP meta tag (`script-src 'self'`, no remote origins; the `ws://localhost` connect-src entries exist only for Vite HMR). DevTools opens only in dev (`VITE_DEV_SERVER_URL` set and not `IS_TEST`).
- Every IPC handler (crypto and non-crypto alike) checks `isTrustedSender` first (only the app window's own `webContents`; devtools, other windows and webviews are rejected); non-crypto handlers return an inert value on rejection. The crypto handlers then validate the payload before touching the filesystem: `normalizeCryptoPayload`, operation id matching `[A-Za-z0-9_-]{1,64}`, `assertEncryptSource`/`assertDecryptSource`. Source validation uses `lstat` and rejects symlinks, so a symlinked source is never processed as its link target (the divergence with `Utils.isDirectory`, which also uses lstat, is closed).
- Failure messages are fixed strings. User-controlled content (paths, passwords, operation ids) never goes into error messages or logs.
- `files:confirm-delete-encrypted` deletes only paths ending in the `.ctx` extension and always behind a native confirm dialog. `shell:open-external` opens only https URLs from the hardcoded allowlist in ipcValidation.js.
- The CTX1 header is fed to AES-256-GCM as associated data: tampered metadata fails decryption. Header parsing is bounded (`MAX_HEADER_JSON` 4096, name length 255 with `sanitizeName` rejecting path separators, `validateKdfParams` clamping Argon2id params so a hostile header cannot trigger memory exhaustion). The memlimit ceiling is the MODERATE preset (256 MiB), exactly what the encrypt path writes, so a crafted header cannot pin more memory per decrypt than the app itself produces.
- Legacy and CTXBOX formats are decrypt-only compatibility paths; never write them. Their trailing extension field is NOT covered by the auth tag, so `sanitizeName` runs on the derived output name to stop path steering.
- Tar extraction rejects path traversal and anything that is not a regular file or directory (symlinks, hardlinks, devices, FIFOs are ignored).
- Staged outputs use random operation-owned names with `wx` open flags; the move into place never overwrites an existing file. A failed, cancelled or wrong-password operation must never leave output (or partial plaintext) visible at the final path.
- Temp directories are per-operation `mkdtemp` (mode 0700), released unconditionally in `finally`, and torn down on `will-quit`. `OperationRegistry` locks input/output paths so two operations cannot race the same file.
- The unsalted SHA-256 key derivation (`_getCipherKey`) exists only for legacy decryption. All new encryption uses Argon2id.

## Comments policy

Most inline comments in `src/` state one of the invariants above or a non-obvious "why" (cancel/completion races, fsync before move, GCM auth timing), not what the code does. When cleaning up comments: a comment whose content is captured in this file or is obvious from the code can go; a comment stating a constraint not yet recorded here should be moved into this file before deletion, not silently dropped.

## Conventions

- ESLint enforces 4-space indent, double quotes, semicolons, unix linebreaks.
- Never use the em-dash character, and do not use the hyphen "-" as a sentence separator either, anywhere and in any output: code, comments, docs, commit messages, CHANGELOG, chat responses. Use a comma, colon, or parentheses instead. Hyphens inside compound words (`context-isolation`, `AES-256-GCM`) and in CLI flags are fine. A hook enforces the em-dash ban in files and commits; the wider guidance applies to everything Claude writes.
- README covers project description, run, test, and build only; task history and upgrade notes belong in CHANGELOG.md.
- Commit messages and code comments reference the issue-tracker work-item id for the change.
