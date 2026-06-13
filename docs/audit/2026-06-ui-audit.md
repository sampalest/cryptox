# Cryptox UI audit (renderer security and UX)

| | |
|---|---|
| **Date** | 2026-06-13 |
| **Version audited** | 0.3.8-alpha |
| **Commit** | `2c4d334` (branch `develop`) |
| **Scope** | Renderer: `main.js`, `App.vue`, `views/Home.vue`, `views/About.vue`, `components/PasswordScreen.vue`, `FileLoader.vue`, `EncryptLoader.vue`, `components/mixins/{filecryto,animation,sysevents}.js`, `store/files.js`, `router/index.js`, `messages.js`, plus the renderer-facing surface of `src/preload/index.js`. |
| **Method** | Per-file read covering renderer security (XSS, password handling, bridge usage) and UX quality (error messaging, progress/cancellation, accessibility, state edge cases). Key findings re-read at the cited line before inclusion. |

## Executive summary

The renderer's security posture is good. The primary concern, an attacker-crafted filename embedded in a decrypted `.ctx` header reaching the UI, **does not occur**: the embedded name never leaves the main process, and all rendered text goes through escaping mustache/`v-text` bindings under a `script-src 'self'` CSP. Drag-and-drop resolves real paths through `webUtils` rather than trusting renderer input, and every `alert`/log string is static or a stable error code. There are no high-severity security findings; the security items are all Low hardening (a static-string `v-html`, password-field autocomplete attributes, explicit password clearing on the success path).

The more impactful issues are in **UX and maintainability**:

- The curated `messages.js` locale system is effectively dead code, error strings are hardcoded in `filecryto.js`, and two of the five error codes (`SENDER_REJECTED`, `INVALID_PAYLOAD`) map to nothing.
- The `isEncrypt` flag means the literal opposite of its name everywhere, cancelled out by double negation in three templates: a latent encrypt/decrypt swap regression.
- Multi-file decrypt finishes after the first file, tearing the view down while other files are still in flight.
- Several primary actions (Select Files, Cancel, GitHub, Back) are not keyboard or screen-reader operable.

## Security findings

| ID | Severity | Location | Summary |
|---|---|---|---|
| UI-SEC-01 | Low | `PasswordScreen.vue:26` | `v-html` used to render a static button label. |
| UI-SEC-02 | Low | `Home.vue:40`, `PasswordScreen.vue:81-84` | Password not explicitly cleared on the success path. |
| UI-SEC-03 | Low | `PasswordScreen.vue:11, 18` | Password fields lack autocomplete/autocorrect/spellcheck attributes. |

### UI-SEC-01 (Low): v-html for a static label

**Location:** `src/renderer/components/PasswordScreen.vue:26` (`<span v-html="!isEncrypt ? 'Encrypt' : 'Decrypt'">`).

**Description:** `v-html` renders one of two hardcoded literals, so there is no injection vector today. But `v-html` is the most dangerous Vue directive, and the sibling `<i v-text=...>` on line 25 already uses the safe form, so this is inconsistent and a footgun if the ternary later becomes dynamic or localized.

**Impact:** No exploit today; a latent XSS risk if the bound value ever becomes attacker-influenced.

**Recommendation:** Replace with `v-text` or mustache interpolation. There is no reason to use `v-html` for a static label.

### UI-SEC-02 (Low): password not cleared on the success path

**Location:** `Home.vue:40, 66-68, 100-104`; `PasswordScreen.vue:44-45, 57-84`; passed as a prop into `EncryptLoader`.

**Description:** The plaintext password lives in `PasswordScreen.password`/`newPassword`, in `Home.password`, and as an `EncryptLoader` prop. `Home.cancelPassword()` and the error watcher reset `Home.password`, and `PasswordScreen.checkPassword` clears its locals on error. On the **success** path, `PasswordScreen` emits but never clears its own `password`/`newPassword` (the component is unmounted and the string left to GC). `Home.password` is reset via `cancelPassword`, which `finishOperation` does call.

**Impact:** JS strings are immutable, so true zeroing is impossible regardless. The realistic residual is that the password sits in heap-reachable reactive state until GC. Acceptable for this threat model.

**Recommendation:** Clear `PasswordScreen.password`/`newPassword` after a successful emit too, for consistency, and add a comment noting that JS string immutability prevents real scrubbing so future readers do not assume cryptographic guarantees.

### UI-SEC-03 (Low): password fields lack input-hardening attributes

**Location:** `src/renderer/components/PasswordScreen.vue:11` and `:18`.

**Description:** Both `<input type="password">` fields lack `autocomplete` (`new-password`/`current-password`), `autocapitalize="off"`, `autocorrect="off"`, and `spellcheck="false"`. In Electron, browser password-save is usually inert, but autofill heuristics can still fire, and autocorrect can silently alter a typed password, producing confusing "wrong password" failures.

**Impact:** Minor autofill noise; possible silent password mangling on some platforms.

**Recommendation:** Add `autocomplete="new-password"` on the encrypt/confirm fields, `autocomplete="current-password"` on the decrypt field, plus `autocapitalize="off" autocorrect="off" spellcheck="false"`.

---

## UX findings

| ID | Priority | Location | Summary |
|---|---|---|---|
| UI-UX-01 | High | `messages.js`, `filecryto.js:1-12` | Locale system is dead code; 2 of 5 error codes map to no message. |
| UI-UX-02 | High | `EncryptLoader.vue:90-100` | `isEncrypt` means the opposite of its name; encrypt/decrypt swap risk. |
| UI-UX-03 | Medium | `EncryptLoader.vue:90-100`, `filecryto.js:96` | Multi-file decrypt finishes after the first file. |
| UI-UX-04 | Medium | `EncryptLoader.vue:102-106` | 5-second auto-cancel watchdog can abort slow legitimate operations. |
| UI-UX-05 | Medium | `EncryptLoader.vue` (no beforeUnmount) | Timers and in-flight listeners not cleared on unmount. |
| UI-UX-06 | Medium | `Home.vue`, `About.vue`, `EncryptLoader.vue`, `PasswordScreen.vue` | Icon-only and clickable-div actions are not keyboard/AT operable. |
| UI-UX-07 | Medium | all `alert()` calls | Blocking native `alert` for all feedback; unstyled, untranslated. |
| UI-UX-08 | Low | `Home.vue:89-92` | Grammar typo and partial state mutation on mixed-selection early return. |

### UI-UX-01 (High): the locale system is disconnected from the error codes

**Location:** `src/renderer/messages.js:1-12` vs `src/shared/constants.js:15-21`; consumer `src/renderer/components/mixins/filecryto.js:1-12`.

**Description:** None of the five `CRYPTO_ERROR_CODES` have a string in `messages.js`, which defines only `password_error` and `home_subtitle`. The codes are instead mapped by a separate hardcoded `FAILURE_MESSAGES` table inside `filecryto.js:1-12`, and that table covers only `FILE_NOT_FOUND`, `INVALID_FILE_TYPE`, and `OPERATION_FAILED`. `SENDER_REJECTED` and `INVALID_PAYLOAD` have no mapping anywhere. When main returns one of those, `messages[code]` is `undefined` and the user falls through to `result.message` or `"The operation failed."` (`filecryto.js:43`). Meanwhile `App.vue` loads `Messages[locale]` into `this.messages` but nothing consumes it, and the `PASSWORD_ERROR` constant is unused: the locale machinery is dead code.

**Impact:** A maintenance hazard and i18n gap. The two newer validation codes silently fall through to a generic message, and the locale system gives a false impression that errors are localized when they are hardcoded English in `filecryto.js`. Not a raw-code leak (the generic fallback prevents that).

**Recommendation:** Consolidate. Either route `FAILURE_MESSAGES` through `messages.js`/locale, or delete the unused locale plumbing in `App.vue`/`messages.js`. At minimum add `SENDER_REJECTED` and `INVALID_PAYLOAD` so every code maps to a deliberate string.

### UI-UX-02 (High): isEncrypt is inverted relative to its name

**Location:** `src/renderer/components/EncryptLoader.vue:90-100`, driven by `Home.vue` and the `encrypted`/`isEncrypt` flags.

**Description:** In `EncryptLoader.mounted()`, `if (this.isEncrypt) this.decryptFile(file); else this.encryptFile(file);`. So `isEncrypt === true` calls **decrypt**. This is internally consistent with `Home`'s `encrypted` flag (set true when files end in `.ctx`, meaning they need decrypting), and the template labels compensate with matching negation (`EncryptLoader.vue:5` `!isEncrypt ? 'Encrypting' : 'Decrypting'`; `PasswordScreen.vue:26` `!isEncrypt ? 'Encrypt' : 'Decrypt'`). Labels currently display correctly, so this is a maintainability finding, not a live bug.

**Impact:** The variable means the literal opposite of its value everywhere, cancelled out by double negation across three templates. Any future edit that "corrects" one of the `!isEncrypt` expressions to match the name will silently swap encrypt and decrypt.

**Recommendation:** Rename to `isDecrypt` (or invert the flag at the `Home` boundary), then drop the compensating `!` negations.

### UI-UX-03 (Medium): multi-file decrypt finishes after the first file

**Location:** `EncryptLoader.vue:90-100` (fires all operations concurrently); `filecryto.js:96` (decrypt sets `finish = true` after the first file); contrast `filecryto.js:60-62` (encrypt waits for `counter == files.length`).

**Description:** `mounted()` iterates `files.forEach(...)`, firing every operation concurrently against a single shared `percent`/`fileEvent`. Encrypt increments a counter and finishes only when all files complete. Decrypt sets `finish` after the first file regardless of how many were selected, so multi-file decrypt reports done and tears the loader down while other decrypts may still be running. Their in-flight listeners then write to a torn-down component (ties into UI-UX-05).

**Impact:** Multi-file decrypt closes early; remaining files complete with no UI, and the shared single progress bar is misleading for multi-select.

**Recommendation:** Mirror the encrypt counter logic for decrypt (`counter == files.length`) before setting `finish`. Consider per-file progress rows or sequential processing.

### UI-UX-04 (Medium): 5-second auto-cancel watchdog

**Location:** `src/renderer/components/EncryptLoader.vue:102-106`.

**Description:** If, after 5 seconds, progress is still 0 and not in a `loader` (indeterminate) phase, the operation auto-cancels. The Argon2id KDF and large-file/tar prep can legitimately take longer than 5 seconds before the first progress tick. The `!fileEvent.loader` guard helps, but there are windows (slow stat on a huge file before `loader:true` fires) where a valid operation at 0% gets killed.

**Impact:** Spurious cancellation of valid operations on slow disks or large inputs, presented as a silent abort.

**Recommendation:** Remove the watchdog, or key it off an explicit "not started" signal from main rather than a 0%/loader heuristic. The timer is also never cleared on unmount (UI-UX-05).

### UI-UX-05 (Medium): timers and listeners not cleared on unmount

**Location:** `EncryptLoader.vue:102` (`STOcancel`, never cleared; no `beforeUnmount`); `Home.vue:115` (`animationSTO` cleared on re-trigger but not on unmount); listener registration in `filecryto.js:48-72, 104-108`.

**Description:** `EncryptLoader` has no `beforeUnmount`. If it unmounts within 5 seconds (cancel, navigate, fast finish), `STOcancel` still fires against a torn-down instance and calls `cancel()`/`$emit` on a dead component. The per-operation `offProgress`/`offStatus` unsubscribers are local closures inside `filecryto.js`, released only when the promise settles, not at unmount, so a destroyed `EncryptLoader` can briefly retain live `crypto:progress`/`crypto:status` listeners writing to a dead reactive object. (Menu/open-file listeners in `sysevents.js` are correctly unsubscribed in `beforeUnmount`, and the per-operation listeners do release in `.finally`.)

**Impact:** Stale timers and handlers; harmless today but a classic source of "cancel fired after I already finished" races.

**Recommendation:** Add `beforeUnmount() { clearTimeout(this.STOcancel); }` to `EncryptLoader`, track the `off*` functions on the instance and release them there too, and clear `animationSTO` in a `Home` `beforeUnmount`.

### UI-UX-06 (Medium): keyboard and screen-reader gaps on primary actions

**Location:** `Home.vue:18` (Select Files as hrefless `<a>`), `Home.vue:10` (logo `<div @click>`), `About.vue:3` (GitHub `<div @click>`), `About.vue:15` (back `<img>` with no `alt`), `EncryptLoader.vue:18` and `PasswordScreen.vue:31` (Cancel as hrefless `<a>`), `PasswordScreen.vue:10, 17` (decorative `<i>` icons not hidden from AT).

**Description:** Several primary actions (Select Files, Cancel, GitHub, Back) are `<div>`/hrefless `<a>` with click handlers only, so they cannot be reached or activated by keyboard and screen readers get no role or label. The form submit button in `PasswordScreen` is a proper `<button type="submit">` and inputs have `<label for>` (good).

**Impact:** Keyboard-only and screen-reader users cannot operate Select Files, Cancel, GitHub, or Back.

**Recommendation:** Convert clickable `div`/`a` actions to `<button type="button">` (or add `role="button" tabindex="0"` with `@keydown.enter/space`), add `aria-label` to icon-only buttons, `alt` to the back-button image, and `aria-hidden="true"` to decorative material-icons.

### UI-UX-07 (Medium): native alert for all feedback

**Location:** all `alert()` calls (`Home.vue:90`, `PasswordScreen.vue:78`, `EncryptLoader.vue:73`, `filecryto.js:43, 64, 101`).

**Description:** Errors and the mixed-selection warning use blocking `window.alert`, which is jarring, unstyled, and untranslated (ties into UI-UX-01). The destructive delete-original action is correctly gated behind a native confirm in the main process (`files:confirm-delete-encrypted` with the `.ctx` allowlist), so that path is safe.

**Impact:** Inconsistent, non-localized error UX; `alert` blocks the event loop.

**Recommendation:** Replace `alert` with in-app toast/inline messaging sourced from `messages.js` per locale.

### UI-UX-08 (Low): mixed-selection grammar and partial state

**Location:** `src/renderer/views/Home.vue:89-92`.

**Description:** The message reads "Cannot mixing encrypted and decrypted files." On a mixed selection it alerts and returns, but `this.files` was already assigned and is left populated while `showPassword` is not set, so state is partially mutated.

**Recommendation:** Fix the wording ("Cannot mix encrypted and unencrypted files.") and reset `this.files = null` on the early return.

---

## Verified good

- No path or header content is rendered via `v-html`; the one `v-html` is a static literal (UI-SEC-01). `About.vue:18` uses `v-text` so `<>` renders as literal text.
- The attacker-controlled embedded name from a decrypted header never reaches the UI: `fileEvent.filename` is set only on the encrypt path (`crypto.js:163`, the on-disk source name), never from the header name on decrypt. Mustache interpolation would escape it anyway, under `script-src 'self'`.
- Drag-and-drop resolves real paths via `window.cryptox.files.getPathForFile` (`webUtils`), never trusting renderer-supplied paths; main re-validates with `assertEncryptSource`/`assertDecryptSource`. Default drag/drop/navigation is prevented.
- All `alert`/log text is static or a stable error code; no password or path content is interpolated; `log.error` forwards only `error.message`.
- The destructive delete-original action is behind a native confirm plus `.ctx` allowlist in the main process.
- Menu and open-file IPC listeners are unsubscribed in `sysevents.js` `beforeUnmount`; per-operation crypto listeners are released in `.finally`.
- Cancellation invokes the real main-process `crypto.cancel` per tracked operation id; cancelled results are never counted as success.
- Password inputs have proper `<label for>`, and submit uses a real `<button type="submit">` inside a `<form @submit.prevent>`.
- The Pinia `files` store holds only paths, is cleared on unmount and after read, and never holds the password.
