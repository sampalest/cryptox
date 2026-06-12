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

Per-file, per-function documentation lives in [docs/claude/](docs/claude/README.md): [main-process.md](docs/claude/main-process.md) (main process index.js, IPC validation, registries), [crypto.md](docs/claude/crypto.md) (crypto.js, format.js, utils.js, vector.js), [renderer.md](docs/claude/renderer.md) (preload bridge, Vue views/components/mixins, store), [build-test-release.md](docs/claude/build-test-release.md) (scripts, test suites, CI, packaging). Consult these before reading a module end to end; update the matching section in the same commit when changing a documented function's contract.

## Architecture

`src/` is split by Electron process, mirroring the security boundary (the electron-vite convention). Context isolation is on, node integration off:

- `src/main/` - the Electron main process. `src/preload/` - the context bridge. `src/renderer/` - the Vue app. `src/shared/` - the few modules both processes import ([constants.js](src/shared/constants.js), [exceptions.js](src/shared/exceptions.js), [filemanager.js](src/shared/filemanager.js)).
- Aliases (same in vite.config.js, jest.config.js and scripts/build-electron.mjs): `@` -> `src/renderer`, `@shared` -> `src/shared`, and in Jest `@main` -> `src/main`. Main-process files use relative imports.
- **Main process: [src/main/index.js](src/main/index.js)** - window lifecycle, app menu, and all `ipcMain.handle` endpoints (`crypto:encrypt`, `crypto:decrypt`, `crypto:cancel`, `dialog:open-files`, `files:confirm-delete-encrypted`, `shell:open-external`, `app:info`, `log:error`, `files:renderer-ready`). Every handler validates its sender and payload via [src/main/ipcValidation.js](src/main/ipcValidation.js) before touching the filesystem.
- **Preload: [src/preload/index.js](src/preload/index.js)** - exposes the whole IPC surface to the renderer as `window.cryptox` via `contextBridge`. Event subscriptions (`onProgress`, `onStatus`, menu events) return an unsubscribe function.
- **Renderer: Vue 3 + Pinia + vue-router** - entry [src/renderer/main.js](src/renderer/main.js), views in `src/renderer/views/`, components in `src/renderer/components/`, shared behavior in `src/renderer/components/mixins/` (`filecryto.js` drives encrypt/decrypt through `window.cryptox`). Selected files live in the Pinia store [src/renderer/store/files.js](src/renderer/store/files.js). Styling is Sass with a vendored Materialize 1.0 under `src/renderer/sass/materialize/` (kept on `@import` deliberately; see vite.config.js comment).

### Crypto pipeline (main process)

One operation = one `Crypto` instance keyed by an `operationId` (validated, client-supplied):

- **[src/main/crypto.js](src/main/crypto.js)** - streaming AES-256-GCM with an Argon2id KDF (libsodium-sumo). Directories are tar'd (tar-fs) before encryption. Owns cancellation: `cancel()` destroys in-flight streams and later checkpoints throw `CancelledError`.
- **[src/main/format.js](src/main/format.js)** - the versioned `CTX1` container format (magic, version, flags, JSON header used as GCM associated data). Deliberately pure (no fs/sodium) so it is unit-testable; keep it that way.
- **[src/main/operations.js](src/main/operations.js)** - `OperationRegistry`, a static map of in-flight operations that rejects two operations touching the same normalized path (`PathBusyError`).
- **[src/main/temp.js](src/main/temp.js)** - `TempManager`, per-operation `mkdtemp` directories; release unconditionally in `finally`.
- **[src/main/ipcValidation.js](src/main/ipcValidation.js)** - sender trust check, payload normalization, operation-id pattern, delete-path and external-URL allowlists.
- Errors cross IPC as structured results rather than rejections because Electron strips custom error fields (see comment near the crypto handlers in src/main/index.js). Error codes live in [src/shared/constants.js](src/shared/constants.js), user-facing strings in [src/renderer/messages.js](src/renderer/messages.js).

### Operation flow

How one operation actually runs, end to end:

- **Encrypt**: stat the source; if it is a directory, tar it into the operation's temp dir first. Derive the key with Argon2id from a fresh random salt, build the CTX1 header, then stream plaintext through AES-256-GCM into a staged file laid out as `[header][IV][ciphertext][auth tag]`. Progress reports 0-99% during streaming; the tag is appended, the file fsync'd and atomically moved into place, and only then does 100% fire.
- **Decrypt**: detect the format from the leading magic bytes (`Format.detectFormat`): CTX1, interim CTXBOX (0.3.x alphas), or raw legacy (IV-first, unsalted SHA-256 key). Parse the bounded header, derive the key, and stream-decrypt into a staged file. GCM authentication only fails at stream end, so a wrong password produces partial garbage that is removed before rejecting. Authenticated output is then moved into place, or for directory payloads the tar is extracted via `Utils.unzipDirectory`.
- **Cancellation**: `Crypto.cancel()` destroys all tracked streams and makes later checkpoints throw `CancelledError`. The synchronous Argon2id and tar steps cannot be interrupted mid-call. A cancel racing stream completion never finalizes output, even if every byte reached disk. Handlers map `CancelledError` to `{ ok: true, cancelled: true }`.
- **Output placement**: outputs are staged as hidden `.cryptox-part-<random>` files in the destination directory (same filesystem, so the final move is atomic), opened with the `wx` flag, and moved to the first free "name (n)" variant via `link(2)` with a rename fallback. Nothing is ever overwritten.

### Build pipeline

The renderer builds with Vite into `dist/`; [scripts/build-electron.mjs](scripts/build-electron.mjs) bundles main and preload separately into `dist-electron/` (everything in `dependencies` plus Node builtins stays external). Both builds must run before packaging or `electron:serve`-less startup. `scripts/electron-dev.mjs` orchestrates dev mode via `VITE_DEV_SERVER_URL`.

## Security invariants

These behaviors are deliberate hardening (the CTX-N work) and must survive any refactor. When changing [src/main/index.js](src/main/index.js), [src/preload/index.js](src/preload/index.js), [src/main/ipcValidation.js](src/main/ipcValidation.js), [src/main/crypto.js](src/main/crypto.js), [src/main/format.js](src/main/format.js), or [src/main/utils.js](src/main/utils.js), check the change against this list; run `/security-review` for anything that alters the IPC surface or the file format.

- Renderer isolation: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` (explicit). The renderer reaches the system only through the `window.cryptox` bridge; never widen what preload exposes beyond specific validated channels. Preload must stay sandbox-compatible: imports from `electron` only.
- Renderer containment (CTX-12): `setWindowOpenHandler` denies all renderer-initiated windows; a `will-navigate` guard allows only the dev server origin (dev) or the bundled `dist/index.html` (prod); `index.html` carries a CSP meta tag (`script-src 'self'`, no remote origins; the `ws://localhost` connect-src entries exist only for Vite HMR). DevTools opens only in dev (`VITE_DEV_SERVER_URL` set and not `IS_TEST`).
- Every crypto IPC handler first checks `isTrustedSender` (only the app window's own `webContents`; devtools, other windows and webviews are rejected) and validates the payload before touching the filesystem: `normalizeCryptoPayload`, operation id matching `[A-Za-z0-9_-]{1,64}`, `assertEncryptSource`/`assertDecryptSource` stat checks.
- Failure messages are fixed strings. User-controlled content (paths, passwords, operation ids) never goes into error messages or logs.
- `files:confirm-delete-encrypted` deletes only paths ending in the `.ctx` extension and always behind a native confirm dialog. `shell:open-external` opens only https URLs from the hardcoded allowlist in ipcValidation.js.
- The CTX1 header is fed to AES-256-GCM as associated data: tampered metadata fails decryption. Header parsing is bounded (`MAX_HEADER_JSON` 4096, name length 255 with `sanitizeName` rejecting path separators, `validateKdfParams` clamping Argon2id params so a hostile header cannot trigger memory exhaustion).
- Legacy and CTXBOX formats are decrypt-only compatibility paths; never write them. Their trailing extension field is NOT covered by the auth tag, so `sanitizeName` runs on the derived output name to stop path steering.
- Tar extraction rejects path traversal and anything that is not a regular file or directory (symlinks, hardlinks, devices, FIFOs are ignored).
- Staged outputs use random operation-owned names with `wx` open flags; the move into place never overwrites an existing file. A failed, cancelled or wrong-password operation must never leave output (or partial plaintext) visible at the final path.
- Temp directories are per-operation `mkdtemp` (mode 0700), released unconditionally in `finally`, and torn down on `will-quit`. `OperationRegistry` locks input/output paths so two operations cannot race the same file.
- The unsalted SHA-256 key derivation (`_getCipherKey`) exists only for legacy decryption. All new encryption uses Argon2id.

## Comments policy

Most inline comments in `src/` state one of the invariants above or a non-obvious "why" (cancel/completion races, fsync before move, GCM auth timing), not what the code does. When cleaning up comments: a comment whose content is captured in this file or is obvious from the code can go; a comment stating a constraint not yet recorded here should be moved into this file before deletion, not silently dropped.

## Conventions

- ESLint enforces 4-space indent, double quotes, semicolons, unix linebreaks.
- Never use the em-dash character, anywhere and in any output: code, comments, docs, commit messages, CHANGELOG, chat responses. Use a comma, colon, parentheses or " - " instead. A hook enforces this in files and commits, but it applies to everything Claude writes.
- README covers project description, run, test, and build only; task history and upgrade notes belong in CHANGELOG.md.
- Work items are tracked as CTX-N ids referenced in commit messages and code comments.
