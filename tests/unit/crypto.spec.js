import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import Crypto from "@/crypto.js";
import Constants from "@/constants.js";
import FileManager from "@/filemanager.js";

// Argon2id (MODERATE) is intentionally CPU/memory heavy; give the KDF room to run.
jest.setTimeout(30000);

/**
 * Write a legacy-format .ctx file (pre-Argon2id): raw SHA-256(password) key,
 * IV prepended, [ext(8, '*'-padded)][authTag(16)] appended. Mirrors the old
 * encrypt() so we can assert backward-compatible decryption.
 */
function writeLegacyCtx(destPath, password, plaintext, extension) {
    const key = crypto.createHash("sha256").update(password).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const fillExt = "*".repeat(8 - extension.length) + extension;
    const extBuffer = Buffer.from(fillExt, "utf-8");
    fs.writeFileSync(destPath, Buffer.concat([iv, ciphertext, extBuffer, authTag]));
}

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

        // The partial/garbage output must be cleaned up, not left on disk.
        expect(fs.existsSync(sourcePath)).toBe(false);
    });

    it("writes an Argon2id KDF header (no raw SHA-256 key path)", async () => {
        const sourcePath = path.join(tempDir, "sample.txt");
        const encryptedPath = path.join(tempDir, "sample.ctx");
        fs.writeFileSync(sourcePath, "hello cryptox");

        await new Crypto("correct horse").encrypt(new FileManager(sourcePath), { value: 0 }, {});

        const buf = fs.readFileSync(encryptedPath);
        const magicLen = Constants.CTX_MAGIC.length;
        expect(buf.slice(0, magicLen).toString("utf-8")).toBe(Constants.CTX_MAGIC);
        expect(buf.readUInt8(magicLen)).toBe(Constants.CTX_FORMAT_VERSION);

        const headerLen = buf.readUInt16BE(magicLen + 1);
        const meta = JSON.parse(buf.slice(magicLen + 3, magicLen + 3 + headerLen).toString("utf-8"));
        expect(meta.kdf).toBe("argon2id");
        expect(typeof meta.salt).toBe("string");
        expect(meta.salt.length).toBeGreaterThan(0);
        expect(meta.keyLen).toBe(32);
        expect(meta.opslimit).toBeGreaterThan(0);
        expect(meta.memlimit).toBeGreaterThan(0);
    });

    it("uses a different random salt per file", async () => {
        const readSalt = (ctxPath) => {
            const buf = fs.readFileSync(ctxPath);
            const magicLen = Constants.CTX_MAGIC.length;
            const headerLen = buf.readUInt16BE(magicLen + 1);
            return JSON.parse(buf.slice(magicLen + 3, magicLen + 3 + headerLen).toString("utf-8")).salt;
        };

        const firstSource = path.join(tempDir, "first.txt");
        const secondSource = path.join(tempDir, "second.txt");
        fs.writeFileSync(firstSource, "hello cryptox");
        fs.writeFileSync(secondSource, "hello cryptox");

        await new Crypto("same password").encrypt(new FileManager(firstSource), { value: 0 }, {});
        await new Crypto("same password").encrypt(new FileManager(secondSource), { value: 0 }, {});

        expect(readSalt(path.join(tempDir, "first.ctx"))).not.toBe(readSalt(path.join(tempDir, "second.ctx")));
    });

    it("still decrypts legacy (SHA-256) .ctx files", async () => {
        const encryptedPath = path.join(tempDir, "legacy.ctx");
        const recoveredPath = path.join(tempDir, "legacy.txt");
        writeLegacyCtx(encryptedPath, "correct horse", "legacy payload", "txt");

        await new Crypto("correct horse").decrypt(new FileManager(encryptedPath), { value: 0 });

        expect(fs.readFileSync(recoveredPath, "utf-8")).toBe("legacy payload");
    });

    it("encrypts and decrypts a directory, with contents in place once decrypt resolves", async () => {
        const dirPath = path.join(tempDir, "folder");
        fs.mkdirSync(path.join(dirPath, "nested"), { recursive: true });
        fs.writeFileSync(path.join(dirPath, "a.txt"), "alpha");
        fs.writeFileSync(path.join(dirPath, "nested", "b.txt"), "beta");

        await new Crypto("correct horse").encrypt(new FileManager(dirPath), { value: 0 }, {});
        expect(fs.existsSync(`${dirPath}.ctx`)).toBe(true);

        fs.rmSync(dirPath, { force: true, recursive: true });
        await new Crypto("correct horse").decrypt(new FileManager(`${dirPath}.ctx`), { value: 0 });

        // decrypt must not resolve before extraction completed, so the files
        // are fully in place as soon as the promise settles.
        expect(fs.readFileSync(path.join(dirPath, "a.txt"), "utf-8")).toBe("alpha");
        expect(fs.readFileSync(path.join(dirPath, "nested", "b.txt"), "utf-8")).toBe("beta");
    });

    it("rejects when a decrypted directory archive contains traversal entries", async () => {
        // Encrypting a regular *.tar file marks the ctx payload as a directory
        // archive, so decrypt runs it through extraction — exactly the path a
        // malicious archive would take.
        const { pack } = require("tar-stream");
        const tarPath = path.join(tempDir, "payload.tar");
        await new Promise((resolve, reject) => {
            const archive = pack();
            const output = fs.createWriteStream(tarPath);
            output.on("close", resolve);
            output.on("error", reject);
            archive.entry({ name: "../escape.txt", type: "file" }, "pwned");
            archive.finalize();
            archive.pipe(output);
        });

        await new Crypto("correct horse").encrypt(new FileManager(tarPath), { value: 0 }, {});

        await expect(
            new Crypto("correct horse").decrypt(new FileManager(path.join(tempDir, "payload.ctx")), { value: 0 })
        ).rejects.toThrow(/traversal/i);

        expect(fs.existsSync(path.join(tempDir, "escape.txt"))).toBe(false);
    });
});
