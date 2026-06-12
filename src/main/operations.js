import path from "node:path";

export class PathBusyError extends Error {
    constructor(busyPath) {
        super(`Another operation is already running on ${busyPath}`);
        this.name = "PathBusyError";
    }
}

/**
 * Main-process registry of in-flight crypto operations, keyed by operation id.
 * Owns the same-path conflict check: two concurrent operations touching the
 * same input or output path could otherwise read a half-written file or race
 * each other's cleanup.
 */
export default class OperationRegistry {
    static _ops = new Map();
    // Normalized path -> operationId holding it.
    static _activePaths = new Map();

    static _normalize(value) {
        return path.resolve(value);
    }

    /**
     * Register an operation before it starts. Throws PathBusyError when any
     * of its paths is already claimed by another in-flight operation.
     * @function register
     * @param {String} operationId Operation id.
     * @param {Crypto} crypto Crypto instance owning the operation's streams.
     * @param {Array.<String>} paths Input/output paths the operation touches.
     */
    static register(operationId, crypto, paths) {
        if (this._ops.has(operationId)) {
            throw new Error(`Duplicate operation id: ${operationId}`);
        }
        const normalized = [...new Set(paths.map(value => this._normalize(value)))];
        for (const candidate of normalized) {
            if (this._activePaths.has(candidate)) throw new PathBusyError(candidate);
        }
        normalized.forEach(candidate => this._activePaths.set(candidate, operationId));
        this._ops.set(operationId, { crypto, paths: normalized });
    }

    /**
     * Cancel an in-flight operation. Unknown or already finished ids are a
     * no-op so a late cancel from the renderer can never throw.
     * @function cancel
     * @return {Boolean} Whether an active operation was cancelled.
     */
    static cancel(operationId) {
        const op = this._ops.get(operationId);
        if (!op) return false;
        op.crypto.cancel();
        return true;
    }

    /**
     * Release an operation's entry and path claims. Call from a finally block
     * so success, failure and cancellation all free the paths.
     * @function finish
     */
    static finish(operationId) {
        const op = this._ops.get(operationId);
        if (!op) return;
        op.paths.forEach(candidate => this._activePaths.delete(candidate));
        this._ops.delete(operationId);
    }

    static cancelAll() {
        for (const operationId of [...this._ops.keys()]) {
            this.cancel(operationId);
        }
    }
}
