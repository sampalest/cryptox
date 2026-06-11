import fs from "fs";
import os from "os";
import path from "path";
import {
    assertDecryptSource,
    assertEncryptSource,
    isTrustedSender,
    normalizeCryptoPayload,
    validateExternalUrl,
    validateOperationId
} from "@/ipcValidation.js";

async function expectCode(promise, code) {
    await expect(promise).rejects.toMatchObject({ name: "IpcValidationError", code });
}

describe("IPC validation", () => {
    it("allows the expected GitHub project URLs", () => {
        expect(validateExternalUrl("https://github.com/Samuelpe/cryptox")).toBe("https://github.com/Samuelpe/cryptox");
        expect(validateExternalUrl("https://github.com/sampalest/cryptox/")).toBe("https://github.com/sampalest/cryptox");
    });

    it("rejects unexpected external URLs", () => {
        expect(() => validateExternalUrl("http://github.com/Samuelpe/cryptox")).toThrow("not allowed");
        expect(() => validateExternalUrl("https://example.com")).toThrow("not allowed");
        expect(() => validateExternalUrl("javascript:alert(1)")).toThrow("not allowed");
    });

    it("normalizes valid crypto payloads", () => {
        expect(normalizeCryptoPayload({
            file: { path: "/tmp/example.txt" },
            password: "correct horse",
            operationId: "operation-1"
        })).toEqual({
            filePath: "/tmp/example.txt",
            password: "correct horse",
            operationId: "operation-1"
        });
    });

    it("rejects invalid crypto payloads with INVALID_PAYLOAD", () => {
        expect(() => normalizeCryptoPayload({})).toThrow("file path");
        expect(() => normalizeCryptoPayload({})).toThrow(expect.objectContaining({ code: "INVALID_PAYLOAD" }));
        expect(() => normalizeCryptoPayload({
            file: { path: "/tmp/example.txt" },
            password: "",
            operationId: "operation-1"
        })).toThrow("password");
        expect(() => normalizeCryptoPayload({
            file: { path: "/tmp/example.txt" },
            password: "correct horse",
            operationId: ""
        })).toThrow("operation id");
    });

    describe("validateOperationId", () => {
        it("accepts safe operation ids", () => {
            const uuid = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
            expect(validateOperationId(uuid)).toBe(uuid);
            expect(validateOperationId("op_1-A")).toBe("op_1-A");
            expect(validateOperationId("x".repeat(64))).toBe("x".repeat(64));
        });

        it("rejects unsafe or oversized operation ids", () => {
            const cases = [
                "x".repeat(65),
                `${Date.now()}-/tmp/example.txt`,
                "operation 1",
                "op#1",
                "",
                42,
                null,
                undefined
            ];
            for (const value of cases) {
                expect(() => validateOperationId(value)).toThrow(expect.objectContaining({
                    name: "IpcValidationError",
                    code: "INVALID_PAYLOAD"
                }));
            }
        });
    });

    describe("isTrustedSender", () => {
        const webContents = {};
        const win = { isDestroyed: () => false, webContents };

        it("accepts the app window's own webContents", () => {
            expect(isTrustedSender({ sender: webContents }, win)).toBe(true);
        });

        it("rejects spoofed or unexpected senders", () => {
            expect(isTrustedSender({ sender: {} }, win)).toBe(false);
            expect(isTrustedSender({}, win)).toBe(false);
            expect(isTrustedSender(undefined, win)).toBe(false);
        });

        it("rejects when the window is missing or destroyed", () => {
            expect(isTrustedSender({ sender: webContents }, null)).toBe(false);
            expect(isTrustedSender({ sender: webContents }, { isDestroyed: () => true, webContents })).toBe(false);
        });
    });

    describe("source path validation", () => {
        let tempDir;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cryptox-ipc-"));
        });

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it("rejects missing paths with FILE_NOT_FOUND before any operation starts", async () => {
            const missing = path.join(tempDir, "missing.txt");
            await expectCode(assertEncryptSource(missing), "FILE_NOT_FOUND");
            await expectCode(assertDecryptSource(path.join(tempDir, "missing.ctx")), "FILE_NOT_FOUND");
        });

        it("accepts existing files and directories for encryption", async () => {
            const filePath = path.join(tempDir, "plain.txt");
            fs.writeFileSync(filePath, "hello");
            const dirPath = path.join(tempDir, "folder");
            fs.mkdirSync(dirPath);
            await expect(assertEncryptSource(filePath)).resolves.toBeUndefined();
            await expect(assertEncryptSource(dirPath)).resolves.toBeUndefined();
        });

        it("rejects already encrypted .ctx inputs for encryption", async () => {
            const ctxFile = path.join(tempDir, "secret.ctx");
            fs.writeFileSync(ctxFile, "ciphertext");
            const ctxDir = path.join(tempDir, "archive.ctx");
            fs.mkdirSync(ctxDir);
            await expectCode(assertEncryptSource(ctxFile), "INVALID_FILE_TYPE");
            await expectCode(assertEncryptSource(ctxDir), "INVALID_FILE_TYPE");
        });

        it("accepts only regular .ctx files for decryption", async () => {
            const ctxFile = path.join(tempDir, "secret.ctx");
            fs.writeFileSync(ctxFile, "ciphertext");
            await expect(assertDecryptSource(ctxFile)).resolves.toBeUndefined();
        });

        it("rejects wrong file types for decryption with INVALID_FILE_TYPE", async () => {
            const plainFile = path.join(tempDir, "plain.txt");
            fs.writeFileSync(plainFile, "hello");
            const ctxDir = path.join(tempDir, "folder.ctx");
            fs.mkdirSync(ctxDir);
            await expectCode(assertDecryptSource(plainFile), "INVALID_FILE_TYPE");
            await expectCode(assertDecryptSource(ctxDir), "INVALID_FILE_TYPE");
        });

        it("keeps the user-supplied path out of validation errors", async () => {
            const missing = path.join(tempDir, "missing.txt");
            const error = await assertEncryptSource(missing).then(() => null, e => e);
            expect(error).not.toBeNull();
            expect(error.message).not.toContain(tempDir);
        });
    });
});
