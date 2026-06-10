import fs from "fs";
import os from "os";
import path from "path";
import OperationRegistry, { PathBusyError } from "@/operations.js";

describe("OperationRegistry", () => {
    let tempDir;

    const stubCrypto = () => ({ cancel: jest.fn() });

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cryptox-ops-"));
    });

    afterEach(() => {
        for (const operationId of [...OperationRegistry._ops.keys()]) {
            OperationRegistry.finish(operationId);
        }
        fs.rmSync(tempDir, { force: true, recursive: true });
    });

    it("cancels a registered operation exactly once and reports it", () => {
        const crypto = stubCrypto();
        OperationRegistry.register("op-1", crypto, [path.join(tempDir, "a.txt")]);

        expect(OperationRegistry.cancel("op-1")).toBe(true);
        expect(crypto.cancel).toHaveBeenCalledTimes(1);
    });

    it("returns false when cancelling an unknown or finished operation", () => {
        expect(OperationRegistry.cancel("never-registered")).toBe(false);

        const crypto = stubCrypto();
        OperationRegistry.register("op-1", crypto, [path.join(tempDir, "a.txt")]);
        OperationRegistry.finish("op-1");

        expect(OperationRegistry.cancel("op-1")).toBe(false);
        expect(crypto.cancel).not.toHaveBeenCalled();
    });

    it("rejects a second operation on an already active path", () => {
        const target = path.join(tempDir, "a.txt");
        OperationRegistry.register("op-1", stubCrypto(), [target]);

        expect(() => OperationRegistry.register("op-2", stubCrypto(), [target]))
            .toThrow(PathBusyError);
    });

    it("normalizes paths before comparing them", () => {
        OperationRegistry.register("op-1", stubCrypto(), [path.join(tempDir, "a.txt")]);

        // Same file through a non-normalized spelling.
        const aliased = path.join(tempDir, "sub", "..", ".", "a.txt");
        expect(() => OperationRegistry.register("op-2", stubCrypto(), [aliased]))
            .toThrow(PathBusyError);
    });

    it("frees paths on finish so they can be claimed again", () => {
        const target = path.join(tempDir, "a.txt");
        OperationRegistry.register("op-1", stubCrypto(), [target]);
        OperationRegistry.finish("op-1");

        expect(() => OperationRegistry.register("op-2", stubCrypto(), [target])).not.toThrow();
    });

    it("rejects duplicate operation ids", () => {
        OperationRegistry.register("op-1", stubCrypto(), [path.join(tempDir, "a.txt")]);

        expect(() => OperationRegistry.register("op-1", stubCrypto(), [path.join(tempDir, "b.txt")]))
            .toThrow(/Duplicate operation id/);
    });

    it("cancelAll cancels every in-flight operation", () => {
        const first = stubCrypto();
        const second = stubCrypto();
        OperationRegistry.register("op-1", first, [path.join(tempDir, "a.txt")]);
        OperationRegistry.register("op-2", second, [path.join(tempDir, "b.txt")]);

        OperationRegistry.cancelAll();

        expect(first.cancel).toHaveBeenCalledTimes(1);
        expect(second.cancel).toHaveBeenCalledTimes(1);
    });

    it("leaves no registry state behind after finish", () => {
        OperationRegistry.register("op-1", stubCrypto(), [path.join(tempDir, "a.txt"), path.join(tempDir, "b.txt")]);
        OperationRegistry.finish("op-1");

        expect(OperationRegistry._ops.size).toBe(0);
        expect(OperationRegistry._activePaths.size).toBe(0);
    });
});
