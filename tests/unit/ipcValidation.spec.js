import { normalizeCryptoPayload, validateExternalUrl } from "@/ipcValidation.js";

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

    it("rejects invalid crypto payloads", () => {
        expect(() => normalizeCryptoPayload({})).toThrow("file path");
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
});
