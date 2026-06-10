# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
