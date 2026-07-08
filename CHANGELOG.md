# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Changes for each release are grouped by type (Added, Changed, Fixed, Security,
Removed) in the tables below.

## 2.0.0

Lockasaur 2.0: the redesign and rebrand (APP-12), bundled with the
post-release fixes for the multi-platform builds (APP-11).

| Type | Change | Ref |
|---|---|---|
| Added | Appearance-aware macOS app icon: the Icon Composer icon (v2) is compiled into an `Assets.car` shipped next to the icns, so macOS 26+ renders the real Dark (and Clear/Tinted) variants; older macOS keeps the regenerated full-resolution `icon.icns`. New `npm run electron:generate-appicon` regenerates all committed icon artifacts (requires Xcode 26+) | CTX-17 |
| Added | App icon picker in Settings (macOS): choose Auto, Default, Dark, Clear Light/Dark, or Tinted Light/Dark for the Dock icon, persisted across launches and applied through a new allowlisted `app:set-icon` IPC channel. Auto follows the app appearance (including live System changes), Default follows the system appearance via the bundle icon | CTX-17 |
| Added | Dark mode with a Settings overlay (Light / Dark / System, persisted; System follows the OS live) | APP-12 |
| Added | Show/hide password eye toggle on both password fields, one per field; visibility flips back to hidden whenever the fields are cleared | APP-12 |
| Added | Success screen after encrypt/decrypt with the output name; animated padlock on the working screen that mirrors the file's state: open while encrypting and snapping shut on success, closed while decrypting ("Lockasaur Open") and springing open on success | APP-12 |
| Added | Unit tests for the `filecryto` mixin (error-code message coverage, multi-file decrypt completion, listener release idempotency) | APP-11 |
| Added | Install notes in the README and in every release body: unsigned-build prompts (Windows SmartScreen, macOS Gatekeeper) and Ubuntu guidance (prefer the `.deb`; the AppImage needs `libfuse2t64` and can be blocked by the Ubuntu 24.04 user-namespace restriction) | APP-11 |
| Added | Manual deploy workflow (`manual-deploy.yml`): a platform dropdown (linux/windows/macos) builds that platform's x64 and arm64 artifacts and publishes them as the `v<version>.<shortsha>` prerelease for the built commit | APP-11 |
| Added | AppImage first-run helper: on Ubuntu 24.04+ (AppArmor userns restriction) the AppImage offers a one-time, pkexec-authorized AppArmor profile install and then starts sandboxed, instead of aborting with a Chromium sandbox FATAL; it never falls back to running unsandboxed | APP-11 |
| Added | Easter egg: press and hold the dino for 5 seconds through a falling binary rain to unlock a hidden thank-you page where the dino roars | - |
| Added | After a successful encryption, a native prompt offers to permanently delete the original file or folder (defaulting to Keep), mirroring the existing post-decrypt prompt. The main process only allows deleting a source it just encrypted in the same session, one prompt per operation, and the plaintext is removed permanently rather than moved to the system trash | - |
| Added | The macOS Dock-icon picker gains a seventh option, `Locked` (the dino-with-keyhole tile). The Windows and Linux app icon switches to that same artwork, and both it and the picker variant are rasterized from a committed vector source `build/icon.svg` (replacing the removed `public/icon.png`) so they stay sharp at every size | - |
| Changed | Full rebrand to **Lockasaur**: new name, dino padlock branding and app icons, "Encryption with bite." The app id moved to `com.sampalest.lockasaur`, so the Electron user-data directory starts fresh (only the appearance preference lived there) | APP-12 |
| Changed | New encrypted files use the `.dino` extension. Legacy `.ctx` files remain fully supported for decryption and for the post-decrypt delete prompt, and the `.ctx` file association is kept so old files still open the app; re-encrypting an already-encrypted file of either extension is rejected | APP-12 |
| Changed | Internal identifiers renamed from the old cryptox name to lockasaur: the preload bridge (`window.lockasaur`), the test and CI environment variables (`LOCKASAUR_*`), the staged-output and temp-dir prefixes (`.lockasaur-part-`, `.lockasaur-extract-`, `lockasaur-`), the dev CSP Vite plugin and the AppImage AppArmor profile name. On-disk format identity (CTX1 magic), the legacy `.ctx` UTI/mime identifiers and the GitHub repo URLs are unchanged | APP-12 |
| Changed | Complete UI redesign: glassmorphism design system with CSS design tokens, animated blob background, DynaPuff wordmark, bundled Poppins/DynaPuff fonts (OFL), unified 42px in-app titlebar on all platforms with About/Settings buttons, rounded transparent window on macOS/Windows/Linux, custom minimize/close controls on Windows/Linux | APP-12 |
| Changed | About is an in-window overlay (the `/about` route was removed); the app version shown there is injected at build time | APP-12 |
| Changed | The working-screen padlock is one artwork in every state: the shackle now rotates shut (and open) instead of swapping to a second closed image; the asset was renamed `lockasaur-open.svg` to `lockasaur-lock.svg` and `lockasaur-closed.png` was removed | APP-12 |
| Changed | On macOS the two select buttons are merged into a single "Feed the Dino" button with a bone icon (one native dialog picks files and folders there, with a tooltip spelling that out); Windows and Linux keep the separate Select Files and Select Folder buttons | - |
| Changed | The `.dino` document icon now uses the refreshed dino-page artwork on macOS and, for the first time, on Windows (`build/dino.ico`); the deleted legacy `ctx.icns` is restored as a copy of the dino icons so `.ctx` files share the artwork. All document icons are now generated by `electron:generate-icons` (padlock below 128px for list-view legibility, document page above) instead of being hand-exported | - |
| Changed | Windows and Linux app icon rasterization now anchors the SVG's "Fondo App" body rect: the rounded square takes the largest size the fin and head overhang allows (with the fins reaching the canvas edge, never cut off) instead of floating inside an aspect-fit of the whole composition | - |
| Changed | The macOS Dock icon picker applies icons at full retina quality: every picker variant now ships as a 512px + 1024px `@2x` pair combined into one multi-representation image (the icns equivalent; Electron cannot load `.icns` directly), and the `Locked` variant's body is sized to the same icon grid as the appearance variants instead of rendering ~14% smaller, its fins kept fully visible by a slight off-center shift | - |
| Fixed | The AppImage first-run AppArmor profile still attached to the pre-rebrand binary path (`/tmp/.mount_Crypt*/cryptox`), so installing it did not actually unblock the renamed app on Ubuntu 24.04+; it now attaches to the Lockasaur mount path (`/tmp/.mount_Locka*/lockasaur`) | APP-12 |
| Fixed | The Select Files button used a hidden HTML file input, so folders could not be selected for encryption (the dialog navigated into them); it now opens the native dialog, with a new Select Folder button because Windows and Linux cannot mix files and folders in one picker (macOS can, so Select Files allows both there). Both pickers support multi-selection, and the renderer-supplied dialog kind is allowlisted in ipcValidation | APP-12 |
| Fixed | Reverted renderer regressions that slipped into the APP-10 PR: an `is-encrypt` prop/event rename left every operation running as decrypt (encryption unreachable) and skipped the encrypt password confirmation; the crypto-listener bookkeeping used on unmount was removed while still called; a multi-file decrypt tore the progress screen down after the first file; `SENDER_REJECTED`/`INVALID_PAYLOAD` alerts lost their fixed messages | APP-11 |
| Fixed | CI: the macOS x64 package job targeted the retired `macos-13` Intel runner and queued forever, blocking the release job; mac x64 is now cross-compiled on `macos-15` with an explicit `--x64`, and every package leg passes its arch explicitly | APP-11 |
| Fixed | The Linux `.deb` declares the missing `libasound2` dependency; the Electron binary links it at load time, so the installed app failed to start on Ubuntu machines without the desktop audio stack (reproduced on Ubuntu 24.04 arm64) | APP-11 |
| Fixed | AppImages use electron-builder's static (type2) launcher runtime; the legacy launcher was dynamically linked and its arm64 build required an unversioned `libz.so`, so the arm64 AppImage could not start on stock Ubuntu | APP-11 |
| Fixed | CI: a `unit-gate` job aggregates the unit matrix under the fixed check name the develop branch protection requires; after the matrix split, PRs hung on "Expected: waiting for status to be reported" | APP-11 |
| Removed | Unused files: the leftover Nightwatch e2e scaffolding, five unreferenced Montserrat weights, the never-used Material Icons font and its CSS, and `files.svg`; the ad hoc `lintfix:js`/`lintfix:vue` npm scripts were replaced by one `lint:fix` covering the same globs as `lint` | APP-12 |
| Removed | Materialize CSS (vendored copy and npm dependency) and animate.css; all styling is first-party Sass | APP-12 |
| Removed | Unused `PASSWORD_ERROR` constant introduced by the APP-10 PR | APP-11 |
| Removed | Unused `screenshots/logo.png` (the README uses `screenshots/logo.svg`) | - |

Known issues:

- Builds are unsigned for this release: Windows SmartScreen shows "Windows protected your PC" ("More info", then "Run anyway"), and macOS Gatekeeper may require right click and Open.
- On Ubuntu 24.04+ the Linux AppImage needs a one-time AppArmor profile (its first run offers to install it with a password prompt; declining exits with manual instructions). The `.deb` package sets this up automatically and remains the recommended install on Ubuntu. With a custom `TMPDIR` or `--appimage-extract-and-run` the profile does not match and the restriction still applies.

## 1.1.0-beta - 2026-07-02

Windows and Linux support (APP-10).

| Type | Change | Ref |
|---|---|---|
| Added | Windows (nsis installer plus portable exe) and Linux (AppImage plus deb) packaging targets, with the `.ctx` file association and an `application/x-cryptox` mime type on Linux | APP-10 |
| Added | x64 and arm64 builds for macOS, Windows, and Linux, each produced on a native-architecture CI runner; the arch is included in every artifact name | APP-10 |
| Added | Windows and Linux app icons (`build/icon.ico`, `build/icons/*.png`) generated from `public/icon.png` | APP-10 |
| Changed | The custom draggable title bar renders only on macOS; Windows and Linux use the native title bar | APP-10 |
| Changed | CI packages on a macOS/Windows/Linux matrix and aggregates all artifacts into one release; unit tests run on all three | APP-10 |
| Fixed | Directory decryption on Windows renames tar entries whose names are reserved DOS devices (CON, AUX, and similar) or end in a dot/space, instead of failing the extraction | APP-10 |
| Fixed | Unit temp-directory assertion uses the OS temp directory instead of a hardcoded `/tmp` path | APP-10 |

## 1.0.0-beta - 2026-06-21

First beta. Consolidates the 0.3.x alpha security hardening work and closes the
final build and release audit findings (CTX-25, Batch B).

| Type | Change | Ref |
|---|---|---|
| Changed | Copyright year refreshed to 2026 | APP-09 |
| Security | Electron Fuses disable RunAsNode, Node inspect and `NODE_OPTIONS`, and require a verified asar (`onlyLoadAppFromAsar`, embedded integrity validation) | APP-02 |
| Security | macOS target uses Hardened Runtime with a minimal entitlements file | APP-03 |
| Security | Window session denies all web permission requests by default | APP-04 |
| Security | Production CSP locked to `connect-src 'self'` with `frame-ancestors 'none'` and `frame-src 'none'`; HMR `ws://` origins ship only under dev | APP-06/07 |
| Removed | Dead `scripts/notarize.js`, and a regenerated `yarn.lock` (`package-lock.json` is the only lockfile) | APP-01/05 |

## 0.3.9-alpha - 2026-06-21

Main process and crypto core audit remediation (CTX-24, Batch A).

| Type | Change | Ref |
|---|---|---|
| Added | Security regression suite covers binary round-trips across chunk boundaries, IV tampering, tricky filenames, and CTXBOX extension smuggling | CTX-13 |
| Changed | `FileManager` splits names on both path separators (Windows paths) | CODE-02 |
| Security | Argon2id `memlimit` clamp ceiling lowered to 256 MiB (MODERATE preset), blocking crafted-header KDF denial of service | CODE-01 |
| Security | Source validation uses `lstat` and rejects symlinks | CODE-03 |
| Security | All non-crypto IPC handlers gate on `isTrustedSender` | CODE-04 |
| Removed | Dead `Utils` helpers and a raw `console.error` | CODE-05 |

## 0.3.8-alpha - 2026-06-12

| Type | Change | Ref |
|---|---|---|
| Changed | `src/` reorganized by Electron process (`main`, `preload`, `renderer`, `shared`); import aliases updated | CTX-12 |
| Security | Renderer hardened: `sandbox` and `webSecurity` on, `setWindowOpenHandler` denies new windows, `will-navigate` guard, CSP meta tag; smoke test asserts the sandboxed preload bridge | CTX-12 |
| Removed | Dead root files (`yarn.lock`, `.browserslistrc`, stray entitlements) | CTX-12 |

## 0.3.7-alpha - 2026-06-11

| Type | Change | Ref |
|---|---|---|
| Changed | Crypto channels return structured `{ ok, code, message }` results instead of throwing | CTX-11 |
| Security | Crypto IPC handlers reject any sender other than the app window | CTX-11 |
| Security | Source paths validated before any operation (must exist; decrypt accepts only `.ctx`; encrypt rejects `.ctx`) | CTX-11 |
| Security | Operation ids restricted to `[A-Za-z0-9_-]{1,64}`; renderer sends random UUIDs | CTX-11 |
| Security | Error messages and logs drop user content; only stable codes are logged | CTX-11 |

## 0.3.6-alpha - 2026-06-10

| Type | Change | Ref |
|---|---|---|
| Added | Cancel performs a real cancellation via an operation registry and `crypto:cancel`; quitting tears down in-flight work | CTX-10 |
| Added | Concurrent operations on the same input or output path are blocked | CTX-10 |
| Added | Large payload test suite (`npm run test:large`, 1 GB file and folder) plus a manual CI workflow | CTX-10 |
| Changed | Progress reaches 100% only once the output is visible at its final path | CTX-10 |
| Changed | Clearer status messages ("Preparing secure key...", "Saving file...") | CTX-10 |
| Changed | Completion waits for the staged output to be fsync'd before the move | CTX-10 |
| Security | Encryption stages ciphertext to a hidden temp file, moved into place only after the auth tag is appended | CTX-10 |

## 0.3.5-alpha - 2026-06-10

| Type | Change | Ref |
|---|---|---|
| Security | Decryption stages plaintext to a hidden temp file, moved into place only after GCM authentication succeeds; nothing survives a wrong password or tamper | CTX-9 |

## 0.3.4-alpha - 2026-06-10

| Type | Change | Ref |
|---|---|---|
| Changed | Encryption and decryption never overwrite: a free `name (1)` variant is chosen, output opened with exclusive flags | CTX-8 |
| Changed | The unauthenticated trailing extension of legacy and interim files is validated before use | CTX-8 |
| Fixed | Output naming no longer truncates at the first dot; multi-dot and Unicode names round-trip | CTX-8 |
| Fixed | UI encrypted-file detection checks the last extension (`archive.backup.ctx`) | CTX-8 |

## 0.3.3-alpha - 2026-06-10

| Type | Change | Ref |
|---|---|---|
| Fixed | Directory encryption no longer leaks the temporary tar archive on stream failure | CTX-7 |
| Security | Per-operation `mkdtemp` temp directories (mode 0700) replace the fixed `/tmp/cryptox`; removed on success or failure | CTX-7 |

## 0.3.2-alpha - 2026-06-09

| Type | Change | Ref |
|---|---|---|
| Added | Versioned `CTX1` format: magic, version, flags, and a bounded JSON header (algorithm, KDF params, salt, name) authenticated as GCM associated data | CTX-5 |
| Changed | New encryptions write only `CTX1`; interim and unversioned files stay readable via decrypt fallbacks | CTX-5 |
| Changed | A plain `.tar` file is no longer force-extracted after decryption; only directory archives are | CTX-5 |

## 0.3.1-alpha - 2026-06-09

| Type | Change | Ref |
|---|---|---|
| Security | Tar extraction rejects traversal, absolute paths, and non-file/directory entries; extracts into a temp dir, moved into place only after the whole archive validates | CTX-6 |

## 0.3.0-alpha - 2026-06-07

| Type | Change | Ref |
|---|---|---|
| Added | Password strength validation | CTX-4 |
| Added | Continuous integration improvements | CTX-4 |
| Changed | Renderer migrated to Vue 3 | SAM-6 |
| Changed | Modernized the build stack | SAM-5 |
| Changed | File encrypt and decrypt switched to a file-path object API | |
| Changed | Sass color functions updated to the new module syntax | |
| Security | Replaced weak SHA-256 key derivation with Argon2id | |

## 0.2.1-alpha - 2026-06-10

| Type | Change | Ref |
|---|---|---|
| Changed | License changed from MIT to PolyForm Noncommercial 1.0.0 (releases up to 0.2.0-alpha stay MIT) | |

## 0.2.0-alpha - 2020-05-26

| Type | Change | Ref |
|---|---|---|
| Added | About route and file-open flow with a custom app menu and animations | |
| Added | Open-file events via OS file associations | |
| Changed | Reworked build configuration and file-association handling | |
| Changed | Switched to a faster folder compression library | |
| Changed | Temporary files stored in the OS temp directory across platforms | |
| Fixed | Folder encryption with the new `bytes` extension | |

## 0.1.0-pre - 2020-05-17

| Type | Change | Ref |
|---|---|---|
| Added | Initial release: file and folder encryption and decryption | |
| Added | Multiple-file encryption | |
| Added | Folder compression before encryption | |
| Added | Materialize-based UI | |
