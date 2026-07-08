import fs from "fs";
import os from "os";
import path from "path";
import {
    assertDecryptSource,
    assertEncryptSource,
    isTrustedSender,
    normalizeAppIconId,
    normalizeCryptoPayload,
    normalizeOpenDialogKind,
    validateDeletePath,
    validateExternalUrl,
    validateOperationId,
    validateOriginalDeletePath
} from "@main/ipcValidation.js";

async function expectCode(promise, code) {
    await expect(promise).rejects.toMatchObject({ name: "IpcValidationError", code });
}

describe("IPC validation", () => {
    it("allows the expected GitHub project URLs", () => {
        expect(validateExternalUrl("https://github.com/sampalest/cryptox/")).toBe("https://github.com/sampalest/cryptox");
    });

    it("rejects unexpected external URLs", () => {
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

    describe("normalizeOpenDialogKind", () => {
        it("accepts the allowlisted kinds and defaults undefined to files", () => {
            expect(normalizeOpenDialogKind("files")).toBe("files");
            expect(normalizeOpenDialogKind("folder")).toBe("folder");
            expect(normalizeOpenDialogKind(undefined)).toBe("files");
        });

        it("returns null for anything outside the allowlist", () => {
            const cases = ["Files", "folders", "openDirectory", "", 42, null, {}, []];
            for (const value of cases) {
                expect(normalizeOpenDialogKind(value)).toBeNull();
            }
        });
    });

    describe("normalizeAppIconId", () => {
        it("accepts the allowlisted icon ids", () => {
            for (const id of ["default", "dark", "clear-light", "clear-dark", "tinted-light", "tinted-dark", "locked"]) {
                expect(normalizeAppIconId(id)).toBe(id);
            }
        });

        it("returns null for anything outside the allowlist", () => {
            // Ids are resolved to bundled file names, so path fragments must
            // never survive normalization.
            const cases = ["Default", "dark.png", "../dark", "appicons/dark", "", 42, null, undefined, {}, []];
            for (const value of cases) {
                expect(normalizeAppIconId(value)).toBeNull();
            }
        });
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
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockasaur-ipc-"));
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

        it("rejects already encrypted .dino and legacy .ctx inputs for encryption", async () => {
            const dinoFile = path.join(tempDir, "secret.dino");
            fs.writeFileSync(dinoFile, "ciphertext");
            const ctxFile = path.join(tempDir, "secret.ctx");
            fs.writeFileSync(ctxFile, "ciphertext");
            const dinoDir = path.join(tempDir, "archive.dino");
            fs.mkdirSync(dinoDir);
            await expectCode(assertEncryptSource(dinoFile), "INVALID_FILE_TYPE");
            await expectCode(assertEncryptSource(ctxFile), "INVALID_FILE_TYPE");
            await expectCode(assertEncryptSource(dinoDir), "INVALID_FILE_TYPE");
        });

        it("accepts only regular .dino and legacy .ctx files for decryption", async () => {
            const dinoFile = path.join(tempDir, "secret.dino");
            fs.writeFileSync(dinoFile, "ciphertext");
            const ctxFile = path.join(tempDir, "secret.ctx");
            fs.writeFileSync(ctxFile, "ciphertext");
            await expect(assertDecryptSource(dinoFile)).resolves.toBeUndefined();
            await expect(assertDecryptSource(ctxFile)).resolves.toBeUndefined();
        });

        it("rejects wrong file types for decryption with INVALID_FILE_TYPE", async () => {
            const plainFile = path.join(tempDir, "plain.txt");
            fs.writeFileSync(plainFile, "hello");
            const dinoDir = path.join(tempDir, "folder.dino");
            fs.mkdirSync(dinoDir);
            await expectCode(assertDecryptSource(plainFile), "INVALID_FILE_TYPE");
            await expectCode(assertDecryptSource(dinoDir), "INVALID_FILE_TYPE");
        });

        it("rejects symlinked sources so a link target is never silently processed (CODE-03)", async () => {
            const realFile = path.join(tempDir, "real.txt");
            fs.writeFileSync(realFile, "hello");
            const realDir = path.join(tempDir, "realdir");
            fs.mkdirSync(realDir);
            const linkToFile = path.join(tempDir, "link.txt");
            const linkToDir = path.join(tempDir, "linkdir");
            fs.symlinkSync(realFile, linkToFile);
            fs.symlinkSync(realDir, linkToDir);
            await expectCode(assertEncryptSource(linkToFile), "INVALID_FILE_TYPE");
            await expectCode(assertEncryptSource(linkToDir), "INVALID_FILE_TYPE");

            const realCtx = path.join(tempDir, "secret.ctx");
            fs.writeFileSync(realCtx, "ciphertext");
            const linkToCtx = path.join(tempDir, "link.ctx");
            fs.symlinkSync(realCtx, linkToCtx);
            await expectCode(assertDecryptSource(linkToCtx), "INVALID_FILE_TYPE");
        });

        it("keeps the user-supplied path out of validation errors", async () => {
            const missing = path.join(tempDir, "missing.txt");
            const error = await assertEncryptSource(missing).then(() => null, e => e);
            expect(error).not.toBeNull();
            expect(error.message).not.toContain(tempDir);
        });
    });

    describe("validateDeletePath", () => {
        it("accepts .dino and legacy .ctx paths", () => {
            expect(validateDeletePath("/tmp/secret.dino")).toBe("/tmp/secret.dino");
            expect(validateDeletePath("/tmp/secret.ctx")).toBe("/tmp/secret.ctx");
        });

        it("rejects paths with any other extension", () => {
            expect(() => validateDeletePath("/tmp/plain.txt")).toThrow("encrypted");
            expect(() => validateDeletePath("/tmp/nodots")).toThrow("encrypted");
            // The extension must terminate the path, not merely appear in it.
            expect(() => validateDeletePath("/tmp/secret.dino.txt")).toThrow("encrypted");
        });

        it("rejects non-string and empty paths", () => {
            for (const value of ["", "   ", 42, null, undefined, {}]) {
                expect(() => validateDeletePath(value)).toThrow();
            }
        });

        it("keeps the user-supplied path out of the error message", () => {
            const error = (() => {
                try {
                    validateDeletePath("/tmp/some-user-path.txt");
                    return null;
                } catch (e) {
                    return e;
                }
            })();
            expect(error).not.toBeNull();
            expect(error.message).not.toContain("some-user-path");
        });
    });

    describe("validateOriginalDeletePath", () => {
        it("accepts only paths recorded in the allowed set", () => {
            const allowed = new Set(["/tmp/original.txt"]);
            expect(validateOriginalDeletePath("/tmp/original.txt", allowed)).toBe("/tmp/original.txt");
        });

        it("rejects paths outside the allowed set, regardless of extension", () => {
            const allowed = new Set(["/tmp/original.txt"]);
            expect(() => validateOriginalDeletePath("/tmp/other.txt", allowed)).toThrow("just-encrypted");
            expect(() => validateOriginalDeletePath("/tmp/original.txt/../original.txt", allowed)).toThrow("just-encrypted");
        });

        it("rejects everything when the allowed set is empty or missing", () => {
            expect(() => validateOriginalDeletePath("/tmp/original.txt", new Set())).toThrow("just-encrypted");
            expect(() => validateOriginalDeletePath("/tmp/original.txt", undefined)).toThrow("just-encrypted");
        });

        it("rejects non-string and empty paths", () => {
            const allowed = new Set([""]);
            for (const value of ["", "   ", 42, null, undefined, {}]) {
                expect(() => validateOriginalDeletePath(value, allowed)).toThrow();
            }
        });

        it("keeps the user-supplied path out of the error message", () => {
            const error = (() => {
                try {
                    validateOriginalDeletePath("/tmp/some-user-path.txt", new Set());
                    return null;
                } catch (e) {
                    return e;
                }
            })();
            expect(error).not.toBeNull();
            expect(error.message).not.toContain("some-user-path");
        });
    });
});
