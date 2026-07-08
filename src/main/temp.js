import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Per-operation temporary directory lifecycle. Each crypto operation
 * owns one unpredictable mkdtemp directory under the OS temp location, keyed
 * by its operationId, so concurrent operations can never share temp paths and
 * cleanup only ever touches the operation-owned directory.
 */
export default class TempManager {
    static _dirs = new Map();

    /**
     * Create (or return the already-created) temp directory owned by an
     * operation. mkdtemp creates the directory with mode 0o700 on POSIX;
     * on Windows the per-user %TEMP% ACL applies.
     * @param {String} operationId Owning operation id.
     * @param {String} baseDir Platform temp base (Electron's app.getPath("temp") resolves to os.tmpdir()).
     * @return {Promise.<String>} Absolute path of the owned temp directory.
     */
    static async acquire(operationId, baseDir = os.tmpdir()) {
        const existing = this._dirs.get(operationId);
        if (existing) return existing;
        const dir = await fs.promises.mkdtemp(path.join(baseDir, "lockasaur-"));
        this._dirs.set(operationId, dir);
        return dir;
    }

    /**
     * Remove the temp directory owned by an operation. Best-effort and a
     * no-op when the operation never acquired one, so callers can release
     * unconditionally in a finally block.
     * @param {String} operationId Owning operation id.
     */
    static release(operationId) {
        const dir = this._dirs.get(operationId);
        if (!dir) return;
        this._dirs.delete(operationId);
        try {
            fs.rmSync(dir, { recursive: true, force: true });
        } catch (error) {
            // Best-effort: a leftover directory must never mask the
            // operation's own result.
        }
    }

    /**
     * Remove every directory this process created (app-quit safety net).
     */
    static releaseAll() {
        for (const operationId of [...this._dirs.keys()]) {
            this.release(operationId);
        }
    }
}
