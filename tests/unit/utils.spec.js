import fs from "fs";
import os from "os";
import path from "path";
import { pack } from "tar-stream";
import Utils from "@/utils.js";

/**
 * Write a tar archive with arbitrary (possibly malicious) entries.
 * Each entry is { header, body? } as accepted by tar-stream.
 */
function writeTar(destPath, entries) {
    return new Promise((resolve, reject) => {
        const archive = pack();
        const output = fs.createWriteStream(destPath);
        output.on("close", resolve);
        output.on("error", reject);
        archive.on("error", reject);
        for (const entry of entries) {
            archive.entry(entry.header, entry.body);
        }
        archive.finalize();
        archive.pipe(output);
    });
}

describe("Utils", () => {
    it("pads short extensions to the ctx metadata width", () => {
        expect(Utils.fillExtension("txt")).toBe("*****txt");
    });

    it("truncates long extensions to fit the ctx metadata width", () => {
        expect(Utils.fillExtension("longextension")).toBe("longe...");
    });

    describe("unzipDirectory", () => {
        let tempDir;
        let tarPath;
        let outputDir;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cryptox-tar-"));
            tarPath = path.join(tempDir, "archive.tar");
            outputDir = path.join(tempDir, "output");
        });

        afterEach(() => {
            fs.rmSync(tempDir, { force: true, recursive: true });
        });

        const leftoverTempDirs = () =>
            fs.readdirSync(tempDir).filter(name => name.startsWith(".cryptox-extract-"));

        it("extracts files and directories and resolves when done", async () => {
            await writeTar(tarPath, [
                { header: { name: "nested", type: "directory" } },
                { header: { name: "top.txt", type: "file" }, body: "top" },
                { header: { name: "nested/inner.txt", type: "file" }, body: "inner" }
            ]);

            await Utils.unzipDirectory(tarPath, outputDir);

            expect(fs.readFileSync(path.join(outputDir, "top.txt"), "utf-8")).toBe("top");
            expect(fs.readFileSync(path.join(outputDir, "nested", "inner.txt"), "utf-8")).toBe("inner");
            expect(leftoverTempDirs()).toEqual([]);
        });

        it("merges into an already existing output directory", async () => {
            fs.mkdirSync(outputDir);
            fs.writeFileSync(path.join(outputDir, "existing.txt"), "keep me");
            await writeTar(tarPath, [
                { header: { name: "fresh.txt", type: "file" }, body: "fresh" }
            ]);

            await Utils.unzipDirectory(tarPath, outputDir);

            expect(fs.readFileSync(path.join(outputDir, "existing.txt"), "utf-8")).toBe("keep me");
            expect(fs.readFileSync(path.join(outputDir, "fresh.txt"), "utf-8")).toBe("fresh");
            expect(leftoverTempDirs()).toEqual([]);
        });

        it("rejects ../ path traversal entries and writes nothing", async () => {
            await writeTar(tarPath, [
                { header: { name: "../escape.txt", type: "file" }, body: "pwned" }
            ]);

            await expect(Utils.unzipDirectory(tarPath, outputDir)).rejects.toThrow(/traversal/i);

            expect(fs.existsSync(path.join(tempDir, "escape.txt"))).toBe(false);
            expect(fs.existsSync(outputDir)).toBe(false);
            expect(leftoverTempDirs()).toEqual([]);
        });

        it("rejects absolute path entries", async () => {
            await writeTar(tarPath, [
                { header: { name: path.join(tempDir, "abs-escape.txt"), type: "file" }, body: "pwned" }
            ]);

            await expect(Utils.unzipDirectory(tarPath, outputDir)).rejects.toThrow(/absolute/i);

            expect(fs.existsSync(path.join(tempDir, "abs-escape.txt"))).toBe(false);
            expect(fs.existsSync(outputDir)).toBe(false);
        });

        it("rejects symlink entries", async () => {
            await writeTar(tarPath, [
                { header: { name: "evil-link", type: "symlink", linkname: "/etc" } }
            ]);

            await expect(Utils.unzipDirectory(tarPath, outputDir)).rejects.toThrow(/unsafe tar entry type/i);

            expect(fs.existsSync(outputDir)).toBe(false);
        });

        it("rejects hardlink entries", async () => {
            await writeTar(tarPath, [
                { header: { name: "evil-hardlink", type: "link", linkname: "/etc/hosts" } }
            ]);

            await expect(Utils.unzipDirectory(tarPath, outputDir)).rejects.toThrow(/unsafe tar entry type/i);

            expect(fs.existsSync(outputDir)).toBe(false);
        });

        it("rejects device, fifo and other special entry types", async () => {
            for (const type of ["character-device", "block-device", "fifo"]) {
                await writeTar(tarPath, [
                    { header: { name: `special-${type}`, type } }
                ]);

                await expect(Utils.unzipDirectory(tarPath, outputDir)).rejects.toThrow(/unsafe tar entry type/i);
            }

            expect(fs.existsSync(outputDir)).toBe(false);
            expect(leftoverTempDirs()).toEqual([]);
        });

        it("propagates tar stream errors for corrupt archives", async () => {
            fs.writeFileSync(tarPath, Buffer.from("this is definitely not a tar archive"));

            await expect(Utils.unzipDirectory(tarPath, outputDir)).rejects.toThrow();

            expect(fs.existsSync(outputDir)).toBe(false);
            expect(leftoverTempDirs()).toEqual([]);
        });

        it("propagates read errors for a missing input file", async () => {
            await expect(
                Utils.unzipDirectory(path.join(tempDir, "missing.tar"), outputDir)
            ).rejects.toThrow();

            expect(fs.existsSync(outputDir)).toBe(false);
            expect(leftoverTempDirs()).toEqual([]);
        });
    });
});
