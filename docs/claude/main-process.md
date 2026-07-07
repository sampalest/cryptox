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
- `buildApplicationMenu()`: on macOS builds the app menu (About Lockasaur, File > Open File with Cmd/Ctrl+O) and the dock menu; on Windows/Linux it calls `Menu.setApplicationMenu(null)` so no native menu exists (file selection is button/drag only there). Menu clicks are forwarded to the renderer as `menu:open-file` / `menu:about` events.
- `createWindow()`: creates the 700x660 fixed-size window (660 = the design's 618px content area plus the 42px in-app titlebar, so the tallest screen keeps top/bottom margin without clipping) with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` and the bundled preload. The window is transparent on every platform (APP-12): the visible frame is the CSS-rounded `#app`. macOS keeps native traffic lights via `titleBarStyle: "hidden"` + `trafficLightPosition` (positioned inside the renderer's 42px titlebar); Windows/Linux are fully frameless (`frame: false`) with custom minimize/close controls in the renderer. Registers `setWindowOpenHandler` (denies every renderer-initiated window) and a `will-navigate` guard that only allows the dev server origin (dev) or the bundled `dist/index.html` file URL (prod); blocked navigations log a fixed string. Loads `VITE_DEV_SERVER_URL` in dev (opens devtools unless `IS_TEST`), otherwise `dist/index.html`. The renderer CSP lives as a meta tag in `index.html` (CTX-12).
- `failure(code, message)`: builds the structured failure result `{ ok: false, code, message }` returned over IPC.
- `toCryptoFailure(error, fallbackMessage)`: maps a thrown error to a structured failure. `IpcValidationError` keeps its code/message; `PathBusyError` becomes `OPERATION_FAILED` with a fixed string; anything else logs only the error name and returns the fallback message.
- `runRegisteredOperation(operationId, run, fallbackMessage)`: wraps an operation already registered in `OperationRegistry`. Resolves `{ ok: true, cancelled: false }` on success, `{ ok: true, cancelled: true }` on `CancelledError`, a structured failure otherwise, and always calls `OperationRegistry.finish(operationId)` in `finally`.
- `runSmokeTest()`: only under `LOCKASAUR_SMOKE_TEST`. Verifies `window.lockasaur` exists in the renderer (which proves the preload bridge works under `sandbox: true`) and that `window.open` does not create a second window, then exits 0/1; used by `tests/e2e/smoke.js`.

### App lifecycle handlers

- `open-file` (macOS): routes file-association opens through `openFile`.
- `will-quit`: safety net; `OperationRegistry.cancelAll()` then `TempManager.releaseAll()` so a quit mid-operation cancels streams and removes temp dirs.
- `window-all-closed`: quits except on macOS. `activate`: recreates the window. `ready`: builds the menu and window.
- In development, SIGTERM (or a `graceful-exit` message on Windows) quits cleanly; used by `scripts/electron-dev.mjs`.

### IPC handlers

All handlers live at module scope and gate on `isTrustedSender(event, win)` as their first line, rejecting devtools/other-window/webview senders before any side effect (the non-crypto handlers return an inert value: `[]`, `false`, or `undefined`). The crypto ones resolve with structured results, never reject (Electron strips custom error fields from rejections), and never put user content (paths, passwords, ids) into messages or logs.

- `files:renderer-ready`: `isTrustedSender`, then marks the renderer ready, flushes queued open-file events, triggers the smoke test when enabled.
- `app:info`: returns `{ locale, name, platform }` (or `undefined` for an untrusted sender).
- `dialog:open-files`: native open dialog, returns the selected paths. Takes a kind validated by `normalizeOpenDialogKind`: `"files"` (the default when the argument is omitted, e.g. by the macOS menu) or `"folder"`. `"folder"` shows a directory picker; `"files"` shows a file picker that on macOS also allows directories (one dialog can do both there), while Windows/Linux degrade combined pickers to folder-only, so `"files"` stays file-only on those platforms and Home offers a separate Select Folder button. Both kinds allow multi-selection. Returns `[]` for an untrusted sender or an unrecognized kind.
- `shell:open-external`: opens a URL after `validateExternalUrl` (https + hardcoded allowlist only).
- `crypto:encrypt`: trust check, `normalizeCryptoPayload`, `assertEncryptSource`, then registers the operation locking the source path and the predicted `<name>.dino` output path, and runs `Crypto.encrypt`. Progress and status are pushed back on `crypto:progress` / `crypto:status` with the operationId attached. On a fully completed (not cancelled, not failed) encrypt, the source path is recorded in the module-level `deletableOriginals` set, making it eligible for one `files:confirm-delete-original` prompt.
- `crypto:decrypt`: same shape with `assertDecryptSource`; only the input path is locked (the output name is unknown until the header is parsed, and output placement is atomic). Fallback failure message is the fixed wrong-password string.
- `crypto:cancel`: trust check + `validateOperationId`, then `OperationRegistry.cancel`. Resolves `{ ok: true, cancelled: <bool> }`; a late cancel for a finished id resolves `cancelled: false`.
- `files:confirm-delete-encrypted`: `validateDeletePath` (must end in `.dino` or the legacy `.ctx`), native confirm dialog defaulting to Keep, unlinks only on explicit Delete. Returns whether the file was deleted.
- `files:confirm-delete-original`: the post-encrypt mirror of the prompt above. `validateOriginalDeletePath` against the `deletableOriginals` set (paths recorded by `crypto:encrypt` on success); the entry is consumed before the dialog, so a path can be prompted for at most once per completed encrypt. Native confirm dialog defaulting to Keep; on explicit Delete it re-lstats the target, refuses symlinks and anything that is not a regular file or directory, then removes it permanently with `fs.rm({ recursive: true })` (deliberately not the system trash: parked plaintext would defeat the encryption). Returns whether the original was deleted.
- `log:error`: writes a renderer-supplied message to electron-log.

## src/main/ipcValidation.js

Pure validation helpers shared by the IPC handlers. All throw on invalid input; crypto-payload failures throw `IpcValidationError` with a stable code from `Constants.CRYPTO_ERROR_CODES`.

- `validateDeletePath(value)`: non-empty string ending in one of `Constants.ENCRYPTED_POINT_EXTS` (`.dino` or the legacy `.ctx`), otherwise throws a fixed-string error. Gate for the delete handler.
- `validateOriginalDeletePath(value, allowedPaths)`: non-empty string that is a member of the caller-owned `allowedPaths` set, otherwise throws a fixed-string error (the path never appears in it). Gate for the delete-original handler; membership, not extension, is the allowlist, because originals can have any name.
- `validateExternalUrl(value)`: parses the URL, requires `https:` and membership in `ALLOWED_EXTERNAL_URLS` (the two GitHub repo URLs); returns the normalized href without a trailing slash.
- `isTrustedSender(event, win)`: true only when the event sender is exactly the app window's own `webContents` and the window is alive. Rejects devtools, other windows, webviews.
- `normalizeCryptoPayload(payload)`: requires `{ file: { path }, password, operationId }` with non-empty string path and password; returns `{ filePath, password, operationId }` with the id validated.
- `validateOperationId(value)`: must match `/^[A-Za-z0-9_-]{1,64}$/`; returns it.
- `normalizeOpenDialogKind(value)`: allowlist for the open-dialog kind: `"files"` and `"folder"` pass through, `undefined` defaults to `"files"`, anything else returns `null` (the handler then answers with an inert `[]` instead of throwing).
- `statSource(filePath)` (internal): lstats (does NOT follow symlinks, matching `Utils.isDirectory`) with fixed-string errors (`FILE_NOT_FOUND` for ENOENT/ENOTDIR, `OPERATION_FAILED` otherwise). The path never appears in the message.
- `assertEncryptSource(filePath)`: must be a regular file or directory and must not already end in `.dino` or `.ctx` (both rejected, or a legacy file could be re-encrypted into a nested `.ctx.dino`). Symlinks are rejected (lstat), so a symlinked source can never be encrypted as its link target.
- `assertDecryptSource(filePath)`: must be a regular file (lstat, so symlinks are rejected) and end in `.dino` or the legacy `.ctx`.

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

- `EXT` / `POINT_EXT`: `"dino"` / `".dino"`, the extension new encryption writes. `LEGACY_POINT_EXT` (`".ctx"`) and `ENCRYPTED_POINT_EXTS` (frozen `[".dino", ".ctx"]`) cover the decrypt/delete compatibility paths. The on-disk CTX1 format identity is unchanged by the rebrand.
- `CTX_MAGIC` ("CTXBOX") / `CTX_FORMAT_VERSION` (1): the interim 0.3.x alpha format; read-only support, never written.
- `CRYPTO_ERROR_CODES`: frozen map of the stable codes crossing IPC: `SENDER_REJECTED`, `INVALID_PAYLOAD`, `FILE_NOT_FOUND`, `INVALID_FILE_TYPE`, `OPERATION_FAILED`.
- `KEY_LEN` (32): AES-256 key length. Argon2id ops/mem limits are resolved at runtime from libsodium presets and stored per-file, not here.

## src/shared/exceptions.js

- `IpcValidationError(code, message)`: validation failure with a stable `code`; the IPC layer forwards both verbatim.
- `CancelledError(message?)`: thrown at cancellation checkpoints and used to destroy streams; carries `cancelled: true`. Mapped to `{ ok: true, cancelled: true }` by the handlers.
- `NoValidPassword(message)`, `DecryptError(message)`: legacy function-style errors still used by the renderer's password form.

## src/shared/filemanager.js

`FileManager`: minimal wrapper created from a path string; exposes `path`, `name` (last path segment, split on "/") and `extension()` (text after the last dot). Used by both processes to pass "file-like" objects around. Note the renderer also receives DOM `File` objects; `Home.vue` converts them to `FileManager` via the preload's `getPathForFile`.
