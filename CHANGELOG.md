# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.9-alpha] - 2026-06-21

### Added

- Security regression coverage completed ([CTX-13]): the unit suite now also
  covers byte-for-byte binary round-trips across stream chunk boundaries,
  tampered-IV rejection (alongside the existing header, ciphertext and auth
  tag cases), filenames with spaces/parentheses and with no extension, and
  path-separator smuggling through the unauthenticated CTXBOX extension
  field (the legacy field was already covered). Together with the tests
  added during CTX-5..CTX-12, `npm run test:unit` now locks down every
  invariant on the CTX-13 checklist; the suite's role is documented in
  README and docs/claude/build-test-release.md.

### Security

- Main process and crypto core audit remediation ([CTX-24], Batch A of the
  June 2026 code security audit):
  - CODE-01: the Argon2id `memlimit` clamp ceiling drops from 1 GiB to the
    MODERATE preset (256 MiB), exactly what the encrypt path writes. A
    tampered `.ctx` header can no longer request a per-decrypt allocation
    larger than the app itself produces (KDF denial of service).
  - CODE-03: source validation now uses `lstat` and rejects symlinks, closing
    the stat/lstat divergence with `Utils.isDirectory` so a symlinked source
    is never processed as its link target.
  - CODE-04: all non-crypto IPC handlers (`app:info`, `dialog:open-files`,
    `shell:open-external`, `files:confirm-delete-encrypted`, `log:error`,
    `files:renderer-ready`) now gate on `isTrustedSender`, matching the crypto
    channels (defense in depth).

### Changed

- CODE-02: `FileManager` derives the file name by splitting on both path
  separators, so Windows paths resolve correctly (`sanitizeName` stays the
  security backstop).

### Removed

- CODE-05: dead helpers `Utils.getFilesDir` and `Utils.textToBuffer`, and a
  raw `console.error` in `Utils.zipDirectory`, restoring the fixed-strings
  logging discipline.

## [0.3.8-alpha] - 2026-06-12

### Security

- Renderer hardening completed ([CTX-12]): the window now runs with
  `sandbox: true` and an explicit `webSecurity: true`;
  `setWindowOpenHandler` denies every renderer-initiated window; a
  `will-navigate` guard restricts navigation to the dev server origin (dev)
  or the bundled `dist/index.html` (prod); `index.html` ships a Content
  Security Policy meta tag (`script-src 'self'`, no remote origins). The
  Electron smoke test now also asserts the preload bridge works under the
  sandbox and that `window.open` cannot create windows. DevTools gating
  (dev only) and the `shell:open-external` https allowlist are unchanged.

### Changed

- `src/` reorganized by Electron process ([CTX-12]): `src/main/` (main
  process, entry `index.js`, formerly `background.js`), `src/preload/`,
  `src/renderer/` (the Vue app) and `src/shared/` (modules imported by both
  processes). Import aliases updated accordingly: `@` -> `src/renderer`,
  `@shared` -> `src/shared`, `@main` -> `src/main` (Jest). Bundle names
  (`dist-electron/background.cjs`, `preload.cjs`) and all runtime behavior
  are unchanged.

### Removed

- Dead root files ([CTX-12]): `yarn.lock` (npm is the package manager),
  `.browserslistrc` (unused by Babel and Vite) and `entitlements.mac.plist`
  (referenced by no build configuration).

## [0.3.7-alpha] - 2026-06-11

### Security

- Crypto IPC handlers (`crypto:encrypt`, `crypto:decrypt`, `crypto:cancel`)
  now reject requests from any WebContents other than the app window
  ([CTX-11]).
- Source paths are validated before any operation starts ([CTX-11]): the path
  must exist on disk, decrypt only accepts regular `.ctx` files, and encrypt
  rejects `.ctx` inputs (files or folders) to prevent accidental double
  encryption. Invalid inputs fail before anything is locked or any crypto
  begins.
- Operation ids are restricted to 1-64 characters from `[A-Za-z0-9_-]`
  ([CTX-11]). The renderer now generates random UUIDs instead of ids derived
  from file paths.
- Crypto error messages and logs no longer include user-controlled payload
  content such as file paths, passwords or operation ids ([CTX-11]). The main
  process logs only stable error codes and error names.

### Changed

- Crypto IPC channels return structured results instead of throwing
  ([CTX-11]): `{ ok: true, cancelled }` on success and `{ ok: false, code,
  message }` with stable error codes (`SENDER_REJECTED`, `INVALID_PAYLOAD`,
  `FILE_NOT_FOUND`, `INVALID_FILE_TYPE`, `OPERATION_FAILED`) on failure. The
  renderer maps codes to user-facing messages, and encryption failures now
  surface an alert instead of failing silently.

## [0.3.6-alpha] - 2026-06-10

### Added

- The Cancel button now performs a real cancellation instead of only resetting
  the UI ([CTX-10]). A main-process operation registry tracks every in-flight
  encrypt/decrypt operation by its operation id, and a new `crypto:cancel` IPC
  channel (exposed through the preload bridge) destroys the active read,
  cipher and write streams, removes partial and staged outputs, and releases
  the operation's temp directory. Cancelled operations report a distinct
  cancelled result to the renderer, so they are never counted as successes or
  shown as errors. Quitting the app mid-operation tears down in-flight
  operations the same way.
- Concurrent operations targeting the same input or output path are now
  blocked ([CTX-10]): the registry claims each operation's normalized paths
  and rejects a second operation on a busy path instead of letting two
  operations race the same file.
- New large payload test suite (`npm run test:large`): generates a 1 GB file
  and a 1 GB folder, verifies the UI progress/status event contract against
  real output visibility on disk for encrypt and decrypt, and reports timing
  metrics. A new manually dispatched GitHub Actions workflow runs it on
  Linux, macOS and Windows.

### Changed

- The progress bar reaches 100% only once the output file is visible at its
  final path ([CTX-10]). Streaming progress is capped at 99%, and while the
  output is finalized (auth tag, flush, move into place, or directory
  extraction) the UI shows the indeterminate bar with a "Saving file..." or
  "Extracting files..." status, so a large operation can no longer look
  complete while the result is still a hidden staging file.
- Clearer status messages ([CTX-10]): the key derivation phase now reads
  "Preparing secure key..." instead of the misleading "Securing password...",
  and the finalization phase reads "Saving file..." instead of "Finishing...".
- Completion now waits for the output to be flushed to disk ([CTX-10]).
  Staged outputs are fsync'd before being moved into place, so when the UI
  reports success the file is physically stored, not merely queued in the OS
  write cache. Previously a large file could still be flushing for seconds
  after the interface finished, which delayed its appearance in Finder and
  meant a power loss right after "success" could truncate the output.

### Security

- Encryption no longer writes ciphertext directly to the final output path
  ([CTX-10]). Mirroring the decryption staging from [CTX-9], the ciphertext is
  streamed to a hidden, randomly named temporary file next to the destination
  and is only moved into place, with the overwrite-safe link-then-unlink, after
  the GCM auth tag is appended. The `.ctx` file now appears only fully formed:
  a cancelled, failed or interrupted encryption removes the staged file and
  never leaves a partial `.ctx` at the final path, and file sync tools can no
  longer pick up a half-written archive.

## [0.3.5-alpha] - 2026-06-10

### Security

- Decryption no longer writes plaintext directly to the final output path
  ([CTX-9]). The plaintext is streamed to a hidden, randomly named temporary
  file next to the destination and is only moved into place, with an
  overwrite-safe link-then-unlink, after AES-GCM authentication succeeds. A
  wrong password, tampered ciphertext or auth tag, a bad header, or a failed
  stream removes the temporary file and leaves no output at the final path.
  Directory decryption keeps the same guarantee: the archive is decrypted in
  the operation temp directory, and the validated extraction is moved into a
  fresh output directory instead of being merged into an existing one.

## [0.3.4-alpha] - 2026-06-10

### Fixed

- Output naming no longer truncates filenames at the first dot ([CTX-8]).
  Multi-dot names (`document.backup.txt`) and Unicode names now round-trip
  correctly: encryption replaces only the last extension
  (`document.backup.ctx`) and decryption restores the full original name from
  the authenticated CTX1 header. Legacy and interim files keep their multi-dot
  stems on decryption as well.
- Encrypted-file detection in the UI checks the last extension instead of the
  segment after the first dot, so files like `archive.backup.ctx` are routed
  to decryption ([CTX-8]).

### Changed

- Encryption and decryption never overwrite existing files or directories: a
  free `name (1).ctx` / `name (1)` variant is chosen automatically, and output
  files are created with exclusive flags so a race fails loudly instead of
  clobbering data ([CTX-8]).
- The unauthenticated trailing extension field of legacy and interim files is
  validated before being used in an output path ([CTX-8]).

## [0.3.3-alpha] - 2026-06-10

### Security

- Replaced the fixed, predictable `/tmp/cryptox` temporary directory with a
  per-operation temp lifecycle ([CTX-7]). Each encrypt/decrypt operation owns
  a unique `fs.mkdtemp` directory under the OS temp location (created with
  mode `0o700` on POSIX), tracked by its operation id and removed when the
  operation succeeds or fails, so concurrent operations can never share or
  delete each other's temp paths. No code path deletes a global shared temp
  folder anymore, and directory encryption now uses the platform temp
  location on Windows as well.

### Fixed

- Directory encryption no longer leaks the temporary tar archive when the
  encryption stream fails ([CTX-7]).

## [0.3.2-alpha] - 2026-06-09

### Added

- New versioned `CTX1` encrypted file format ([CTX-5]): magic bytes, format
  version, flags, and a length-prefixed JSON header carrying the cipher
  algorithm, KDF parameters, per-file salt and the original file name. The
  header is authenticated as AES-256-GCM associated data, so any tampering
  with the metadata fails decryption. Header parsing is strictly bounded and
  validates every field (including KDF cost limits, preventing crafted-header
  resource exhaustion).

### Changed

- New encryptions write only the `CTX1` format. Files in the interim
  0.3.x-alpha header format and the original unversioned layout remain
  readable through dedicated decrypt fallbacks ([CTX-5]).
- A regular file that merely ends in `.tar` is no longer force-extracted
  after decryption; only payloads flagged as directory archives are ([CTX-5]).

## [0.3.1-alpha] - 2026-06-09

### Security

- Hardened tar extraction against directory traversal ([CTX-6]). Every archive
  entry is validated before being written: path traversal (`../`), absolute
  paths, and all non-file/directory entry types (symlinks, hardlinks, device
  nodes, FIFOs, sockets) are rejected. Extraction runs into a fresh temporary
  directory and is only moved into place once the whole archive passes
  validation, and `decrypt()` now awaits extraction before resolving.

## [0.3.0-alpha] - 2026-06-07

### Added

- Password strength validation to warn against weak passwords ([CTX-4]).
- Continuous integration improvements ([CTX-4]).

### Changed

- Migrated the renderer to Vue 3 ([SAM-6]).
- Modernized the build stack ([SAM-5]).
- Switched file encryption and decryption to a file-path object API.
- Updated Sass color functions to the new module syntax and improved colour calculations.
- Adjusted `.pic-drag` dimensions and positioning for an improved layout.

### Security

- Replaced the weak SHA-256 key derivation with Argon2id.

## [0.2.1-alpha] - 2026-06-10

### Changed

- License changed from MIT to PolyForm Noncommercial 1.0.0. Cryptox stays free for personal and noncommercial use, with contributions welcome, but commercial use by companies is no longer permitted. Versions released before this change (up to 0.2.0-alpha) remain under MIT.

## [0.2.0-alpha] - 2020-05-26

### Added

- About route and file-open flow with a custom application menu and animations.
- Open-file events with OS file associations.

### Changed

- Reworked the build configuration and file-association handling.
- Switched to a new library for compressing folders for faster operation.
- Stored temporary files in the OS temp directory across platforms.

### Fixed

- Folder encryption with the new `bytes` extension.

## [0.1.0-pre] - 2020-05-17

### Added

- Initial release with file and folder encryption/decryption.
- Multiple-file encryption support.
- Folder compression before encryption.
- Materialize-based UI.

[0.3.5-alpha]: https://github.com/sampalest/cryptox/compare/v0.3.4-alpha...v0.3.5-alpha
[0.3.4-alpha]: https://github.com/sampalest/cryptox/compare/v0.3.3-alpha...v0.3.4-alpha
[0.3.3-alpha]: https://github.com/Samuelpe/cryptox/compare/v0.3.2-alpha...v0.3.3-alpha
[0.3.2-alpha]: https://github.com/Samuelpe/cryptox/compare/v0.3.1-alpha.61d56c5...v0.3.2-alpha
[0.3.1-alpha]: https://github.com/Samuelpe/cryptox/compare/v0.3.0-alpha.6342062...v0.3.1-alpha.61d56c5
[0.3.0-alpha]: https://github.com/Samuelpe/cryptox/compare/v0.2-alpha...v0.3.0-alpha
[0.2.0-alpha]: https://github.com/Samuelpe/cryptox/compare/v0.1pre...v0.2-alpha
[0.1.0-pre]: https://github.com/Samuelpe/cryptox/releases/tag/v0.1pre
