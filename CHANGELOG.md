# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Changes for each release are grouped by type (Added, Changed, Fixed, Security,
Removed) in the tables below.

## Unreleased

Post-release fixes for the multi-platform builds (APP-11).

| Type | Change | Ref |
|---|---|---|
| Fixed | Reverted renderer regressions that slipped into the APP-10 PR: an `is-encrypt` prop/event rename left every operation running as decrypt (encryption unreachable) and skipped the encrypt password confirmation; the crypto-listener bookkeeping used on unmount was removed while still called; a multi-file decrypt tore the progress screen down after the first file; `SENDER_REJECTED`/`INVALID_PAYLOAD` alerts lost their fixed messages | APP-11 |
| Fixed | CI: the macOS x64 package job targeted the retired `macos-13` Intel runner and queued forever, blocking the release job; mac x64 is now cross-compiled on `macos-15` with an explicit `--x64`, and every package leg passes its arch explicitly | APP-11 |
| Fixed | The Linux `.deb` declares the missing `libasound2` dependency; the Electron binary links it at load time, so the installed app failed to start on Ubuntu machines without the desktop audio stack (reproduced on Ubuntu 24.04 arm64) | APP-11 |
| Fixed | AppImages use electron-builder's static (type2) launcher runtime; the legacy launcher was dynamically linked and its arm64 build required an unversioned `libz.so`, so the arm64 AppImage could not start on stock Ubuntu | APP-11 |
| Added | Unit tests for the `filecryto` mixin (error-code message coverage, multi-file decrypt completion, listener release idempotency) | APP-11 |
| Added | Install notes in the README and in every release body: unsigned-build prompts (Windows SmartScreen, macOS Gatekeeper) and Ubuntu guidance (prefer the `.deb`; the AppImage needs `libfuse2t64` and can be blocked by the Ubuntu 24.04 user-namespace restriction) | APP-11 |
| Added | Manual deploy workflow (`manual-deploy.yml`): a platform dropdown (linux/windows/macos) builds that platform's x64 and arm64 artifacts and publishes them as the `v<version>.<shortsha>` prerelease for the built commit | APP-11 |
| Fixed | CI: a `unit-gate` job aggregates the unit matrix under the fixed check name the develop branch protection requires; after the matrix split, PRs hung on "Expected: waiting for status to be reported" | APP-11 |
| Removed | Unused `PASSWORD_ERROR` constant introduced by the APP-10 PR | APP-11 |

Known issues:

- Builds are unsigned for the beta: Windows SmartScreen shows "Windows protected your PC" ("More info", then "Run anyway"), and macOS Gatekeeper may require right click and Open.
- The Linux AppImage on Ubuntu 24.04 can be blocked by the AppArmor restriction on unprivileged user namespaces; the `.deb` package (which installs an AppArmor profile) is the recommended install on Ubuntu.

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
| Security | Electron Fuses disable RunAsNode, Node inspect and `NODE_OPTIONS`, and require a verified asar (`onlyLoadAppFromAsar`, embedded integrity validation) | APP-02 |
| Security | macOS target uses Hardened Runtime with a minimal entitlements file | APP-03 |
| Security | Window session denies all web permission requests by default | APP-04 |
| Security | Production CSP locked to `connect-src 'self'` with `frame-ancestors 'none'` and `frame-src 'none'`; HMR `ws://` origins ship only under dev | APP-06/07 |
| Changed | Copyright year refreshed to 2026 | APP-09 |
| Removed | Dead `scripts/notarize.js`, and a regenerated `yarn.lock` (`package-lock.json` is the only lockfile) | APP-01/05 |

## 0.3.9-alpha - 2026-06-21

Main process and crypto core audit remediation (CTX-24, Batch A).

| Type | Change | Ref |
|---|---|---|
| Added | Security regression suite covers binary round-trips across chunk boundaries, IV tampering, tricky filenames, and CTXBOX extension smuggling | CTX-13 |
| Security | Argon2id `memlimit` clamp ceiling lowered to 256 MiB (MODERATE preset), blocking crafted-header KDF denial of service | CODE-01 |
| Security | Source validation uses `lstat` and rejects symlinks | CODE-03 |
| Security | All non-crypto IPC handlers gate on `isTrustedSender` | CODE-04 |
| Changed | `FileManager` splits names on both path separators (Windows paths) | CODE-02 |
| Removed | Dead `Utils` helpers and a raw `console.error` | CODE-05 |

## 0.3.8-alpha - 2026-06-12

| Type | Change | Ref |
|---|---|---|
| Security | Renderer hardened: `sandbox` and `webSecurity` on, `setWindowOpenHandler` denies new windows, `will-navigate` guard, CSP meta tag; smoke test asserts the sandboxed preload bridge | CTX-12 |
| Changed | `src/` reorganized by Electron process (`main`, `preload`, `renderer`, `shared`); import aliases updated | CTX-12 |
| Removed | Dead root files (`yarn.lock`, `.browserslistrc`, stray entitlements) | CTX-12 |

## 0.3.7-alpha - 2026-06-11

| Type | Change | Ref |
|---|---|---|
| Security | Crypto IPC handlers reject any sender other than the app window | CTX-11 |
| Security | Source paths validated before any operation (must exist; decrypt accepts only `.ctx`; encrypt rejects `.ctx`) | CTX-11 |
| Security | Operation ids restricted to `[A-Za-z0-9_-]{1,64}`; renderer sends random UUIDs | CTX-11 |
| Security | Error messages and logs drop user content; only stable codes are logged | CTX-11 |
| Changed | Crypto channels return structured `{ ok, code, message }` results instead of throwing | CTX-11 |

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
| Fixed | Output naming no longer truncates at the first dot; multi-dot and Unicode names round-trip | CTX-8 |
| Fixed | UI encrypted-file detection checks the last extension (`archive.backup.ctx`) | CTX-8 |
| Changed | Encryption and decryption never overwrite: a free `name (1)` variant is chosen, output opened with exclusive flags | CTX-8 |
| Changed | The unauthenticated trailing extension of legacy and interim files is validated before use | CTX-8 |

## 0.3.3-alpha - 2026-06-10

| Type | Change | Ref |
|---|---|---|
| Security | Per-operation `mkdtemp` temp directories (mode 0700) replace the fixed `/tmp/cryptox`; removed on success or failure | CTX-7 |
| Fixed | Directory encryption no longer leaks the temporary tar archive on stream failure | CTX-7 |

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
| Security | Replaced weak SHA-256 key derivation with Argon2id | |
| Added | Password strength validation | CTX-4 |
| Added | Continuous integration improvements | CTX-4 |
| Changed | Renderer migrated to Vue 3 | SAM-6 |
| Changed | Modernized the build stack | SAM-5 |
| Changed | File encrypt and decrypt switched to a file-path object API | |
| Changed | Sass color functions updated to the new module syntax | |

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
