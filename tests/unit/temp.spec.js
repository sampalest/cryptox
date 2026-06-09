import fs from "fs";
import os from "os";
import path from "path";
import TempManager from "@/temp.js";

describe("TempManager", () => {
    afterEach(() => {
        TempManager.releaseAll();
    });

    it("creates distinct directories under the OS temp location per operation", async () => {
        const first = await TempManager.acquire("op-1");
        const second = await TempManager.acquire("op-2");

        expect(first).not.toBe(second);
        for (const dir of [first, second]) {
            expect(path.dirname(dir)).toBe(os.tmpdir());
            expect(path.basename(dir)).toMatch(/^cryptox-/);
            expect(fs.statSync(dir).isDirectory()).toBe(true);
        }
    });

    it("returns the same directory for repeated acquires of one operation", async () => {
        const first = await TempManager.acquire("op-1");
        const again = await TempManager.acquire("op-1");

        expect(again).toBe(first);
    });

    it("releases only the operation-owned directory", async () => {
        const first = await TempManager.acquire("op-1");
        const second = await TempManager.acquire("op-2");

        TempManager.release("op-1");

        expect(fs.existsSync(first)).toBe(false);
        expect(fs.existsSync(second)).toBe(true);
    });

    it("ignores releases for operations that never acquired a directory", () => {
        expect(() => TempManager.release("never-acquired")).not.toThrow();
    });

    it("releases every registered directory with releaseAll", async () => {
        const first = await TempManager.acquire("op-1");
        const second = await TempManager.acquire("op-2");

        TempManager.releaseAll();

        expect(fs.existsSync(first)).toBe(false);
        expect(fs.existsSync(second)).toBe(false);
    });

    (process.platform === "win32" ? it.skip : it)("creates directories with owner-only permissions", async () => {
        const dir = await TempManager.acquire("op-1");

        expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    });
});
