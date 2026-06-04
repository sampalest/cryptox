import fs from "fs";
import os from "os";
import path from "path";
import Crypto from "@/crypto.js";
import FileManager from "@/filemanager.js";

describe("Crypto", () => {
    let tempDir;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cryptox-test-"));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { force: true, recursive: true });
    });

    it("encrypts and decrypts a ctx file with the same password", async () => {
        const sourcePath = path.join(tempDir, "sample.txt");
        const encryptedPath = path.join(tempDir, "sample.ctx");
        fs.writeFileSync(sourcePath, "hello cryptox");

        await new Crypto("correct horse").encrypt(new FileManager(sourcePath), { value: 0 }, {});

        expect(fs.existsSync(encryptedPath)).toBe(true);

        fs.unlinkSync(sourcePath);
        await new Crypto("correct horse").decrypt(new FileManager(encryptedPath), { value: 0 });

        expect(fs.readFileSync(sourcePath, "utf-8")).toBe("hello cryptox");
    });

    it("rejects when decrypting with the wrong password", async () => {
        const sourcePath = path.join(tempDir, "sample.txt");
        const encryptedPath = path.join(tempDir, "sample.ctx");
        fs.writeFileSync(sourcePath, "hello cryptox");

        await new Crypto("correct horse").encrypt(new FileManager(sourcePath), { value: 0 }, {});
        fs.unlinkSync(sourcePath);

        await expect(
            new Crypto("wrong horse").decrypt(new FileManager(encryptedPath), { value: 0 })
        ).rejects.toThrow();
    });
});
