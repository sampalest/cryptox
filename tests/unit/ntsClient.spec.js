import crypto from "crypto";
import NtsClient from "@main/time/ntsClient.js";
import Siv from "@main/time/aesSiv.js";

const C2S_KEY = Buffer.alloc(32, 3);
const S2C_KEY = Buffer.alloc(32, 4);
const COOKIE = Buffer.alloc(100, 9);

// Mirror of the server side of the exchange, built independently from the
// client code path so both directions of the AD construction are exercised.
function buildServerResponse(request, { seconds = 3992588800n, fraction = 0, stratum = 2, mode = 4, origin, uniqueId } = {}) {
    const header = Buffer.alloc(48);
    header.writeUInt8(0x20 | mode, 0);
    header.writeUInt8(stratum, 1);
    (origin || request.transmitTimestamp).copy(header, 24);
    header.writeUInt32BE(Number(seconds), 40);
    header.writeUInt32BE(fraction, 44);
    const authenticated = Buffer.concat([
        header,
        NtsClient.extensionField(NtsClient.EF_UNIQUE_IDENTIFIER, uniqueId || request.uniqueId)
    ]);
    const nonce = crypto.randomBytes(16);
    const sealed = Siv.sivSeal(S2C_KEY, [authenticated, nonce], Buffer.alloc(0));
    const body = Buffer.alloc(4 + nonce.length + sealed.length);
    body.writeUInt16BE(nonce.length, 0);
    body.writeUInt16BE(sealed.length, 2);
    nonce.copy(body, 4);
    sealed.copy(body, 4 + nonce.length);
    return Buffer.concat([authenticated, NtsClient.extensionField(NtsClient.EF_AUTHENTICATOR, body, 24)]);
}

describe("NTS-protected NTPv4 packets (RFC 8915 section 5)", () => {
    it("builds a client packet with the three extension fields, word-aligned", () => {
        const request = NtsClient.buildNtsRequest({ cookie: COOKIE, c2sKey: C2S_KEY });
        const packet = request.packet;

        expect(packet.readUInt8(0)).toBe(0x23);
        expect(packet.slice(NtsClient.XMT_OFFSET, NtsClient.XMT_OFFSET + 8).equals(request.transmitTimestamp)).toBe(true);
        expect(packet.length % 4).toBe(0);

        const fields = [];
        let offset = NtsClient.NTP_HEADER_LEN;
        while (offset < packet.length) {
            const type = packet.readUInt16BE(offset);
            const total = packet.readUInt16BE(offset + 2);
            expect(total % 4).toBe(0);
            fields.push({ type, body: packet.slice(offset + 4, offset + total), offset });
            offset += total;
        }
        expect(fields.map(field => field.type)).toEqual([
            NtsClient.EF_UNIQUE_IDENTIFIER,
            NtsClient.EF_NTS_COOKIE,
            NtsClient.EF_AUTHENTICATOR
        ]);
        expect(fields[0].body.slice(0, 32).equals(request.uniqueId)).toBe(true);
        expect(fields[1].body.slice(0, COOKIE.length).equals(COOKIE)).toBe(true);

        // The authenticator must verify with the c2s key over every packet
        // byte preceding it, with the serialized nonce as the final ad.
        const auth = fields[2];
        const nonceLen = auth.body.readUInt16BE(0);
        const cipherLen = auth.body.readUInt16BE(2);
        const nonce = auth.body.slice(4, 4 + nonceLen);
        const sealed = auth.body.slice(4 + nonceLen, 4 + nonceLen + cipherLen);
        const preceding = packet.slice(0, auth.offset);
        expect(Siv.sivOpen(C2S_KEY, [preceding, nonce], sealed)).not.toBeNull();
        expect(Siv.sivOpen(C2S_KEY, [preceding.slice(1), nonce], sealed)).toBeNull();
    });

    it("uses a fresh unique id, nonce and transmit timestamp per packet", () => {
        const first = NtsClient.buildNtsRequest({ cookie: COOKIE, c2sKey: C2S_KEY });
        const second = NtsClient.buildNtsRequest({ cookie: COOKIE, c2sKey: C2S_KEY });
        expect(first.uniqueId.equals(second.uniqueId)).toBe(false);
        expect(first.transmitTimestamp.equals(second.transmitTimestamp)).toBe(false);
        expect(first.packet.equals(second.packet)).toBe(false);
    });

    it("parses a valid authenticated response", () => {
        const request = NtsClient.buildNtsRequest({ cookie: COOKIE, c2sKey: C2S_KEY });
        const response = buildServerResponse(request, { seconds: 3992588800n, fraction: 0x80000000 });
        const parsed = NtsClient.parseNtsResponse(response, {
            uniqueId: request.uniqueId,
            s2cKey: S2C_KEY,
            transmitTimestamp: request.transmitTimestamp
        });
        expect(parsed.seconds).toBe(3992588800n);
        expect(parsed.fraction).toBe(0x80000000);
    });

    it.each([
        ["a client-mode packet", { mode: 3 }, /server-mode/],
        ["a kiss-of-death (stratum 0)", { stratum: 0 }, /kiss-of-death/],
        ["an origin timestamp mismatch", { origin: Buffer.alloc(8, 0xaa) }, /origin/],
        ["a foreign unique identifier", { uniqueId: Buffer.alloc(32, 0xbb) }, /unique identifier/]
    ])("rejects %s", (label, overrides, pattern) => {
        const request = NtsClient.buildNtsRequest({ cookie: COOKIE, c2sKey: C2S_KEY });
        const response = buildServerResponse(request, overrides);
        expect(() => NtsClient.parseNtsResponse(response, {
            uniqueId: request.uniqueId,
            s2cKey: S2C_KEY,
            transmitTimestamp: request.transmitTimestamp
        })).toThrow(pattern);
    });

    it("rejects a response whose authenticator fails to verify", () => {
        const request = NtsClient.buildNtsRequest({ cookie: COOKIE, c2sKey: C2S_KEY });
        const response = buildServerResponse(request);
        response[NtsClient.XMT_OFFSET] ^= 0x01;
        // Restore parse preconditions broken by the flip: only the SIV check
        // may reject this, so flip a byte covered by the ad but not by the
        // origin/unique-id equality checks.
        expect(() => NtsClient.parseNtsResponse(response, {
            uniqueId: request.uniqueId,
            s2cKey: S2C_KEY,
            transmitTimestamp: request.transmitTimestamp
        })).toThrow(/verification failed/);
    });

    it("rejects a response with no authenticator at all", () => {
        const request = NtsClient.buildNtsRequest({ cookie: COOKIE, c2sKey: C2S_KEY });
        const header = Buffer.alloc(48);
        header.writeUInt8(0x24, 0);
        header.writeUInt8(2, 1);
        request.transmitTimestamp.copy(header, 24);
        const response = Buffer.concat([header, NtsClient.extensionField(NtsClient.EF_UNIQUE_IDENTIFIER, request.uniqueId)]);
        expect(() => NtsClient.parseNtsResponse(response, {
            uniqueId: request.uniqueId,
            s2cKey: S2C_KEY,
            transmitTimestamp: request.transmitTimestamp
        })).toThrow(/not authenticated/);
    });

    it("rejects malformed extension field lengths", () => {
        const request = NtsClient.buildNtsRequest({ cookie: COOKIE, c2sKey: C2S_KEY });
        const response = buildServerResponse(request);
        response.writeUInt16BE(0x7fff, NtsClient.NTP_HEADER_LEN + 2);
        expect(() => NtsClient.parseNtsResponse(response, {
            uniqueId: request.uniqueId,
            s2cKey: S2C_KEY,
            transmitTimestamp: request.transmitTimestamp
        })).toThrow(/malformed extension/);
    });

    describe("ntpToEpochMs era handling", () => {
        // NTP era 0 ends 2036-02-07T06:28:16Z; era 1 starts at Unix epoch ms:
        const ERA1_START_MS = (4294967296 - 2208988800) * 1000;

        it("converts an era-0 timestamp with a current pivot", () => {
            expect(NtsClient.ntpToEpochMs(3992588800n, 0, 1783600000000)).toBe(1783600000000);
        });

        it("converts the fraction to milliseconds", () => {
            expect(NtsClient.ntpToEpochMs(3992588800n, 0x80000000, 1783600000000)).toBe(1783600000500);
        });

        it("selects era 1 for a wrapped timestamp with a post-2036 pivot", () => {
            expect(NtsClient.ntpToEpochMs(0n, 0, ERA1_START_MS + 60000)).toBe(ERA1_START_MS);
        });

        it("selects era 1 even when the pivot sits just before the wrap", () => {
            expect(NtsClient.ntpToEpochMs(0n, 0, ERA1_START_MS - 60000)).toBe(ERA1_START_MS);
        });

        it("keeps a late era-0 timestamp in era 0 with a pre-2036 pivot", () => {
            const lateEra0Ms = (4294967295 - 2208988800) * 1000;
            expect(NtsClient.ntpToEpochMs(4294967295n, 0, lateEra0Ms - 60000)).toBe(lateEra0Ms);
        });
    });
});
