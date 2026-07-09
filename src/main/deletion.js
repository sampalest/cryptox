import fs from "fs";
import { shell } from "electron";

export async function removeOriginal(target, mode) {
    // Re-lstat: refuse a symlink swapped in after encryption.
    const stats = await fs.promises.lstat(target);
    if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) return { deleted: false };
    if (mode === "trash") {
        // Plaintext: never fall back to permanent rm.
        try {
            await shell.trashItem(target);
            return { deleted: true };
        } catch (trashError) {
            return { deleted: false, error: true };
        }
    }
    try {
        await fs.promises.rm(target, { recursive: true });
        return { deleted: true };
    } catch (rmError) {
        return { deleted: false, error: true };
    }
}

export async function removeEncrypted(target, mode) {
    if (mode === "permanent") {
        try {
            await fs.promises.unlink(target);
            return { deleted: true };
        } catch (unlinkError) {
            return { deleted: false, error: true };
        }
    }
    try {
        await shell.trashItem(target);
        return { deleted: true };
    } catch (trashError) {
        // Ciphertext: permanent unlink fallback is safe.
        try {
            await fs.promises.unlink(target);
            return { deleted: true };
        } catch (unlinkError) {
            return { deleted: false, error: true };
        }
    }
}
