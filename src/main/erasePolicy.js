import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import Format from "./format.js";

// Failed-attempt counter and secure erase for DINO containers. Every function
// resolves (never rejects) so a policy failure can never crash a decrypt
// handler, and a failed counter write never counts an attempt or erases.
//
// The overwrite pass is best effort by nature: SSD wear leveling, APFS/btrfs
// copy-on-write and filesystem snapshots can all retain old blocks. That is
// acceptable because the target is ciphertext; the erase removes this copy
// from the filesystem, it does not promise forensic sanitization.

const COUNTER_LEN = 4;
const OVERWRITE_CHUNK = 65536;

/**
 * Open the target for writing and verify it is still the exact file whose
 * header the decrypt just parsed: an lstat symlink refusal plus O_NOFOLLOW
 * (no-op where unsupported, hence the lstat) and an fstat dev/ino comparison
 * defeat a symlink or file swapped in after the parse, the nlink check
 * refuses hard-linked files (overwrite would destroy
 * every alias while unlinking only one name), and the magic/version re-read
 * refuses anything that is not a DINO container.
 * @function _openVerified
 * @param {String} target File path.
 * @param {Object} eraseInfo { dev, ino } recorded by the decrypt.
 * @return {Promise.<fs.FileHandle>} Open handle; the caller must close it.
 */
async function _openVerified(target, eraseInfo) {
    const linkStats = await fs.promises.lstat(target);
    if (linkStats.isSymbolicLink()) throw new Error("symlink at target");
    const flags = fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0);
    const handle = await fs.promises.open(target, flags);
    try {
        const stats = await handle.stat();
        if (!stats.isFile()) throw new Error("not a regular file");
        if (stats.dev !== eraseInfo.dev || stats.ino !== eraseInfo.ino) throw new Error("file identity changed");
        if (stats.nlink > 1) throw new Error("hard-linked file");
        const prefix = Buffer.alloc(Format.PREFIX_LEN_V1);
        const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
        if (bytesRead !== prefix.length) throw new Error("truncated header");
        if (!prefix.slice(0, Format.MAGIC_DINO.length).equals(Format.MAGIC_DINO)) throw new Error("not a DINO container");
        if (prefix.readUInt8(Format.MAGIC_DINO.length) !== Format.VERSION_DINO) throw new Error("unsupported format version");
        return handle;
    } catch (error) {
        await handle.close().catch(() => {});
        throw error;
    }
}

/**
 * Count one failed attempt against the file and erase it when the limit is
 * reached. The increment saturates at maxAttempts and is fsync'd before any
 * erase decision; if the counter cannot be written nothing is counted and
 * nothing is erased.
 * @function handleFailedAttempt
 * @param {String} target Encrypted file path.
 * @param {Object} eraseInfo { maxAttempts, counterOffset, dev, ino } from the decrypt.
 * @return {Promise.<Object>} { counted, attemptsRemaining?, erased?, error? }
 */
export async function handleFailedAttempt(target, eraseInfo) {
    let handle;
    try {
        handle = await _openVerified(target, eraseInfo);
        const counter = Buffer.alloc(COUNTER_LEN);
        const { bytesRead } = await handle.read(counter, 0, COUNTER_LEN, eraseInfo.counterOffset);
        if (bytesRead !== COUNTER_LEN) throw new Error("truncated counter");
        const next = Math.min(counter.readUInt32BE(0) + 1, eraseInfo.maxAttempts);
        counter.writeUInt32BE(next, 0);
        await handle.write(counter, 0, COUNTER_LEN, eraseInfo.counterOffset);
        await handle.sync();
        await handle.close();
        handle = null;
        const remaining = eraseInfo.maxAttempts - next;
        if (remaining > 0) return { counted: true, attemptsRemaining: remaining };
    } catch {
        if (handle) await handle.close().catch(() => {});
        return { counted: false, error: true };
    }
    const result = await secureErase(target, eraseInfo);
    if (result.erased) return { counted: true, attemptsRemaining: 0, erased: true };
    return { counted: true, attemptsRemaining: 0, erased: false, error: true };
}

/**
 * Best-effort secure erase: overwrite the full length with random bytes,
 * fsync, unlink, then fsync the parent directory where supported. Reports
 * erased only after the unlink succeeded; a failed overwrite or unlink leaves
 * whatever is on disk in place and reports an error instead.
 * @function secureErase
 * @param {String} target Encrypted file path.
 * @param {Object} eraseInfo { dev, ino } from the decrypt.
 * @return {Promise.<Object>} { erased, error? }
 */
export async function secureErase(target, eraseInfo) {
    let handle;
    try {
        handle = await _openVerified(target, eraseInfo);
        const { size } = await handle.stat();
        for (let offset = 0; offset < size; offset += OVERWRITE_CHUNK) {
            const length = Math.min(OVERWRITE_CHUNK, size - offset);
            await handle.write(crypto.randomBytes(length), 0, length, offset);
        }
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.promises.unlink(target);
    } catch {
        if (handle) await handle.close().catch(() => {});
        return { erased: false, error: true };
    }
    try {
        // Make the unlink itself durable; not supported on all platforms.
        const dir = await fs.promises.open(path.dirname(target), "r");
        await dir.sync().catch(() => {});
        await dir.close();
    } catch {
        // The unlink already succeeded; nothing to report.
    }
    return { erased: true };
}

/**
 * Reset the failed-attempt counter after a successful decrypt. Writes only
 * when the stored counter is nonzero, so untouched files are never modified.
 * @function resetCounter
 * @param {String} target Encrypted file path.
 * @param {Object} eraseInfo { counterOffset, dev, ino } from the decrypt.
 * @return {Promise.<Object>} { reset, error? }
 */
export async function resetCounter(target, eraseInfo) {
    let handle;
    try {
        handle = await _openVerified(target, eraseInfo);
        const counter = Buffer.alloc(COUNTER_LEN);
        const { bytesRead } = await handle.read(counter, 0, COUNTER_LEN, eraseInfo.counterOffset);
        if (bytesRead !== COUNTER_LEN) throw new Error("truncated counter");
        if (counter.readUInt32BE(0) === 0) {
            await handle.close();
            return { reset: false };
        }
        counter.writeUInt32BE(0, 0);
        await handle.write(counter, 0, COUNTER_LEN, eraseInfo.counterOffset);
        await handle.sync();
        await handle.close();
        return { reset: true };
    } catch {
        if (handle) await handle.close().catch(() => {});
        return { reset: false, error: true };
    }
}
