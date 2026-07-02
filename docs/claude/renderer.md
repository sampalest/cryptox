# Renderer and preload reference

The renderer is a Vue 3 app (Pinia + vue-router, hash history) running with context isolation; its only system access is the `window.cryptox` bridge defined in the preload script.

## src/preload/index.js

Bundled to `dist-electron/preload.cjs`. Exposes `window.cryptox` via `contextBridge.exposeInMainWorld`. Every member either invokes a specific channel or subscribes to a specific event; nothing generic (no raw `ipcRenderer`) is ever exposed. All `on*` subscription helpers return an unsubscribe function, and callers are expected to call it (the mixins do, in `finally`/`beforeUnmount`).

- `app.getInfo()`: invokes `app:info`.
- `crypto.encrypt(file, password, operationId)` / `crypto.decrypt(...)`: invoke `crypto:encrypt` / `crypto:decrypt` with `{ file: { path }, password, operationId }`. Only `file.path` crosses the bridge.
- `crypto.cancel(operationId)`: invokes `crypto:cancel`.
- `crypto.onProgress(cb)` / `crypto.onStatus(cb)`: subscribe to `crypto:progress` / `crypto:status`. Payloads carry `operationId`, so subscribers must filter by id.
- `dialog.openFiles()`: invokes `dialog:open-files`, resolves to path strings.
- `menu.onOpenFile(cb)` / `menu.onAbout(cb)`: app/dock menu events.
- `files.ready()`: invokes `files:renderer-ready` (gates queued macOS open-file events and the smoke test).
- `files.getPathForFile(file)`: `webUtils.getPathForFile`, converts a DOM `File` (from drag-drop or `<input type=file>`) to an absolute path. The only way the renderer learns a real path from a File object.
- `files.confirmDeleteEncrypted(path)`: invokes `files:confirm-delete-encrypted`.
- `files.onOpenFile(cb)`: subscribes to `files:open-file` (macOS file association opens).
- `shell.openExternal(url)`: invokes `shell:open-external` (main process enforces the allowlist).
- `log.error(error)`: invokes `log:error` with `error.message` when present, else the value.

## src/renderer/main.js

Renderer entry: creates the Vue app with Pinia and the router, imports the Sass bundle, Materialize JS and animate.css, mounts on `#app`.

## src/renderer/App.vue

Root shell: fake navbar strip, app title, `<router-view>`. On `beforeMount` it fetches `app:info`, derives the two-letter language and loads the matching `messages.js` table into `this.messages`. The draggable navbar strip (and the `platform-darwin` class on `#app`) renders only when `app:info.platform === "darwin"`, since it pairs with the macOS `hiddenInset` title bar; on Windows/Linux the native title bar stands and neither navbar div renders (APP-10).

## src/renderer/messages.js

Tiny i18n table (en/es) for renderer strings, keyed by message id. The language is picked in `App.vue` from `app:info`'s locale.

## src/renderer/router/index.js

Two routes on hash history: `/` -> `Home.vue`, `/about` -> `About.vue`.

## src/renderer/store/files.js

Pinia store `files` with state `{ files: null }` and actions `setFiles(files)` / `clearFiles()`. Cleared by the sysevents mixin on unmount.

## src/renderer/views/Home.vue

The main screen and state machine. Three exclusive UI states driven by data flags:

1. Default: title, logo, drop zone (`FileLoader`), Select Files button backed by a hidden multi-file `<input>`.
2. `showPassword`: the `PasswordScreen`.
3. `loader`: the `EncryptLoader` running the operation (entered when `password` becomes non-empty, via watcher).

Key methods:

- `selectFile(files)`: normalizes the selection. Entries without a `path` are DOM Files and get converted to `FileManager` via `window.cryptox.files.getPathForFile`. Sets `encrypted` from the `.ctx` extension and rejects mixed selections of encrypted and plain files (alert). Then shows the password screen. Note the `encrypted` flag means "the selection is .ctx files", i.e. the operation will be a decrypt.
- `inputFile(e)`: adapter from the hidden input's change event.
- `setPassword(password)` / `cancelPassword()` / `setEncrypt(bool)` / `finishOperation()`: state transitions back and forth between the three states.
- `animateLogo()`: cosmetic bounce on logo click with timeout-managed class.

Mixins: `animation` (staggered entry transitions), `sysevents` (menu and open-file wiring).

## src/renderer/views/About.vue

Static about page; the GitHub icon calls `window.cryptox.shell.openExternal` with the repo URL (which is in the main-process allowlist). Back link routes to `/`.

## src/renderer/components/FileLoader.vue

The drag-and-drop overlay. Prevents default on all drag events, toggles its own visibility while a drag is over the window, and emits `imageFile` with `e.dataTransfer.files` (DOM FileList) on drop. Name and emit event are historical ("image-loader"/"imageFile"); it handles any file.

## src/renderer/components/PasswordScreen.vue

Password form. Props: `isEncrypt` (here meaning "selection is .ctx", so the confirm field shows only for NEW encryption, when `isEncrypt` is false). Validation in `checkPassword`: non-empty, length > 4, and matching retype for encryption; failures alert and clear both fields. Emits `setEncrypt` and `password` (which triggers Home's watcher into the loader state), plus `cancel`.

## src/renderer/components/EncryptLoader.vue

Operation progress screen. Props: `files`, `password`, `isEncrypt`. On mount it starts one operation per file: NOTE the inversion, `isEncrypt: true` (selection is .ctx) calls `decryptFile`, false calls `encryptFile`. Shows determinate progress (`percent.value`) or the indeterminate bar while `fileEvent.loader` is set (KDF, tar, finalization phases). The Cancel link calls `cancelOperations()` from the filecryto mixin and emits `cancel`. A 5-second watchdog cancels if nothing has progressed and no loader phase is active. `finish` (from the mixin, set when all files completed) emits `finish` after a short delay.

## src/renderer/components/mixins/filecryto.js

The renderer side of the crypto contract. Tracks active operation ids (`activeOperations`) and exposes:

- `operationId()`: `window.crypto.randomUUID()`; UUIDs satisfy the main-process id pattern.
- `trackOperation` / `untrackOperation` / `cancelOperations()`: bookkeeping; cancel invokes `crypto.cancel` for every active id.
- `handleCryptoFailure(kind, result)`: logs only the stable error code (never payload content), alerts a per-kind user message from `FAILURE_MESSAGES` keyed by code (falling back to the result message), and cancels.
- `encryptFile(file)` / `decryptFile(file)`: subscribe to progress/status filtered by operationId, invoke the IPC call, then:
  - structured failure (`!result || result.ok === false`) -> `handleCryptoFailure`;
  - `result.cancelled` -> silently ignored (a cancelled operation must never count as success);
  - success: encrypt increments `fileEvent.counter` and sets `finish` when all files are done; decrypt offers `confirmDeleteEncrypted` (its failure is isolated and only logged, since decryption already succeeded) and sets `finish`;
  - `.catch` is the transport-level safety net only (logs `IPC_TRANSPORT`, generic alert, cancel);
  - `.finally` untracks the id and unsubscribes both listeners.

## src/renderer/components/mixins/sysevents.js

System event wiring used by Home: on mount it subscribes to menu open-file (runs the native dialog and feeds results through `selectFile` as `FileManager`s), menu about (routes to `/about`), and `files.onOpenFile` (macOS file associations), then signals `files.ready()`. On unmount it unsubscribes everything and clears the Pinia files store.

## src/renderer/components/mixins/animation.js

Cosmetic helpers for the staggered animate.css entry transitions (`beforeEnter`, `enter`, `enterDefault`), delay derived from each element's `data-index`.
