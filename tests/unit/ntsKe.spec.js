import NtsKe from "@main/time/ntsKe.js";

function record(type, body = Buffer.alloc(0)) {
    const buf = Buffer.alloc(4 + body.length);
    buf.writeUInt16BE(type, 0);
    buf.writeUInt16BE(body.length, 2);
    body.copy(buf, 4);
    return buf;
}

function u16(value) {
    const body = Buffer.alloc(2);
    body.writeUInt16BE(value, 0);
    return body;
}

const CRIT = NtsKe.CRITICAL;

function okResponse(extra = []) {
    return Buffer.concat([
        record(CRIT | NtsKe.REC_NEXT_PROTOCOL, u16(NtsKe.PROTOCOL_NTPV4)),
        record(CRIT | NtsKe.REC_AEAD_ALGORITHM, u16(NtsKe.AEAD_AES_SIV_CMAC_256)),
        record(NtsKe.REC_NEW_COOKIE, Buffer.alloc(100, 1)),
        record(NtsKe.REC_NEW_COOKIE, Buffer.alloc(100, 2)),
        ...extra,
        record(CRIT | NtsKe.REC_END_OF_MESSAGE)
    ]);
}

describe("NTS-KE records (RFC 8915 section 4)", () => {
    it("builds the exact request bytes", () => {
        expect(NtsKe.buildKeRequest().equals(Buffer.concat([
            record(CRIT | NtsKe.REC_NEXT_PROTOCOL, u16(0)),
            record(NtsKe.REC_AEAD_ALGORITHM, u16(15)),
            record(CRIT | NtsKe.REC_END_OF_MESSAGE)
        ]))).toBe(true);
    });

    it("parses cookies from a complete response", () => {
        const parsed = NtsKe.parseKeResponse(okResponse());
        expect(parsed.cookies).toHaveLength(2);
        expect(parsed.cookies[0].equals(Buffer.alloc(100, 1))).toBe(true);
        expect(parsed.ntpHost).toBeNull();
        expect(parsed.ntpPort).toBeNull();
    });

    it("honors NTPv4 server and port negotiation records", () => {
        const parsed = NtsKe.parseKeResponse(okResponse([
            record(NtsKe.REC_NTPV4_SERVER, Buffer.from("ntp.example.com", "ascii")),
            record(NtsKe.REC_NTPV4_PORT, u16(1234))
        ]));
        expect(parsed.ntpHost).toBe("ntp.example.com");
        expect(parsed.ntpPort).toBe(1234);
    });

    it("skips unknown non-critical records and warnings", () => {
        const parsed = NtsKe.parseKeResponse(okResponse([
            record(0x4000, Buffer.from("future stuff")),
            record(NtsKe.REC_WARNING, u16(1))
        ]));
        expect(parsed.cookies).toHaveLength(2);
    });

    it("stops parsing at end of message", () => {
        const trailingGarbage = Buffer.concat([okResponse(), Buffer.from("not records")]);
        expect(NtsKe.messageLength(trailingGarbage)).toBe(okResponse().length);
        expect(NtsKe.parseKeResponse(trailingGarbage.slice(0, okResponse().length)).cookies).toHaveLength(2);
    });

    it("reports -1 for a truncated stream", () => {
        expect(NtsKe.messageLength(okResponse().slice(0, 5))).toBe(-1);
    });

    it.each([
        ["an error record", okResponse([record(CRIT | NtsKe.REC_ERROR, u16(1))]), /error/],
        ["an unknown critical record", okResponse([record(CRIT | 0x0099, Buffer.alloc(2))]), /critical/],
        ["a foreign protocol", Buffer.concat([
            record(CRIT | NtsKe.REC_NEXT_PROTOCOL, u16(1)),
            record(CRIT | NtsKe.REC_AEAD_ALGORITHM, u16(15)),
            record(NtsKe.REC_NEW_COOKIE, Buffer.alloc(16)),
            record(CRIT | NtsKe.REC_END_OF_MESSAGE)
        ]), /NTPv4/],
        ["a foreign AEAD", Buffer.concat([
            record(CRIT | NtsKe.REC_NEXT_PROTOCOL, u16(0)),
            record(CRIT | NtsKe.REC_AEAD_ALGORITHM, u16(30)),
            record(NtsKe.REC_NEW_COOKIE, Buffer.alloc(16)),
            record(CRIT | NtsKe.REC_END_OF_MESSAGE)
        ]), /AEAD/],
        ["a missing AEAD negotiation", Buffer.concat([
            record(CRIT | NtsKe.REC_NEXT_PROTOCOL, u16(0)),
            record(NtsKe.REC_NEW_COOKIE, Buffer.alloc(16)),
            record(CRIT | NtsKe.REC_END_OF_MESSAGE)
        ]), /incomplete/],
        ["a cookieless response", Buffer.concat([
            record(CRIT | NtsKe.REC_NEXT_PROTOCOL, u16(0)),
            record(CRIT | NtsKe.REC_AEAD_ALGORITHM, u16(15)),
            record(CRIT | NtsKe.REC_END_OF_MESSAGE)
        ]), /no cookies/],
        ["a truncated record", okResponse().slice(0, 6), /truncated/],
        ["a malformed port record", okResponse([record(NtsKe.REC_NTPV4_PORT, Buffer.alloc(1))]), /port/]
    ])("rejects %s", (label, response, pattern) => {
        expect(() => NtsKe.parseKeResponse(response)).toThrow(pattern);
    });
});
