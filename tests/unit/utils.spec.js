import fs from "fs";
import os from "os";
import path from "path";
import { pack } from "tar-stream";
import Utils from "@main/utils.js";

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

    describe("sanitizeReservedPath", () => {
        it("prefixes reserved DOS device names, with or without an extension", () => {
            expect(Utils.sanitizeReservedPath("CON")).toBe("_CON");
            expect(Utils.sanitizeReservedPath("aux")).toBe("_aux");
            expect(Utils.sanitizeReservedPath("com1")).toBe("_com1");
            expect(Utils.sanitizeReservedPath("LPT9.log")).toBe("_LPT9.log");
            expect(Utils.sanitizeReservedPath("nul.tar.gz")).toBe("_nul.tar.gz");
        });

        it("strips trailing dots and spaces", () => {
            expect(Utils.sanitizeReservedPath("report. ")).toBe("report");
            expect(Utils.sanitizeReservedPath("dots...")).toBe("dots");
            expect(Utils.sanitizeReservedPath("CON.")).toBe("_CON");
        });

        it("leaves safe names and reserved-name prefixes untouched", () => {
            expect(Utils.sanitizeReservedPath("report.txt")).toBe("report.txt");
            expect(Utils.sanitizeReservedPath("console")).toBe("console");
            expect(Utils.sanitizeReservedPath("com10")).toBe("com10");
        });

        it("rewrites each path segment and preserves the separators", () => {
            expect(Utils.sanitizeReservedPath("nested/CON/file.txt")).toBe("nested/_CON/file.txt");
            expect(Utils.sanitizeReservedPath("a/aux.txt")).toBe("a/_aux.txt");
        });
    });

    describe("uniquePath", () => {
        let tempDir;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cryptox-unique-"));
        });

        afterEach(() => {
            fs.rmSync(tempDir, { force: true, recursive: true });
        });

        it("returns the desired path untouched when it is free", () => {
            const desired = path.join(tempDir, "report.ctx");
            expect(Utils.uniquePath(desired)).toBe(desired);
        });

        it("inserts the counter before the last extension on collisions", () => {
            const desired = path.join(tempDir, "report.ctx");
            fs.writeFileSync(desired, "taken");
            expect(Utils.uniquePath(desired)).toBe(path.join(tempDir, "report (1).ctx"));

            fs.writeFileSync(path.join(tempDir, "report (1).ctx"), "also taken");
            expect(Utils.uniquePath(desired)).toBe(path.join(tempDir, "report (2).ctx"));
        });

        it("appends the counter after a dotfile name", () => {
            const desired = path.join(tempDir, ".env");
            fs.writeFileSync(desired, "taken");
            expect(Utils.uniquePath(desired)).toBe(path.join(tempDir, ".env (1)"));
        });

        it("appends the counter after the full name in directory mode", () => {
            const desired = path.join(tempDir, "mydir.v2");
            fs.mkdirSync(desired);
            expect(Utils.uniquePath(desired, true)).toBe(path.join(tempDir, "mydir.v2 (1)"));
        });

        it("deflects when a directory occupies the desired file name", () => {
            const desired = path.join(tempDir, "report.ctx");
            fs.mkdirSync(desired);
            expect(Utils.uniquePath(desired)).toBe(path.join(tempDir, "report (1).ctx"));
        });
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

        it("sanitizes Windows reserved names on win32 and leaves them intact elsewhere", async () => {
            await writeTar(tarPath, [
                { header: { name: "CON", type: "file" }, body: "device" },
                { header: { name: "sub", type: "directory" } },
                { header: { name: "sub/aux.txt", type: "file" }, body: "auxbody" }
            ]);

            await Utils.unzipDirectory(tarPath, outputDir);

            if (process.platform === "win32") {
                // Reserved names cannot be written on Windows, so they are renamed
                // rather than failing the whole directory decrypt.
                expect(fs.readFileSync(path.join(outputDir, "_CON"), "utf-8")).toBe("device");
                expect(fs.readFileSync(path.join(outputDir, "sub", "_aux.txt"), "utf-8")).toBe("auxbody");
            } else {
                // Off Windows the names are perfectly valid and extract unchanged.
                expect(fs.readFileSync(path.join(outputDir, "CON"), "utf-8")).toBe("device");
                expect(fs.readFileSync(path.join(outputDir, "sub", "aux.txt"), "utf-8")).toBe("auxbody");
            }
            expect(leftoverTempDirs()).toEqual([]);
        });

        it("never merges into an existing output directory, deflecting instead", async () => {
            fs.mkdirSync(outputDir);
            fs.writeFileSync(path.join(outputDir, "existing.txt"), "keep me");
            await writeTar(tarPath, [
                { header: { name: "fresh.txt", type: "file" }, body: "fresh" }
            ]);

            await Utils.unzipDirectory(tarPath, outputDir);

            // The pre-existing directory is untouched and the extraction lands
            // at a fresh "name (n)" variant.
            expect(fs.readFileSync(path.join(outputDir, "existing.txt"), "utf-8")).toBe("keep me");
            expect(fs.existsSync(path.join(outputDir, "fresh.txt"))).toBe(false);
            expect(fs.readFileSync(path.join(`${outputDir} (1)`, "fresh.txt"), "utf-8")).toBe("fresh");
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
