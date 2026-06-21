# Main process reference

Everything in this document runs in the Electron main process. The renderer can only reach it through the IPC channels registered in `src/main/index.js`.

## src/main/index.js

Entry point of the main process (bundled to `dist-electron/background.cjs`, the `main` field of package.json).

### Module state

- `win`: the single `BrowserWindow`. Null when closed; recreated on macOS dock activate.
- `rendererReady`: set true when the renderer invokes `files:renderer-ready`. Guards event delivery.
- `pendingOpenFiles`: file paths received from macOS `open-file` events before the renderer was ready; flushed once it is.

### Functions

- `sendToRenderer(channel, payload)`: safe send to the window's webContents; no-op if the window is gone or destroyed.
- `flushPendingOpenFiles()`: replays queued `files:open-file` events once `rendererReady` is true.
- `openFile(file)`: queues or sends a macOS file-association open. Queues when the app/window/renderer is not ready yet.
- `buildApplicationMenu()`: builds the app menu (macOS app menu with About, File > Open File with Cmd/Ctrl+O) and the macOS dock menu. Menu clicks are forwarded to the renderer as `menu:open-file` / `menu:about` events.
- `createWindow()`: creates the 700x600 fixed-size window with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` and the bundled preload. Registers `setWindowOpenHandler` (denies every renderer-initiated window) and a `will-navigate` guard that only allows the dev server origin (dev) or the bundled `dist/index.html` file URL (prod); blocked navigations log a fixed string. Loads `VITE_DEV_SERVER_URL` in dev (opens devtools unless `IS_TEST`), otherwise `dist/index.html`. The renderer CSP lives as a meta tag in `index.html` (CTX-12).
- `failure(code, message)`: builds the structured failure result `{ ok: false, code, message }` returned over IPC.
- `toCryptoFailure(error, fallbackMessage)`: maps a thrown error to a structured failure. `IpcValidationError` keeps its code/message; `PathBusyError` becomes `OPERATION_FAILED` with a fixed string; anything else logs only the error name and returns the fallback message.
- `runRegisteredOperation(operationId, run, fallbackMessage)`: wraps an operation already registered in `OperationRegistry`. Resolves `{ ok: true, cancelled: false }` on success, `{ ok: true, cancelled: true }` on `CancelledError`, a structured failure otherwise, and always calls `OperationRegistry.finish(operationId)` in `finally`.
- `runSmokeTest()`: only under `CRYPTOX_SMOKE_TEST`. Verifies `window.cryptox` exists in the renderer (which proves the preload bridge works under `sandbox: true`) and that `window.open` does not create a second window, then exits 0/1; used by `tests/e2e/smoke.js`.

### App lifecycle handlers

- `open-file` (macOS): routes file-association opens through `openFile`.
- `will-quit`: safety net; `OperationRegistry.cancelAll()` then `TempManager.releaseAll()` so a quit mid-operation cancels streams and removes temp dirs.
- `window-all-closed`: quits except on macOS. `activate`: recreates the window. `ready`: builds the menu and window.
- In development, SIGTERM (or a `graceful-exit` message on Windows) quits cleanly; used by `scripts/electron-dev.mjs`.

### IPC handlers

All handlers live at module scope and gate on `isTrustedSender(event, win)` as their first line, rejecting devtools/other-window/webview senders before any side effect (the non-crypto handlers return an inert value: `[]`, `false`, or `undefined`). The crypto ones resolve with structured results, never reject (Electron strips custom error fields from rejections), and never put user content (paths, passwords, ids) into messages or logs.

- `files:renderer-ready`: `isTrustedSender`, then marks the renderer ready, flushes queued open-file events, triggers the smoke test when enabled.
- `app:info`: returns `{ locale, name, platform }` (or `undefined` for an untrusted sender).
- `dialog:open-files`: native open dialog (files and directories), returns the selected paths (or `[]` for an untrusted sender).
- `shell:open-external`: opens a URL after `validateExternalUrl` (https + hardcoded allowlist only).
- `crypto:encrypt`: trust check, `normalizeCryptoPayload`, `assertEncryptSource`, then registers the operation locking the source path and the predicted `<name>.ctx` output path, and runs `Crypto.encrypt`. Progress and status are pushed back on `crypto:progress` / `crypto:status` with the operationId attached.
- `crypto:decrypt`: same shape with `assertDecryptSource`; only the input path is locked (the output name is unknown until the header is parsed, and output placement is atomic). Fallback failure message is the fixed wrong-password string.
- `crypto:cancel`: trust check + `validateOperationId`, then `OperationRegistry.cancel`. Resolves `{ ok: true, cancelled: <bool> }`; a late cancel for a finished id resolves `cancelled: false`.
- `files:confirm-delete-encrypted`: `validateDeletePath` (must end in `.ctx`), native confirm dialog defaulting to Keep, unlinks only on explicit Delete. Returns whether the file was deleted.
- `log:error`: writes a renderer-supplied message to electron-log.

## src/main/ipcValidation.js

Pure validation helpers shared by the IPC handlers. All throw on invalid input; crypto-payload failures throw `IpcValidationError` with a stable code from `Constants.CRYPTO_ERROR_CODES`.

- `validateDeletePath(value)`: non-empty string ending in `.ctx`, otherwise throws. Gate for the delete handler.
- `validateExternalUrl(value)`: parses the URL, requires `https:` and membership in `ALLOWED_EXTERNAL_URLS` (the two GitHub repo URLs); returns the normalized href without a trailing slash.
- `isTrustedSender(event, win)`: true only when the event sender is exactly the app window's own `webContents` and the window is alive. Rejects devtools, other windows, webviews.
- `normalizeCryptoPayload(payload)`: requires `{ file: { path }, password, operationId }` with non-empty string path and password; returns `{ filePath, password, operationId }` with the id validated.
- `validateOperationId(value)`: must match `/^[A-Za-z0-9_-]{1,64}$/`; returns it.
- `statSource(filePath)` (internal): lstats (does NOT follow symlinks, matching `Utils.isDirectory`) with fixed-string errors (`FILE_NOT_FOUND` for ENOENT/ENOTDIR, `OPERATION_FAILED` otherwise). The path never appears in the message.
- `assertEncryptSource(filePath)`: must be a regular file or directory and must not already end in `.ctx`. Symlinks are rejected (lstat), so a symlinked source can never be encrypted as its link target.
- `assertDecryptSource(filePath)`: must be a regular file (lstat, so symlinks are rejected) and end in `.ctx`.

## src/main/operations.js

`OperationRegistry` (default export) plus `PathBusyError`. Static registry of in-flight operations in the main process.

- `register(operationId, crypto, paths)`: rejects duplicate ids; normalizes and de-duplicates the paths, throws `PathBusyError` if any is already claimed, then claims them and stores the `Crypto` instance. Prevents two operations from racing the same input or output file.
- `cancel(operationId)`: calls `crypto.cancel()` on the operation if it is active; returns whether anything was cancelled. Unknown ids are a safe no-op.
- `finish(operationId)`: releases path claims and removes the entry. Must be called from `finally` so success, failure and cancellation all free the paths (`runRegisteredOperation` does this).
- `cancelAll()`: cancels everything; used by `will-quit`.

## src/main/temp.js

`TempManager` (default export). Static map of per-operation temp directories.

- `acquire(operationId, baseDir?)`: returns the operation's existing dir, or creates one with `mkdtemp` under the OS temp dir (mode 0700 on POSIX). One dir per operation; concurrent operations can never share temp paths.
- `release(operationId)`: best-effort recursive removal; safe to call unconditionally in `finally` (no-op for unknown ids, swallows removal errors so cleanup never masks the operation's own result).
- `releaseAll()`: removes everything; used by `will-quit`.

## src/shared/constants.js

Shared constants (default export object):

- `EXT` / `POINT_EXT`: `"ctx"` / `".ctx"`, the encrypted-file extension.
- `CTX_MAGIC` ("CTXBOX") / `CTX_FORMAT_VERSION` (1): the interim 0.3.x alpha format; read-only support, never written.
- `CRYPTO_ERROR_CODES`: frozen map of the stable codes crossing IPC: `SENDER_REJECTED`, `INVALID_PAYLOAD`, `FILE_NOT_FOUND`, `INVALID_FILE_TYPE`, `OPERATION_FAILED`.
- `KEY_LEN` (32): AES-256 key length. Argon2id ops/mem limits are resolved at runtime from libsodium presets and stored per-file, not here.

## src/shared/exceptions.js

- `IpcValidationError(code, message)`: validation failure with a stable `code`; the IPC layer forwards both verbatim.
- `CancelledError(message?)`: thrown at cancellation checkpoints and used to destroy streams; carries `cancelled: true`. Mapped to `{ ok: true, cancelled: true }` by the handlers.
- `NoValidPassword(message)`, `DecryptError(message)`: legacy function-style errors still used by the renderer's password form.

## src/shared/filemanager.js

`FileManager`: minimal wrapper created from a path string; exposes `path`, `name` (last path segment, split on "/") and `extension()` (text after the last dot). Used by both processes to pass "file-like" objects around. Note the renderer also receives DOM `File` objects; `Home.vue` converts them to `FileManager` via the preload's `getPathForFile`.
