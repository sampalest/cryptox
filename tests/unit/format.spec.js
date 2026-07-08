import Format from "@main/format.js";

/**
 * A valid CTX1 metadata object; individual fields are overridden per test.
 */
function validMeta(overrides = {}) {
    return Object.assign({
        alg: "aes-256-gcm",
        kdf: "argon2id",
        salt: Buffer.alloc(16, 7).toString("base64"),
        opslimit: 2,
        memlimit: 67108864,
        keyLen: 32,
        name: "sample.txt"
    }, overrides);
}

/**
 * Hand-craft a raw CTX1 header so the parser can be fed inputs the production
 * writer refuses to emit (bad version, lying headerLen, malformed JSON, ...).
 */
function rawHeader(metaObj, { version = 1, flags = 0, headerLen, json } = {}) {
    const jsonBuf = json !== undefined ? Buffer.from(json, "utf-8") : Buffer.from(JSON.stringify(metaObj), "utf-8");
    const prefix = Buffer.alloc(8);
    prefix.write("CTX1", 0, "utf-8");
    prefix.writeUInt8(version, 4);
    prefix.writeUInt8(flags, 5);
    prefix.writeUInt16BE(headerLen !== undefined ? headerLen : jsonBuf.length, 6);
    return Buffer.concat([prefix, jsonBuf]);
}

// A file size that always satisfies the "header + IV + tag must fit" check.
const bigFile = (header) => header.length + Format.IV_LEN + Format.TAG_LEN;

describe("Format (CTX1 header parser/writer)", () => {
    it("round-trips a header through build and parse", () => {
        const meta = validMeta();
        const header = Format.buildHeaderV1(meta, Format.FLAG_DIRECTORY);
        const parsed = Format.parseHeaderV1(header, bigFile(header));

        expect(parsed.flags).toBe(Format.FLAG_DIRECTORY);
        expect(parsed.headerLen).toBe(header.length - Format.PREFIX_LEN_V1);
        expect(parsed.meta).toEqual(meta);
        expect(parsed.headerBytes.equals(header)).toBe(true);
    });

    describe("buildHeaderV1 rejections", () => {
        const cases = [
            ["traversal name", validMeta({ name: "../evil.txt" }), 0],
            ["name with slash", validMeta({ name: "a/b.txt" }), 0],
            ["name with backslash", validMeta({ name: "a\\b.txt" }), 0],
            ["empty name", validMeta({ name: "" }), 0],
            ["dot name", validMeta({ name: "." }), 0],
            ["dot-dot name", validMeta({ name: ".." }), 0],
            ["overlong name", validMeta({ name: "x".repeat(256) }), 0],
            ["control char in name", validMeta({ name: "bad\u0000name" }), 0],
            ["non-string name", validMeta({ name: 42 }), 0],
            ["wrong algorithm", validMeta({ alg: "aes-128-gcm" }), 0],
            ["wrong kdf", validMeta({ kdf: "scrypt" }), 0],
            ["opslimit too low", validMeta({ opslimit: 0 }), 0],
            ["opslimit too high", validMeta({ opslimit: 5 }), 0],
            ["non-integer opslimit", validMeta({ opslimit: "3" }), 0],
            ["memlimit too low", validMeta({ memlimit: 4096 }), 0],
            ["memlimit too high", validMeta({ memlimit: 2147483648 }), 0],
            ["wrong keyLen", validMeta({ keyLen: 16 }), 0],
            ["short salt", validMeta({ salt: Buffer.alloc(8).toString("base64") }), 0],
            ["unknown flag bits", validMeta(), 0x02],
            ["oversized header", validMeta({ pad: "x".repeat(5000) }), 0]
        ];

        it.each(cases)("rejects %s", (label, meta, flags) => {
            expect(() => Format.buildHeaderV1(meta, flags)).toThrow(Format.FormatError);
        });
    });

    describe("Argon2id memory ceiling", () => {
        // The clamp ceiling is libsodium's MODERATE preset (256 MiB), exactly
        // what the encrypt path writes. A crafted header asking for more is
        // rejected before the KDF runs.
        const MEMLIMIT_MAX = 268435456;

        it("accepts memlimit at the 256 MiB ceiling", () => {
            const meta = validMeta({ memlimit: MEMLIMIT_MAX });
            expect(() => Format.buildHeaderV1(meta, 0)).not.toThrow();
        });

        it("rejects memlimit one byte above the ceiling", () => {
            const meta = validMeta({ memlimit: MEMLIMIT_MAX + 1 });
            expect(() => Format.buildHeaderV1(meta, 0)).toThrow(Format.FormatError);
            const header = rawHeader(meta);
            expect(() => Format.parseHeaderV1(header, bigFile(header))).toThrow(Format.FormatError);
        });
    });

    describe("parseHeaderV1 rejections", () => {
        it("rejects a wrong magic", () => {
            const header = Format.buildHeaderV1(validMeta(), 0);
            header.write("NOPE", 0, "utf-8");
            expect(() => Format.parseHeaderV1(header, bigFile(header))).toThrow(/magic/);
        });

        it("rejects an unsupported version instead of falling through", () => {
            const header = rawHeader(validMeta(), { version: 2 });
            expect(() => Format.parseHeaderV1(header, bigFile(header))).toThrow(/unsupported format version/);
        });

        it("rejects unknown flag bits", () => {
            const header = rawHeader(validMeta(), { flags: 0x80 });
            expect(() => Format.parseHeaderV1(header, bigFile(header))).toThrow(/flag/);
        });

        it("rejects an oversized header length", () => {
            const header = rawHeader(validMeta(), { headerLen: Format.MAX_HEADER_JSON + 1 });
            expect(() => Format.parseHeaderV1(header, 1 << 20)).toThrow(/header length/);
        });

        it("rejects a header length pointing past the buffer", () => {
            const header = rawHeader(validMeta(), { headerLen: 4000 });
            expect(() => Format.parseHeaderV1(header, 1 << 20)).toThrow(/truncated/);
        });

        it("rejects a file too small to hold the payload", () => {
            const header = Format.buildHeaderV1(validMeta(), 0);
            expect(() => Format.parseHeaderV1(header, header.length + 8)).toThrow(/too short/);
        });

        it("rejects malformed JSON", () => {
            const header = rawHeader(null, { json: "{definitely not json" });
            expect(() => Format.parseHeaderV1(header, bigFile(header))).toThrow(/JSON/);
        });

        it("rejects a JSON array", () => {
            const header = rawHeader(null, { json: "[1,2]" });
            expect(() => Format.parseHeaderV1(header, bigFile(header))).toThrow(Format.FormatError);
        });

        it.each([
            ["missing alg", { alg: undefined }],
            ["missing kdf", { kdf: undefined }],
            ["missing salt", { salt: undefined }],
            ["missing name", { name: undefined }],
            ["traversal name", { name: "../../evil" }],
            ["huge memlimit", { memlimit: 2147483648 }]
        ])("rejects header with %s", (label, overrides) => {
            const header = rawHeader(validMeta(overrides));
            expect(() => Format.parseHeaderV1(header, bigFile(header))).toThrow(Format.FormatError);
        });
    });

    describe("detectFormat", () => {
        it("detects CTX1", () => {
            const header = Format.buildHeaderV1(validMeta(), 0);
            expect(Format.detectFormat(header.slice(0, 9))).toBe("ctx1");
        });

        it("detects the interim CTXBOX format", () => {
            expect(Format.detectFormat(Buffer.from("CTXBOX   "))).toBe("ctxbox");
        });

        it("treats anything else as legacy", () => {
            expect(Format.detectFormat(Buffer.alloc(9, 0xaa))).toBe("legacy");
        });

        it("treats short files as legacy", () => {
            expect(Format.detectFormat(Buffer.from("CT"))).toBe("legacy");
        });
    });
});
