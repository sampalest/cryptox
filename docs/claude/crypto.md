# Crypto pipeline reference

The cryptographic core, all main-process code. The on-disk format rules in [CLAUDE.md](../../CLAUDE.md) (Security invariants) apply to every function here.

## src/main/crypto.js

`Crypto` (default export): one instance per operation, constructed with `(password, operationId)`. Owns the operation's streams, cancellation state and temp directory.

### Cancellation machinery

- `cancel()`: idempotent. Sets `_cancelled`, destroys every tracked stream with a `CancelledError`. The synchronous Argon2id KDF and tar steps cannot be interrupted mid-call; a cancel during them takes effect at the next checkpoint.
- `_checkCancelled()`: throws `CancelledError` if cancelled; called at the start of each phase.
- `_track(...streams)` / `_untrackAll()`: maintain the set of in-flight streams that `cancel()` destroys.

### Key derivation

- `_deriveKeyArgon2id(salt, opslimit, memlimit, keyLen)`: Argon2id via libsodium (`crypto_pwhash`, ALG_ARGON2ID13). Synchronous and CPU/memory heavy; callers show the indeterminate UI bar around it. Requires `_ready()` (awaits `sodium.ready`, the WASM init) first.
- `_getCipherKey()`: unsalted SHA-256 of the password. Insecure; exists ONLY to decrypt raw legacy files. Never use for new encryption.

### I/O helpers

- `_readBytes(filePath, start, length)`: positional exact-length read; throws `FormatError` on a short read instead of returning partial data. Used for all header/IV/tag reads.
- `_tempOutputPath(finalPath)`: hidden staging name `.cryptox-part-<8 random bytes hex>` in the same directory as the final destination (same filesystem, so the final move is atomic).
- `_flushToDisk(filePath)`: opens and fsyncs the staged file. Stream writes only queue bytes in the OS cache; without this, success could be reported before the bytes are physically stored.
- `_moveIntoPlace(tempPath, desiredPath)`: moves the staged output to the first free "name (n)" variant. Uses `link(2)` + unlink because link fails with EEXIST instead of overwriting; retries up to 5 times on a lost race; falls back to existence-check + rename on filesystems without hard links (EPERM/ENOTSUP/EOPNOTSUPP/ENOSYS). Never overwrites.
- `_compressFolder(file, fileEvent, onStatus, tempDir)`: tars a directory into the operation temp dir (`Utils.zipDirectory`), drives the indeterminate loader, returns `{ endfile, filepath, size }`.

### Encrypt

- `encrypt(file, completeFile, fileEvent, events)`: public wrapper; awaits `_encrypt` inside try and releases the temp dir in `finally` (success and failure alike).
- `_encrypt(...)`: full pipeline.
  1. Stat the source; directories are tar'd first (size/path swap to the archive).
  2. Fresh random salt; Argon2id key with libsodium MODERATE limits.
  3. `Format.buildHeaderV1` with the original name (the `.tar` name plus `FLAG_DIRECTORY` for directories).
  4. Streams: `readStream -> cipher (AES-256-GCM, header set as AAD) -> IVector -> writeStream` into a staged `wx` file. The header is written first, so the layout is `[header][IV][ciphertext][auth tag]`.
  5. Progress: plaintext bytes read vs plaintext size, clamped to 0-99. 100 is reserved for "output visible at the final path".
  6. On `finish`: re-check cancellation (a cancel racing completion never finalizes, even fully written), append `cipher.getAuthTag()`, fsync, `_moveIntoPlace`, then report 100.
  7. Error handling is idempotent (`settled` flag): destroy all three streams, remove the staged output, reject the original error.

### Decrypt

- `decrypt(file, completeFile, events)`: reads up to the first 9 bytes, dispatches on `Format.detectFormat` to `_decryptV1` (ctx1), `_decryptInterim` (ctxbox) or `_decryptLegacy`; releases the temp dir in `finally` for all three paths.
- `_decryptV1(file, size, completeFile, events)`: bounded prefix + header parse (`Format.parsePrefixV1` / `parseHeaderV1`), Argon2id key from header params (already clamped by `validateKdfParams`), reads IV after the header and the tag from the file tail. Directory payloads (FLAG_DIRECTORY) stream the tar into the operation temp dir and extract next to the .ctx file under the original name; file payloads stage next to the destination. Delegates to `_streamDecrypt` with the raw header bytes as AAD.
- `_decryptInterim(...)`: CTXBOX layout `[magic 6][version u8][headerLen u16BE][JSON kdf meta][IV][ciphertext][ext 8][tag 16]`. Header cannot be authenticated retroactively, but parsing is bounded and `Format.validateKdfParams` clamps the KDF params. Tail handled by `_decryptTrailingExt`.
- `_decryptLegacy(...)`: raw layout `[IV 16][ciphertext][ext 8][tag 16]` with the SHA-256 key. Minimum-size check, then `_decryptTrailingExt`.
- `_decryptTrailingExt(file, size, completeFile, events, cipherKey, ivStart)`: shared interim/legacy tail. Reads the 8-byte `*`-padded extension before the tag, rebuilds the output name (keeping multi-dot stems), and runs `Format.sanitizeName` on it because this field is NOT covered by the auth tag (path-steering defense). `ext === "tar"` means a directory payload: archive goes to the temp dir and extracts next to the source. Because `ext` is unauthenticated, this `isTar` branch is attacker-influenced (CODE-06), but it is contained: tar extraction is hardened (`_validateTarEntry`) and `sanitizeName` still runs, so the worst case is a clean failure extracting non-tar data.
- `_streamDecrypt(job)`: common core for all three formats. Creates the decipher with IV + auth tag (+ AAD when given), streams the ciphertext slice into a staged `wx` file, progress 0-99 against the ciphertext length. Special-cases empty plaintext (GCM still authenticates on `final()`, but fs read streams cannot express a zero-length range). On finish: cancellation re-check, then either safe tar extraction (`Utils.unzipDirectory`) or fsync + `_moveIntoPlace`; 100% only after that. On any error (including wrong password, which only fails GCM auth at stream end after partial garbage is written): destroy streams, remove the staged output, reject.

## src/main/format.js

The pure CTX1 container module: no fs, no sodium, no node:crypto, so it is unit-testable and parsing never triggers KDF work. Keep it pure. Default export is an object of constants + functions.

Layout (also in the module header comment):

```
offset 0  magic "CTX1" (4 bytes)
offset 4  version u8 = 1
offset 5  flags u8           bit 0 = tar'd directory; other bits must be 0
offset 6  headerLen u16BE    JSON blob length
offset 8  JSON meta          { alg, kdf, salt(b64), opslimit, memlimit, keyLen, name }
          [IV 16][ciphertext][GCM auth tag 16]
```

The raw header bytes (offset 0 through end of JSON) are the GCM associated data.

- `FormatError`: thrown for every malformed-file condition.
- `sanitizeName(name)`: validates the output file name: non-empty string, max 255 chars, not "."/"..", no separators, control chars or backslashes, must equal its own basename. Defense against path steering from header data.
- `validateKdfParams(meta)`: kdf must be argon2id, salt must decode to 16 bytes, opslimit in [1, 4], memlimit in [8192, 256 MiB], keyLen 32. The memlimit ceiling is libsodium's MODERATE preset (`268435456`), exactly what the encrypt path writes; bounds are hardcoded (sodium constants need async init; this module stays pure). Rejects crafted headers demanding more memory than the app ever produces (KDF DoS).
- `_validateMeta(meta)`: object check + alg check + `validateKdfParams` + `sanitizeName`.
- `detectFormat(firstBytes)`: "ctx1" | "ctxbox" | "legacy" from up to the first 9 bytes. CTX1 is checked before CTXBOX (they diverge at byte 3); anything unrecognized is legacy.
- `buildHeaderV1(meta, flags)`: validates flags (only known bits) and meta with the same rules as the parser (encrypt can never emit a header decrypt would reject), bounds the JSON at `MAX_HEADER_JSON` (4096), returns prefix + JSON buffer.
- `parsePrefixV1(buf)`: validates magic, version, flag bits, and bounds headerLen; returns `{ version, flags, headerLen }`.
- `parseHeaderV1(headerBuf, fileSize)`: full parse: prefix, truncation checks against fileSize (header + IV + tag must fit), JSON parse, `_validateMeta`. Returns `{ flags, headerLen, meta, headerBytes }` where `headerBytes` is exactly the AAD slice.

## src/main/utils.js

`Utils` (default export), static helpers. The tar functions are security-sensitive.

- `zipDirectory(args)`: tars `args.path` into `args.output` with tar-fs (used before encrypting a directory).
- `_validateTarEntry(root, header)`: returns an Error (or null) for a tar entry. Rejects anything that is not a plain file or directory (symlinks, hardlinks, devices, FIFOs, sockets), absolute paths (POSIX and Windows drive forms), `..` segments, and any name that resolves outside the extraction root.
- `unzipDirectory(input, output)`: safe extraction. Extracts into a fresh `.cryptox-extract-` mkdtemp dir next to the output (same filesystem). Entries failing validation set a sticky `entryError` and everything after is skipped via tar-fs `ignore` (destroying the stream mid-entry would leak an unhandled tar-stream error); the whole extraction rejects at stream end. On success the temp dir is renamed into place, re-resolving to a fresh "name (n)" variant if the target appeared mid-extraction. Never merges into an existing directory. Cleans up the temp dir on every failure path.
- `uniquePath(desiredPath, isDirectory)`: the desired path if free, else the first free "name (n)" variant. For files the counter goes before the last extension ("report.ctx" -> "report (1).ctx"); for directories at the end. Gives up after 10000 tries.
- `isDirectory(path)`: lstat-based check (matches `assertEncryptSource`, which also rejects symlinks with lstat).
- `rmRf(path)`: recursive removal, tolerant of missing paths.
- `fillExtension(extension, bytenum)`: pads an extension to 8 bytes with leading `*` (legacy/interim formats only; the CTX1 path does not use it).

## src/main/vector.js

`IVector`: a Transform stream that emits the 16-byte IV before the first cipher chunk, used in the encrypt pipeline between the cipher and the write stream. `_flush` also emits the IV when the plaintext was empty (no chunks ever pass `_transform`), so the file always contains its IV.
