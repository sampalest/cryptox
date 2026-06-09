# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.3.2-alpha]: https://github.com/Samuelpe/cryptox/compare/v0.3.1-alpha.61d56c5...v0.3.2-alpha
[0.3.1-alpha]: https://github.com/Samuelpe/cryptox/compare/v0.3.0-alpha.6342062...v0.3.1-alpha.61d56c5
[0.3.0-alpha]: https://github.com/Samuelpe/cryptox/compare/v0.2-alpha...v0.3.0-alpha
[0.2.0-alpha]: https://github.com/Samuelpe/cryptox/compare/v0.1pre...v0.2-alpha
[0.1.0-pre]: https://github.com/Samuelpe/cryptox/releases/tag/v0.1pre
