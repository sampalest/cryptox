import fs from "fs";
import os from "os";
import path from "path";
import Format from "@main/format.js";
import { handleFailedAttempt, resetCounter, secureErase } from "@main/erasePolicy.js";

/**
 * Write a minimal DINO container: valid prefix + mutable block + opaque
 * payload bytes. The module only reads the prefix and counter, so no real
 * encryption is needed.
 */
function writeDino(filePath, { counter = 0, size = 4096, version = 1, magic = "DINO" } = {}) {
    const buf = Buffer.alloc(size, 0xab);
    buf.write(magic, 0, "utf-8");
    buf.writeUInt8(version, 4);
    buf.writeUInt8(0, 5);
    buf.writeUInt16BE(64, 6);
    buf.writeUInt32BE(counter, 8);
    buf.writeUInt32BE(0, 12);
    fs.writeFileSync(filePath, buf);
}

/** eraseInfo as the decrypt path would record it for this file. */
function infoFor(filePath, maxAttempts = 3) {
    const stats = fs.lstatSync(filePath);
    return { maxAttempts, counterOffset: Format.COUNTER_OFFSET, dev: stats.dev, ino: stats.ino };
}

const readCounter = filePath => fs.readFileSync(filePath).readUInt32BE(Format.COUNTER_OFFSET);

describe("erasePolicy", () => {
    let tempDir;
    let target;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockasaur-erase-"));
        target = path.join(tempDir, "guarded.dino");
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(tempDir, { force: true, recursive: true });
    });

    describe("handleFailedAttempt", () => {
        it("increments the counter and reports the remaining attempts", async () => {
            writeDino(target, { counter: 0 });
            const before = fs.readFileSync(target);

            const result = await handleFailedAttempt(target, infoFor(target, 3));

            expect(result).toEqual({ counted: true, attemptsRemaining: 2 });
            expect(readCounter(target)).toBe(1);
            // Only the counter word changed; everything else is untouched.
            const after = fs.readFileSync(target);
            after.writeUInt32BE(0, Format.COUNTER_OFFSET);
            expect(after.equals(before)).toBe(true);
        });

        it("erases the file when the limit is reached", async () => {
            writeDino(target, { counter: 2 });

            const result = await handleFailedAttempt(target, infoFor(target, 3));

            expect(result).toEqual({ counted: true, attemptsRemaining: 0, erased: true });
            expect(fs.existsSync(target)).toBe(false);
        });

        it("saturates a corrupted oversized counter instead of wrapping", async () => {
            writeDino(target, { counter: 0xfffffffe });
            const unlink = jest.spyOn(fs.promises, "unlink");

            const result = await handleFailedAttempt(target, infoFor(target, 3));

            // Saturation lands exactly at maxAttempts, so the limit fires.
            expect(result.attemptsRemaining).toBe(0);
            expect(result.erased).toBe(true);
            expect(unlink).toHaveBeenCalledTimes(1);
        });

        it("counts nothing and never erases when the counter cannot be written", async () => {
            writeDino(target, { counter: 2 });
            fs.chmodSync(target, 0o444);
            const unlink = jest.spyOn(fs.promises, "unlink");

            const result = await handleFailedAttempt(target, infoFor(target, 3));

            expect(result).toEqual({ counted: false, error: true });
            expect(unlink).not.toHaveBeenCalled();
            fs.chmodSync(target, 0o644);
            expect(readCounter(target)).toBe(2);
        });

        it("reports an error when the erase itself fails, never a success", async () => {
            writeDino(target, { counter: 2 });
            jest.spyOn(fs.promises, "unlink").mockRejectedValue(new Error("EPERM"));

            const result = await handleFailedAttempt(target, infoFor(target, 3));

            expect(result).toEqual({ counted: true, attemptsRemaining: 0, erased: false, error: true });
            expect(fs.existsSync(target)).toBe(true);
        });

        it("refuses a symlink swapped in at the target path", async () => {
            const realFile = path.join(tempDir, "real.dino");
            writeDino(realFile, { counter: 0 });
            const info = infoFor(realFile, 3);
            fs.symlinkSync(realFile, target);

            const result = await handleFailedAttempt(target, info);

            expect(result).toEqual({ counted: false, error: true });
            expect(readCounter(realFile)).toBe(0);
        });

        it("refuses a file swapped in since the decrypt (dev/ino mismatch)", async () => {
            writeDino(target, { counter: 0 });
            const info = infoFor(target, 3);
            // Swap via rename of a coexisting file: unlink + recreate can
            // reuse the freed inode on ext4, silently defeating the test.
            const swapped = path.join(tempDir, "swapped.dino");
            writeDino(swapped, { counter: 0 });
            fs.renameSync(swapped, target);

            const result = await handleFailedAttempt(target, info);

            expect(result).toEqual({ counted: false, error: true });
            expect(readCounter(target)).toBe(0);
        });

        it("refuses hard-linked files", async () => {
            writeDino(target, { counter: 2 });
            fs.linkSync(target, path.join(tempDir, "alias.dino"));

            const result = await handleFailedAttempt(target, infoFor(target, 3));

            expect(result).toEqual({ counted: false, error: true });
            expect(fs.existsSync(target)).toBe(true);
            expect(readCounter(target)).toBe(2);
        });

        it.each([
            ["a CTX1 container", { magic: "CTX1" }],
            ["an unknown DINO version", { version: 9 }]
        ])("refuses %s", async (label, overrides) => {
            writeDino(target, { counter: 0, ...overrides });

            const result = await handleFailedAttempt(target, infoFor(target, 3));

            expect(result).toEqual({ counted: false, error: true });
            expect(readCounter(target)).toBe(0);
        });

        it("resolves instead of rejecting when the file is gone", async () => {
            writeDino(target, { counter: 0 });
            const info = infoFor(target, 3);
            fs.unlinkSync(target);

            await expect(handleFailedAttempt(target, info)).resolves.toEqual({ counted: false, error: true });
        });
    });

    describe("secureErase", () => {
        it("overwrites the full content before unlinking", async () => {
            writeDino(target, { counter: 0, size: 200000 });
            const original = fs.readFileSync(target);
            let contentAtUnlink = null;
            jest.spyOn(fs.promises, "unlink").mockImplementation(async unlinkTarget => {
                contentAtUnlink = fs.readFileSync(unlinkTarget);
                fs.unlinkSync(unlinkTarget);
            });

            const result = await secureErase(target, infoFor(target));

            expect(result).toEqual({ erased: true });
            expect(fs.existsSync(target)).toBe(false);
            expect(contentAtUnlink.length).toBe(original.length);
            expect(contentAtUnlink.equals(original)).toBe(false);
            // Every 64 KiB chunk changed, including the trailing partial one.
            for (let offset = 0; offset < original.length; offset += 65536) {
                const end = Math.min(offset + 65536, original.length);
                expect(contentAtUnlink.slice(offset, end).equals(original.slice(offset, end))).toBe(false);
            }
        });

        it("reports an error and keeps whatever is on disk when unlink fails", async () => {
            writeDino(target, { counter: 0 });
            jest.spyOn(fs.promises, "unlink").mockRejectedValue(new Error("EPERM"));

            const result = await secureErase(target, infoFor(target));

            expect(result).toEqual({ erased: false, error: true });
            expect(fs.existsSync(target)).toBe(true);
        });

        it("refuses a swapped file identity", async () => {
            writeDino(target, { counter: 0 });
            const info = infoFor(target);
            const swapped = path.join(tempDir, "swapped.dino");
            writeDino(swapped, { counter: 0 });
            fs.renameSync(swapped, target);
            const before = fs.readFileSync(target);

            const result = await secureErase(target, info);

            expect(result).toEqual({ erased: false, error: true });
            expect(fs.readFileSync(target).equals(before)).toBe(true);
        });
    });

    describe("resetCounter", () => {
        it("writes zero when the stored counter is nonzero", async () => {
            writeDino(target, { counter: 2 });

            const result = await resetCounter(target, infoFor(target));

            expect(result).toEqual({ reset: true });
            expect(readCounter(target)).toBe(0);
        });

        it("does not touch a file whose counter is already zero", async () => {
            writeDino(target, { counter: 0 });
            const before = fs.readFileSync(target);

            const result = await resetCounter(target, infoFor(target));

            expect(result).toEqual({ reset: false });
            expect(fs.readFileSync(target).equals(before)).toBe(true);
        });

        it("resolves with an error instead of rejecting on failure", async () => {
            writeDino(target, { counter: 2 });
            fs.chmodSync(target, 0o444);

            await expect(resetCounter(target, infoFor(target))).resolves.toEqual({ reset: false, error: true });

            fs.chmodSync(target, 0o644);
            expect(readCounter(target)).toBe(2);
        });
    });
});
