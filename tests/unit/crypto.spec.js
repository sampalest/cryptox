import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import sodium from "libsodium-wrappers-sumo";
import Crypto from "@/crypto.js";
import Format from "@/format.js";
import FileManager from "@/filemanager.js";
import TempManager from "@/temp.js";
import Utils from "@/utils.js";

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

/**
 * Derive an Argon2id key with MIN limits so test files decrypt fast (this also
 * exercises that decrypt honors the per-file KDF params from the header).
 */
async function deriveTestKey(password, salt) {
    await sodium.ready;
    const opslimit = sodium.crypto_pwhash_OPSLIMIT_MIN;
    const memlimit = sodium.crypto_pwhash_MEMLIMIT_MIN;
    const key = Buffer.from(sodium.crypto_pwhash(32, password, salt, opslimit, memlimit, sodium.crypto_pwhash_ALG_ARGON2ID13));
    return { key, opslimit, memlimit };
}

/**
 * Write an interim-format (CTXBOX, 0.3.x alphas) .ctx file:
 * [magic 6][version 1][headerLen u16BE][JSON kdf meta][IV][ciphertext][ext 8][tag 16].
 * Header is NOT authenticated. Mirrors the alpha writer so we can assert the
 * read fallback keeps working.
 */
async function writeInterimCtx(destPath, password, plaintext, extension, metaOverrides = {}) {
    await sodium.ready;
    const salt = Buffer.from(sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES));
    const { key, opslimit, memlimit } = await deriveTestKey(password, salt);
    const meta = Object.assign({
        kdf: "argon2id",
        salt: salt.toString("base64"),
        opslimit: opslimit,
        memlimit: memlimit,
        keyLen: 32
    }, metaOverrides);
    const json = Buffer.from(JSON.stringify(meta), "utf-8");
    const prefix = Buffer.alloc(9);
    prefix.write("CTXBOX", 0, "utf-8");
    prefix.writeUInt8(1, 6);
    prefix.writeUInt16BE(json.length, 7);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const fillExt = "*".repeat(8 - extension.length) + extension;
    fs.writeFileSync(destPath, Buffer.concat([prefix, json, iv, ciphertext, Buffer.from(fillExt, "utf-8"), authTag]));
}

/**
 * Write a CTX1 file directly (bypassing encrypt()), so tests can use fast MIN
 * KDF limits and emit headers the production writer would refuse (malformed
 * JSON, traversal names, oversized lengths, hostile flags, ...).
 */
async function writeCtx1File(destPath, password, payload, { flags = 0, metaOverrides = {}, rawHeader } = {}) {
    await sodium.ready;
    const salt = Buffer.from(sodium.randombytes_buf(16));
    const { key, opslimit, memlimit } = await deriveTestKey(password, salt);
    let header = rawHeader;
    if (!header) {
        const meta = Object.assign({
            alg: "aes-256-gcm",
            kdf: "argon2id",
            salt: salt.toString("base64"),
            opslimit: opslimit,
            memlimit: memlimit,
            keyLen: 32,
            name: "payload.txt"
        }, metaOverrides);
        const json = Buffer.from(JSON.stringify(meta), "utf-8");
        const prefix = Buffer.alloc(8);
        prefix.write("CTX1", 0, "utf-8");
        prefix.writeUInt8(1, 4);
        prefix.writeUInt8(flags, 5);
        prefix.writeUInt16BE(json.length, 6);
        header = Buffer.concat([prefix, json]);
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(header);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(payload)), cipher.final()]);
    fs.writeFileSync(destPath, Buffer.concat([header, iv, ciphertext, cipher.getAuthTag()]));
}

/** Parse the header of a CTX1 file written by encrypt(). */
function readCtx1Header(ctxPath) {
    const buf = fs.readFileSync(ctxPath);
    const headerLen = buf.readUInt16BE(6);
    return {
        magic: buf.slice(0, 4).toString("utf-8"),
        version: buf.readUInt8(4),
        flags: buf.readUInt8(5),
        headerLen: headerLen,
        meta: JSON.parse(buf.slice(8, 8 + headerLen).toString("utf-8")),
        raw: buf
    };
}

describe("Crypto", () => {
    let tempDir;
    // Wraps the real TempManager.acquire so tests can assert which temp
    // directories an operation got and that they are gone afterwards.
    let acquiredDirs;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cryptox-test-"));
        acquiredDirs = [];
        const realAcquire = TempManager.acquire.bind(TempManager);
        jest.spyOn(TempManager, "acquire").mockImplementation(async (...args) => {
            const dir = await realAcquire(...args);
            if (!acquiredDirs.includes(dir)) acquiredDirs.push(dir);
            return dir;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        TempManager.releaseAll();
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

    it("writes the CTX1 format and never the old layouts", async () => {
        const sourcePath = path.join(tempDir, "sample.txt");
        const plaintext = "hello cryptox";
        fs.writeFileSync(sourcePath, plaintext);

        await new Crypto("correct horse").encrypt(new FileManager(sourcePath), { value: 0 }, {});

        const { magic, version, flags, headerLen, meta, raw } = readCtx1Header(path.join(tempDir, "sample.ctx"));
        expect(magic).toBe("CTX1");
        expect(version).toBe(1);
        expect(flags).toBe(0);
        expect(headerLen).toBeGreaterThan(0);
        expect(headerLen).toBeLessThanOrEqual(Format.MAX_HEADER_JSON);
        expect(meta.alg).toBe("aes-256-gcm");
        expect(meta.kdf).toBe("argon2id");
        expect(meta.name).toBe("sample.txt");
        expect(meta.keyLen).toBe(32);
        expect(Buffer.from(meta.salt, "base64").length).toBe(16);
        expect(meta.opslimit).toBeGreaterThan(0);
        expect(meta.memlimit).toBeGreaterThan(0);

        // Pin the exact layout: [header][IV 16][ciphertext][tag 16] with no
        // trailing 8-byte '*'-padded extension field (the old layouts' marker).
        expect(raw.slice(0, 6).toString("utf-8")).not.toBe("CTXBOX");
        expect(raw.length).toBe(8 + headerLen + 16 + plaintext.length + 16);
        expect(raw.slice(raw.length - 24, raw.length - 16).toString("utf-8")).not.toBe("*****txt");
    });

    it("uses a different random salt per file", async () => {
        const firstSource = path.join(tempDir, "first.txt");
        const secondSource = path.join(tempDir, "second.txt");
        fs.writeFileSync(firstSource, "hello cryptox");
        fs.writeFileSync(secondSource, "hello cryptox");

        await new Crypto("same password").encrypt(new FileManager(firstSource), { value: 0 }, {});
        await new Crypto("same password").encrypt(new FileManager(secondSource), { value: 0 }, {});

        const firstSalt = readCtx1Header(path.join(tempDir, "first.ctx")).meta.salt;
        const secondSalt = readCtx1Header(path.join(tempDir, "second.ctx")).meta.salt;
        expect(firstSalt).not.toBe(secondSalt);
    });

    it("decrypts using the header name even when the .ctx file is renamed", async () => {
        const encryptedPath = path.join(tempDir, "renamed.blob");
        await writeCtx1File(encryptedPath, "correct horse", "named payload", { metaOverrides: { name: "original.txt" } });

        await new Crypto("correct horse").decrypt(new FileManager(encryptedPath), { value: 0 });

        expect(fs.readFileSync(path.join(tempDir, "original.txt"), "utf-8")).toBe("named payload");
    });

    it("rejects a tampered header even with the correct password", async () => {
        const encryptedPath = path.join(tempDir, "tamper.ctx");
        await writeCtx1File(encryptedPath, "correct horse", "tamper payload", { metaOverrides: { name: "sample.txt" } });

        // Swap one letter of the name in the raw bytes: the JSON stays valid,
        // the name stays sane and the derived key is unchanged (salt untouched),
        // so only the AAD authentication can catch this.
        const buf = fs.readFileSync(encryptedPath);
        const idx = buf.indexOf("sample.txt");
        expect(idx).toBeGreaterThan(0);
        buf.write("zample.txt", idx, "utf-8");
        fs.writeFileSync(encryptedPath, buf);

        await expect(
            new Crypto("correct horse").decrypt(new FileManager(encryptedPath), { value: 0 })
        ).rejects.toThrow();

        // No output may be left behind, under either name.
        expect(fs.existsSync(path.join(tempDir, "sample.txt"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, "zample.txt"))).toBe(false);
    });

    it("still decrypts legacy (SHA-256) .ctx files", async () => {
        const encryptedPath = path.join(tempDir, "legacy.ctx");
        const recoveredPath = path.join(tempDir, "legacy.txt");
        writeLegacyCtx(encryptedPath, "correct horse", "legacy payload", "txt");

        await new Crypto("correct horse").decrypt(new FileManager(encryptedPath), { value: 0 });

        expect(fs.readFileSync(recoveredPath, "utf-8")).toBe("legacy payload");
    });

    it("still decrypts interim (CTXBOX) .ctx files", async () => {
        const encryptedPath = path.join(tempDir, "interim.ctx");
        const recoveredPath = path.join(tempDir, "interim.txt");
        await writeInterimCtx(encryptedPath, "correct horse", "interim payload", "txt");

        await new Crypto("correct horse").decrypt(new FileManager(encryptedPath), { value: 0 });

        expect(fs.readFileSync(recoveredPath, "utf-8")).toBe("interim payload");
    });

    it("rejects an interim file with an absurd memlimit before any KDF work", async () => {
        const encryptedPath = path.join(tempDir, "interim.ctx");
        await writeInterimCtx(encryptedPath, "correct horse", "interim payload", "txt", { memlimit: 2147483648 });

        await expect(
            new Crypto("correct horse").decrypt(new FileManager(encryptedPath), { value: 0 })
        ).rejects.toThrow(/memlimit/);
    });

    it("rejects malformed CTX1 headers before any KDF or stream work", async () => {
        const writeRaw = (name, header, padding = 64) => {
            const filePath = path.join(tempDir, name);
            fs.writeFileSync(filePath, Buffer.concat([header, Buffer.alloc(padding)]));
            return filePath;
        };
        const prefix = (flags, headerLen) => {
            const buf = Buffer.alloc(8);
            buf.write("CTX1", 0, "utf-8");
            buf.writeUInt8(1, 4);
            buf.writeUInt8(flags, 5);
            buf.writeUInt16BE(headerLen, 6);
            return buf;
        };
        const withJson = (json) => Buffer.concat([prefix(0, Buffer.byteLength(json)), Buffer.from(json, "utf-8")]);
        const validKdf = "\"kdf\":\"argon2id\",\"salt\":\"" + Buffer.alloc(16).toString("base64") + "\",\"opslimit\":1,\"memlimit\":8192,\"keyLen\":32";

        const cases = [
            ["oversized.ctx", prefix(0, 5000), /header length/],
            ["badjson.ctx", withJson("{definitely not json"), /JSON/],
            ["dos.ctx", withJson("{\"alg\":\"aes-256-gcm\"," + validKdf.replace("\"memlimit\":8192", "\"memlimit\":2147483648") + ",\"name\":\"a.txt\"}"), /memlimit/],
            ["traversal.ctx", withJson("{\"alg\":\"aes-256-gcm\"," + validKdf + ",\"name\":\"../evil.txt\"}"), /name/],
            ["badversion.ctx", Buffer.concat([Buffer.from("CTX1"), Buffer.from([9, 0, 0, 2])]), /unsupported format version/]
        ];

        for (const [name, header, pattern] of cases) {
            const filePath = writeRaw(name, header);
            await expect(
                new Crypto("correct horse").decrypt(new FileManager(filePath), { value: 0 })
            ).rejects.toThrow(pattern);
        }
    });

    it("rejects a truncated CTX1 file cleanly", async () => {
        const encryptedPath = path.join(tempDir, "trunc.ctx");
        await writeCtx1File(encryptedPath, "correct horse", "truncate me", { metaOverrides: { name: "trunc.txt" } });

        // Cut inside the IV/ciphertext region: the header still parses, but the
        // payload no longer fits.
        const headerLen = fs.readFileSync(encryptedPath).readUInt16BE(6);
        fs.truncateSync(encryptedPath, 8 + headerLen + 10);

        await expect(
            new Crypto("correct horse").decrypt(new FileManager(encryptedPath), { value: 0 })
        ).rejects.toThrow(/too short/);
        expect(fs.existsSync(path.join(tempDir, "trunc.txt"))).toBe(false);
    });

    it("round-trips an empty file", async () => {
        const sourcePath = path.join(tempDir, "empty.txt");
        fs.writeFileSync(sourcePath, "");

        await new Crypto("correct horse").encrypt(new FileManager(sourcePath), { value: 0 }, {});
        fs.unlinkSync(sourcePath);

        await new Crypto("correct horse").decrypt(new FileManager(path.join(tempDir, "empty.ctx")), { value: 0 });

        expect(fs.readFileSync(sourcePath, "utf-8")).toBe("");
    });

    it("encrypts and decrypts a directory, with contents in place once decrypt resolves", async () => {
        const dirPath = path.join(tempDir, "folder");
        fs.mkdirSync(path.join(dirPath, "nested"), { recursive: true });
        fs.writeFileSync(path.join(dirPath, "a.txt"), "alpha");
        fs.writeFileSync(path.join(dirPath, "nested", "b.txt"), "beta");
        // Snapshot, not bare non-existence: a stale dir left by old versions
        // on the host must not fail the test — only (re)creating it should.
        const hadLegacyGlobalTmp = fs.existsSync("/tmp/cryptox");

        await new Crypto("correct horse").encrypt(new FileManager(dirPath), { value: 0 }, {});
        expect(fs.existsSync(`${dirPath}.ctx`)).toBe(true);

        // The operation-owned temp directory must be gone once encrypt resolves.
        expect(acquiredDirs).toHaveLength(1);
        expect(fs.existsSync(acquiredDirs[0])).toBe(false);

        // Directory payloads carry the flag bit and the tar name in the header.
        const { flags, meta } = readCtx1Header(`${dirPath}.ctx`);
        expect(flags & Format.FLAG_DIRECTORY).toBe(Format.FLAG_DIRECTORY);
        expect(meta.name).toBe("folder.tar");

        fs.rmSync(dirPath, { force: true, recursive: true });
        await new Crypto("correct horse").decrypt(new FileManager(`${dirPath}.ctx`), { value: 0 });

        // decrypt must not resolve before extraction completed, so the files
        // are fully in place as soon as the promise settles.
        expect(fs.readFileSync(path.join(dirPath, "a.txt"), "utf-8")).toBe("alpha");
        expect(fs.readFileSync(path.join(dirPath, "nested", "b.txt"), "utf-8")).toBe("beta");

        // Decrypt's temp directory is cleaned up too, and the old fixed global
        // temp directory is never created.
        expect(acquiredDirs).toHaveLength(2);
        expect(fs.existsSync(acquiredDirs[1])).toBe(false);
        expect(fs.existsSync("/tmp/cryptox")).toBe(hadLegacyGlobalTmp);
    });

    it("gives concurrent directory operations distinct temp paths", async () => {
        // Two source directories with the SAME basename: under the old global
        // /tmp/cryptox both tars would have collided at folder.tar.
        const contents = {};
        for (const parent of ["a", "b"]) {
            const dirPath = path.join(tempDir, parent, "folder");
            fs.mkdirSync(dirPath, { recursive: true });
            contents[parent] = `payload of ${parent}`;
            fs.writeFileSync(path.join(dirPath, "data.txt"), contents[parent]);
        }

        await Promise.all(["a", "b"].map(parent =>
            new Crypto("correct horse").encrypt(new FileManager(path.join(tempDir, parent, "folder")), { value: 0 }, {})
        ));

        expect(acquiredDirs).toHaveLength(2);
        expect(acquiredDirs[0]).not.toBe(acquiredDirs[1]);
        for (const dir of acquiredDirs) {
            expect(path.basename(dir)).toMatch(/^cryptox-/);
            expect(fs.existsSync(dir)).toBe(false);
        }

        for (const parent of ["a", "b"]) {
            const dirPath = path.join(tempDir, parent, "folder");
            fs.rmSync(dirPath, { force: true, recursive: true });
            await new Crypto("correct horse").decrypt(new FileManager(`${dirPath}.ctx`), { value: 0 });
            expect(fs.readFileSync(path.join(dirPath, "data.txt"), "utf-8")).toBe(contents[parent]);
        }
    });

    it("cleans up the temp directory when directory encryption fails", async () => {
        const dirPath = path.join(tempDir, "folder");
        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(path.join(dirPath, "a.txt"), "alpha");
        jest.spyOn(Utils, "zipDirectory").mockRejectedValue(new Error("tar failed"));

        await expect(
            new Crypto("correct horse").encrypt(new FileManager(dirPath), { value: 0 }, {})
        ).rejects.toThrow("tar failed");

        expect(acquiredDirs).toHaveLength(1);
        expect(fs.existsSync(acquiredDirs[0])).toBe(false);
    });

    it("cleans up the temp directory when directory decryption fails", async () => {
        const dirPath = path.join(tempDir, "folder");
        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(path.join(dirPath, "a.txt"), "alpha");
        await new Crypto("correct horse").encrypt(new FileManager(dirPath), { value: 0 }, {});
        fs.rmSync(dirPath, { force: true, recursive: true });
        acquiredDirs.length = 0;

        await expect(
            new Crypto("wrong horse").decrypt(new FileManager(`${dirPath}.ctx`), { value: 0 })
        ).rejects.toThrow();

        expect(acquiredDirs).toHaveLength(1);
        expect(fs.existsSync(acquiredDirs[0])).toBe(false);
    });

    it("rejects when a decrypted directory archive contains traversal entries", async () => {
        // Build a malicious tar in memory and wrap it in a CTX1 file with the
        // directory flag set — exactly the path a hostile archive would take.
        const { pack } = require("tar-stream");
        const tarBuffer = await new Promise((resolve, reject) => {
            const archive = pack();
            const chunks = [];
            archive.on("data", chunk => chunks.push(chunk));
            archive.on("end", () => resolve(Buffer.concat(chunks)));
            archive.on("error", reject);
            archive.entry({ name: "../escape.txt", type: "file" }, "pwned");
            archive.finalize();
        });

        const encryptedPath = path.join(tempDir, "payload.ctx");
        await writeCtx1File(encryptedPath, "correct horse", tarBuffer, {
            flags: Format.FLAG_DIRECTORY,
            metaOverrides: { name: "payload.tar" }
        });

        await expect(
            new Crypto("correct horse").decrypt(new FileManager(encryptedPath), { value: 0 })
        ).rejects.toThrow(/traversal/i);

        expect(fs.existsSync(path.join(tempDir, "escape.txt"))).toBe(false);

        // The rejected operation's temp directory must not be left behind.
        expect(acquiredDirs).toHaveLength(1);
        expect(fs.existsSync(acquiredDirs[0])).toBe(false);
    });
});
