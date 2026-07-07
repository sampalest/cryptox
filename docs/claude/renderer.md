# Renderer and preload reference

The renderer is a Vue 3 app (Pinia + vue-router, hash history) running with context isolation; its only system access is the `window.lockasaur` bridge defined in the preload script. The UI is the Lockasaur design (APP-12): CSS custom-property tokens (light and dark sets), glassmorphism surfaces, bundled Poppins/Montserrat/DynaPuff fonts, a unified 42px in-page titlebar on every platform, and in-window About/Settings overlays. Materialize and animate.css are gone; all styling is first-party Sass plus scoped component styles.

## src/preload/index.js

Bundled to `dist-electron/preload.cjs`. Exposes `window.lockasaur` via `contextBridge.exposeInMainWorld`. Every member either invokes a specific channel or subscribes to a specific event; nothing generic (no raw `ipcRenderer`) is ever exposed. All `on*` subscription helpers return an unsubscribe function, and callers are expected to call it (the mixins do, in `finally`/`beforeUnmount`).

- `app.getInfo()`: invokes `app:info`.
- `app.setIcon(iconId)`: invokes `app:set-icon` with an icon id (main process enforces the allowlist and applies the Dock icon on macOS only); resolves to whether the icon was applied.
- `crypto.encrypt(file, password, operationId)` / `crypto.decrypt(...)`: invoke `crypto:encrypt` / `crypto:decrypt` with `{ file: { path }, password, operationId }`. Only `file.path` crosses the bridge.
- `crypto.cancel(operationId)`: invokes `crypto:cancel`.
- `crypto.onProgress(cb)` / `crypto.onStatus(cb)`: subscribe to `crypto:progress` / `crypto:status`. Payloads carry `operationId`, so subscribers must filter by id.
- `dialog.openFiles(kind)`: invokes `dialog:open-files` (`kind` is `"files"`, `"folder"`, or omitted for `"files"`), resolves to path strings.
- `menu.onOpenFile(cb)` / `menu.onAbout(cb)`: app/dock menu events.
- `files.ready()`: invokes `files:renderer-ready` (gates queued macOS open-file events and the smoke test).
- `files.getPathForFile(file)`: `webUtils.getPathForFile`, converts a DOM `File` (from drag-drop or `<input type=file>`) to an absolute path. The only way the renderer learns a real path from a File object.
- `files.confirmDeleteEncrypted(path)`: invokes `files:confirm-delete-encrypted`.
- `files.confirmDeleteOriginal(path)`: invokes `files:confirm-delete-original` (the post-encrypt delete-the-original prompt).
- `files.onOpenFile(cb)`: subscribes to `files:open-file` (macOS file association opens).
- `shell.openExternal(url)`: invokes `shell:open-external` (main process enforces the allowlist).
- `window.minimize()` / `window.close()`: invoke `window:minimize` / `window:close` (used by the custom Win/Linux window controls in the titlebar).
- `log.error(error)`: invokes `log:error` with `error.message` when present, else the value.

## src/renderer/main.js

Renderer entry: creates the Vue app with Pinia and the router, imports the Sass bundle, mounts on `#app`.

## Sass structure (src/renderer/sass/)

`main.scss` imports, in order: `components/fonts.scss` (@font-face for bundled Poppins 400/500/600, DynaPuff variable 400-700, and Montserrat 500/600/700, all woff2 with `font-display: swap`; Montserrat has no 400 face because nothing uses that weight; OFL license texts committed next to the font files), `components/tokens.scss` (the design tokens: light set on `#app`, dark set on `#app.dark`, plus the `.lk-glass`/`.lk-chip`/`.lk-input`/`.lk-overlay`/`.lk-title`/`.lk-sub`/`.lk-error` utility classes), `components/animations.scss` (all keyframes), `components/chrome.scss` (the 42px titlebar and its buttons), `components/master.scss` (html/body/#app shell, `.vertical-align*`, `.page-block`). The `.lk-input input` resets carry `!important` from the Materialize era; they are inert now and can be relaxed whenever touched next.

## src/renderer/App.vue

Root shell: renders `TitleBar` (all platforms), `BackgroundBlobs`, `.page-block > router-view`, the About/Settings overlays, and the `BinaryRain` easter-egg overlay (each v-if on the ui store; the three overlays are `defineAsyncComponent` chunks loaded on first open, CTX-17). `#app` classes: `dark` (from the theme store's `effectiveDark`), `platform-darwin`, `platform-frameless` (win32/linux). `#app` is the visible window: the BrowserWindow is transparent on every platform and `#app` carries `border-radius: 14px`, the background (`--page-bg`), and on Win/Linux a CSS drop shadow (macOS uses its native window shadow instead, `#app.platform-darwin { box-shadow: none }`). While an overlay is open `.page-block` gets `.page-block-muted` (opacity fade) for readability. `setup()` initializes the theme store; `beforeMount` awaits the app store's `load()` (the shared `app:info` fetch) and calls the appIcon store's `init(isMac)` to reapply a saved Dock icon choice (inert off macOS); the platform classes bind to the app store's getters. A watcher on the appIcon store's `resolvedIcon` calls `applyResolved()`, so the `auto` icon follows theme changes live. `mounted` registers a `document.visibilitychange` listener (removed on unmount) that sets the `lk-hidden` class on `#app` while the window is hidden; master.scss uses it to pause only the ambient infinite animations (blobs, dino halo, dino shadow), never one-shot entry animations, and window blur deliberately does not pause anything (CTX-17).

## src/renderer/components/TitleBar.vue

The unified draggable 42px chrome bar: centered LOCKASAUR title, right-side round icon buttons for About and Settings (writing to the ui store), plus minimize/close buttons when `showWindowControls` (Win/Linux; they call `window.lockasaur.window.*`). On macOS the left grid cell stays empty for the native traffic lights (`titleBarStyle: "hidden"` + `trafficLightPosition`). Buttons are `-webkit-app-region: no-drag`.

## src/renderer/components/BackgroundBlobs.vue

Three absolutely-positioned blurred radial-gradient blobs animating transform plus a border-radius morph (`blob` keyframes), `pointer-events: none`, behind `.page-block`. Rendering hints (CTX-17): `.lk-blob` carries `will-change: transform, filter` so the blur stays a compositor effect and the border-radius morph repaints only the small unblurred gradient; `.lk-blobs` adds `contain: layout style paint` (visually a no-op next to its `overflow: hidden`) so those per-frame invalidations stop at the container. The blobs (with the dino halo and its shadow animation) pause via `#app.lk-hidden` while the window is hidden (see App.vue and master.scss).

## src/renderer/components/ui/

- `GlassButton.vue`: the pill button. `variant="primary"` (blue gradient, white text) or `variant="glass"` (frosted surface with hover sheen sweep). Slot takes icon + label; emits `click`; `type` prop for submit buttons.
- `Wordmark.vue`: "Lock·a·saur" as per-letter spans (DynaPuff, blue-to-cyan ramp). Props `size` (font px) and `animate` (staggered `letterPop` + `wordBob`). Container has `aria-label="Lockasaur"`.
- `DinoLogo.vue`: the mascot (`assets/dino-vector.svg` inlined via `v-html` so CSS can reach the `#Brazo`/`#Brazo2` arm groups; the ~0.7 MB `?raw` source is a module-scope dynamic `import()` resolved into `dinoMarkup` in `created()`, so it ships as its own async chunk instead of sitting in the initial bundle, and `.lk-dino-svg` reserves the box with `aspect-ratio: 2002 / 2353` while it loads; CTX-17), `ringPulse` halo, `logoShadow` CSS drop-shadow animation. Click/keyboard replays the scoped `dinoPoke` body bob plus mirrored arm waves (timeouts cleared on unmount). Prop `size`. Long-press support for the easter egg: a primary-button `pointerdown` arms two timers, `hold-start` after 0.5 s (so quick clicks never flash the rain) and `hold-complete` after 5 s; `pointerup`/`pointerleave`/`pointercancel` before completion clear both and emit `hold-cancel` (no pointer capture, so dragging off the dino cancels); completion swallows the trailing click so it does not also poke. An early release still pokes, keeping quick clicks unchanged. Listeners are optional; only Home uses them.
- `LockasaurLock.vue`: the padlock artwork, one piece for every state: `assets/lockasaur-lock.svg` inlined via `?raw` + `v-html` (static build-time content, needed so CSS can reach the `#Arco` shackle group). The shackle is posed by a vertical translation alone: 0 is the open hook, `$closed-drop` (80px in the shackle's local units) drops it straight down so its right leg sinks behind the lock body and the loop reads shut; no image swap ever happens between states. In the SVG the `#Arco` id sits on an inner group with no `transform` attribute (a CSS transform would replace it rather than compose); the export's positioning matrix lives on a parent wrapper group, and re-exports of the asset must preserve that structure. The root box is sized to the artwork (width `size`, height `size` x 2407/1804). Prop `lockState`: `open` | `locked` (static closed pose) | `locking` (the shackle drops past the closed pose and settles shut, 0.9 s) | `unlocking` (the shackle springs up to open, 0.9 s).

## src/renderer/router/index.js

Two routes on hash history: `/` -> `Home.vue` (eager: it is the first paint) and the hidden easter-egg route `/rawr` -> `Rawr.vue` (lazy `() => import(...)` so its code stays out of the initial chunk; reached only by holding the Home dino, never linked in the UI). (The `/about` route and `About.vue` were replaced by the About overlay.)

## Stores (Pinia)

- `store/app.js`: shared platform info (CTX-17). State `{ platform: null }`, getters `isMac` / `isFrameless` (both false while the platform is unresolved, so consumers keep their safe defaults), action `load()` which memoizes the `app.getInfo()` promise at module scope so App.vue, Home and SettingsOverlay share one `app:info` IPC round-trip per renderer lifetime (the assignment reruns per store instance, so a fresh Pinia in unit tests still resolves).
- `store/files.js`: state `{ files: null }`, actions `setFiles` / `clearFiles`. Deferred file opens; cleared by the sysevents mixin on unmount.
- `store/theme.js`: appearance. State `mode` (`light` | `dark` | `system`, validated against an allowlist, persisted to `localStorage["lockasaur:theme"]`) and `systemDark` (live `prefers-color-scheme` listener registered in `init()`). Getter `effectiveDark` drives the `#app.dark` class. No IPC involved.
- `store/ui.js`: `aboutOpen` / `settingsOpen` booleans with `openAbout` / `openSettings` (mutually exclusive) / `closeOverlays`, plus `binaryRainActive` with `startBinaryRain` / `stopBinaryRain` for the easter-egg rain overlay (`closeOverlays` also clears it).
- `store/appIcon.js`: the macOS Dock icon choice (CTX-17). Exports `APP_ICONS` (id + label for `auto` plus the six appearance variants; the concrete ids mirror ipcValidation's `APP_ICON_IDS` and the `public/appicons` PNGs) and the store. State: `icon` (the selected option, may be `auto`, persisted to `localStorage["lockasaur:app-icon"]`), `applied` (the concrete icon last accepted by the main process, deduping IPC), `supported` (set from the platform in `init(supported)`; everything no-ops when false). Getter `resolvedIcon` maps `auto` to `dark`/`default` via the theme store's `effectiveDark`; `auto` itself never crosses the bridge. Actions: `init(supported)` (loads and reapplies the saved choice), `setIcon(id)` (optimistically selects, reverts and skips persisting if the apply fails), `applyResolved()` (pushes `resolvedIcon` through `app.setIcon`, committing `applied` only on acceptance). App.vue watches `resolvedIcon`, so an `auto` selection retargets the Dock icon live on theme or OS appearance changes.

## src/renderer/views/Home.vue

The main screen and state machine. Four exclusive UI states driven by data flags:

1. Default: animated wordmark, tagline, `DinoLogo`, drop zone (`FileLoader`), and GlassButtons calling the sysevents mixin's `onOpen`, all going through the native dialog so folders are selectable on every platform (an HTML file input cannot pick directories). On macOS a single merged button, "Feed the Dino" with a bone icon (primary, kind `"files"`, whose dialog picks both there; a `title` tooltip spells out "Select files or folders"); on Windows/Linux, where one native dialog cannot mix files and folders, Select Files (primary, kind `"files"`) plus Select Folder (glass, kind `"folder"`). The `isMac` flag is a computed over the app store (whose `load()` is awaited in `beforeMount`) and defaults to false, so both buttons render (and work) until it resolves.
2. `showPassword`: the `PasswordScreen` (receives `files` for its chip).
3. `loader`: the `EncryptLoader` running the operation (entered when `password` becomes non-empty, via watcher).
4. `success`: the `SuccessScreen` (entered from the loader's `finish` event via `operationFinished()`, which keeps `files` for the output chip; the loader's `cancel` event and the success screen's `done` both run `finishOperation()` back to default).

Key methods:

- `selectFile(files)`: normalizes the selection. Entries without a `path` are DOM Files and get converted to `FileManager` via `window.lockasaur.files.getPathForFile`. Sets `encrypted` when a name ends in any of `Constants.ENCRYPTED_POINT_EXTS` (`.dino` or legacy `.ctx`) and rejects mixed selections of encrypted and plain files (resets `this.files` then alerts). Then shows the password screen. The `encrypted` flag means "the selection is encrypted files", i.e. the operation will be a decrypt; it is passed to the children as the `isDecrypt` prop.
- `setPassword(password)` / `cancelPassword()` / `setDecrypt(bool)` / `operationFinished()` / `finishOperation()`: state transitions.
- `enterRawr()`: easter-egg entry, stops the rain and pushes the `rawr` route. Home wires the dino's hold events: `hold-start` -> `ui.startBinaryRain()`, `hold-cancel` -> `ui.stopBinaryRain()`, `hold-complete` -> `enterRawr`.

Mixin: `sysevents` (menu and open-file wiring).

## src/renderer/views/Rawr.vue

The hidden easter-egg page (route `/rawr`). Shows `DinoLogo` with its front arms waving continuously (scoped `rawrWaveR`/`rawrWaveL` keyframes reaching the `#Brazo`/`#Brazo2` groups via `:deep`), a "RAWR!" title (DynaPuff, looping `dinoCheer`), a centered thank-you message, and a primary `GlassButton` back to `home` (`router.push`, deterministic even without history). On mount it defensively stops the rain, creates `new Audio()` from the bundled `assets/dinosaur_rawr.mp3` (Vite emits it as a hashed asset; the CSP covers it via `default-src 'self'`, no `media-src` needed) and plays it; clicking the dino replays the roar on top of its poke. Esc goes home (window keydown listener, removed on unmount). `beforeUnmount` pauses the audio and drops its `src`, so navigating back mid-roar silences it immediately.

## src/renderer/components/overlays/BinaryRain.vue

The easter-egg falling binary rain, rendered from `App.vue` while `ui.binaryRainActive` is true (set from 0.5 s into a dino hold on Home until release or completion). Pure decoration: `aria-hidden`, `pointer-events: none` (the hold underneath keeps running), `z-index` above the titlebar, `border-radius: 14px` matching `#app`, and a translucent dark scrim legible over both themes. 26 randomized columns of 0/1 characters (each glyph a `.lk-rain-cell` span), Matrix-blue with a single hue but per-glyph lightness and rare near-white "head" glyphs so each column shimmers (`currentColor` also drives each glyph's glow via `text-shadow`), animate with a scoped `binaryFall` keyframe (linear, infinite, negative delays so the screen is full at frame one); the whole overlay fades in over 0.6 s. It carries no timing logic: the 5 s threshold lives in `DinoLogo`'s hold timer.

## src/renderer/components/FileLoader.vue

The drag-and-drop overlay, a large centered crystal-glass panel (transparent layered surface with a diagonal sheen, strong blur, rim highlight, floating files icon). Prevents default on all drag events, toggles its own visibility while a drag is over the window (opacity 0 but interactive when idle, so clicks bubble through to the logo behind), and emits `imageFile` with `e.dataTransfer.files` (DOM FileList) on drop. Name and emit event are historical ("image-loader"/"imageFile"); it handles any file.

## src/renderer/components/PasswordScreen.vue

Password form on glass inputs. Props: `isDecrypt` ("selection is encrypted", so the confirm field shows only for new encryption, when `isDecrypt` is false) and optional `files` (renders a chip with the first file's name, or "N files"). Validation in `checkPassword`: non-empty, length > 4, and matching retype for encryption; failures set an inline `.lk-error` line (cleared on input) and clear both fields; no `alert()`. On a successful submit it also clears its own `password`/`newPassword` (best-effort hygiene; JS strings cannot be truly zeroed). Each field has an eye toggle (`.lk-eye`, `type="button"`, aria-labeled) flipping its input between `password` and `text`, with independent `showPassword`/`showNewPassword` flags; both flip back to hidden whenever the fields are cleared (error and submit paths). Emits `setDecrypt` and `password` (which triggers Home's watcher into the loader state), plus `cancel`. Inputs carry `autocomplete`/`autocapitalize`/`autocorrect`/`spellcheck` hardening.

## src/renderer/components/EncryptLoader.vue

Operation progress screen. Props: `files`, `password`, `isDecrypt`. Title is "Encrypting..." or, when decrypting, "Lockasaur Open". Centerpiece is `LockasaurLock` mirroring the file's current state: `open` while encrypting and `locked` while decrypting, then on completion (`done` flag, set when the mixin's `finish` fires) it switches to `locking` (snaps shut) or `unlocking` (springs open) and the `dinoMunch` wobble stops so the transition reads clearly. It sits inside a `lockGlow` halo with floating binary digits (`nomFloat`). On mount it starts one operation per file: `isDecrypt: true` calls `decryptFile`, false calls `encryptFile`. The gradient progress bar uses `percent.value` (or full-width shimmer while `fileEvent.loader` is set: KDF, tar, finalization phases). The Cancel pill calls `cancelOperations()` from the filecryto mixin and emits `cancel`. `finish` (from the mixin, set only when every file has completed) emits `finish` after a tracked 2.1 s delay: the shackle's 0.9 s closing or opening animation plus at least a second of visible rest before the success screen takes over. `beforeUnmount` clears that pending emit and releases any still-registered progress/status listeners via `releaseAllHandlers()`. The mixin contract (`percent.value`, `fileEvent.*` field names, `finish`) must not be renamed.

## src/renderer/components/SuccessScreen.vue

Post-operation screen. Props `files`, `isDecrypt`; emits `done`. Shows a green check (`successRing` + `checkPop`) and an output-name chip derived in the renderer (encrypt: last extension replaced with `.dino`, mirroring the crypto.js naming; decrypt: the encrypted extension stripped; "N files" for multiple). The chip is informational only: the real output may carry a " (n)" collision suffix or a CTX1 header-derived name, and the IPC result deliberately carries no output path.

## src/renderer/components/mixins/filecryto.js

The renderer side of the crypto contract. Tracks active operation ids (`activeOperations`) and the progress/status unsubscribers (`offHandlers`), and exposes:

- `operationId()`: `window.crypto.randomUUID()`; UUIDs satisfy the main-process id pattern.
- `trackOperation` / `untrackOperation` / `cancelOperations()`: bookkeeping; cancel invokes `crypto.cancel` for every active id.
- `addHandlers` / `releaseHandlers(offs)` / `releaseAllHandlers()`: track and release the per-operation `onProgress`/`onStatus` unsubscribers. `releaseHandlers` (used in each operation's `.finally`) and `releaseAllHandlers` (used in `EncryptLoader.beforeUnmount`) are idempotent, so a listener is never double-released.
- `handleCryptoFailure(kind, result)`: logs only the stable error code (never payload content), alerts a per-kind user message from `FAILURE_MESSAGES` keyed by code (falling back to the result message), and cancels. `FAILURE_MESSAGES` covers all five `CRYPTO_ERROR_CODES` for both kinds, so no code falls through to a generic string. The decrypt `INVALID_FILE_TYPE` string names both accepted extensions (".dino and .ctx").
- `encryptFile(file)` / `decryptFile(file)`: subscribe to progress/status filtered by operationId (tracked via `addHandlers`), invoke the IPC call, then:
  - structured failure (`!result || result.ok === false`) -> `handleCryptoFailure`;
  - `result.cancelled` -> silently ignored (a cancelled operation must never count as success);
  - success: both kinds increment `fileEvent.counter` and set `finish` only when every selected file is done, after first offering the matching native delete prompt (encrypt: `confirmDeleteOriginal` for the plaintext source; decrypt: `confirmDeleteEncrypted` for the `.dino`/`.ctx` input), its failure isolated and only logged since the crypto operation already succeeded. Decrypt additionally checks the prompt result: `{ error: true }` (the encrypted file could not be removed) shows a dedicated notice so the refused deletion is never mistaken for a decrypt failure nor silently dropped;
  - `.catch` is the transport-level safety net only (logs `IPC_TRANSPORT`, generic alert, cancel);
  - `.finally` untracks the id and releases that operation's two listeners.

## src/renderer/components/mixins/sysevents.js

System event wiring used by Home: on mount it subscribes to menu open-file (runs `onOpen`, which shows the native dialog for a kind, `"files"` by default or `"folder"`, and feeds results through `selectFile` as `FileManager`s; Home's select buttons call the same method directly), menu about (opens the About overlay via the ui store; the `menu:about` channel is unchanged), and `files.onOpenFile` (macOS file associations), then signals `files.ready()`. On unmount it unsubscribes everything and clears the Pinia files store.

## Overlays (src/renderer/components/overlays/)

Both render as `.lk-overlay` glass sheets absolutely positioned below the titlebar inside `#app`, close on Esc (window keydown listener, removed on unmount) and via a Done button.

- `SettingsOverlay.vue`: the Appearance section (a Light/Dark/System segmented control bound to the theme store) and, on macOS only (the app store's `isMac`, loaded in `beforeMount`), the App Icon section (CTX-17): a 4-column tile grid over the appIcon store's `APP_ICONS` (Auto first, then the six variants), previews loaded from the bundled `appicons/<id>.png` (relative URL, so it resolves against the dev server in dev and `dist/` in prod), the Auto tile showing a diagonal split of the default and dark artwork (`clip-path`), the active tile marked with an accent inset ring, and a hint line that switches wording when Auto is selected.
- `AboutOverlay.vue`: wordmark, floating dino, tagline, version pill using the build-time `__APP_VERSION__` define (from vite.config.js; ESLint global), credit, GitHub glass pill calling `shell.openExternal` with the allowlisted repo URL, footer.
