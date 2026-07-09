import crypto from "node:crypto";
import dgram from "node:dgram";
import Siv from "./aesSiv.js";
import NtsKe from "./ntsKe.js";

// NTS-protected NTPv4 (RFC 8915 section 5): one UDP request/response pair,
// authenticated with the keys exported by ntsKe.js. Packet build/parse are pure,
// so tests need no socket.

const NTP_HEADER_LEN = 48;
const XMT_OFFSET = 40;
const ORIGIN_OFFSET = 24;

const EF_UNIQUE_IDENTIFIER = 0x0104;
const EF_NTS_COOKIE = 0x0204;
const EF_AUTHENTICATOR = 0x0404;

const UNIQUE_ID_LEN = 32;
const NONCE_LEN = 16;
const MAX_PACKET = 65536;
const DEFAULT_TIMEOUT_MS = 3000;

// Seconds between the NTP epoch (1900-01-01) and the Unix epoch (1970-01-01),
// and the length of one 32-bit NTP era.
const NTP_UNIX_OFFSET = 2208988800n;
const NTP_ERA_SECONDS = 4294967296n;

class NtsPacketError extends Error {
    constructor(message) {
        super(message);
        this.name = "NtsPacketError";
    }
}

function extensionField(type, body, minBodyLen = 0) {
    const padded = Math.max(body.length, minBodyLen);
    const total = 4 + padded + ((4 - ((4 + padded) % 4)) % 4);
    const buf = Buffer.alloc(total);
    buf.writeUInt16BE(type, 0);
    buf.writeUInt16BE(total, 2);
    body.copy(buf, 4);
    return buf;
}

// Build one NTS-protected NTPv4 client packet, returning { packet, uniqueId,
// transmitTimestamp }. The SIV associated data is every packet byte preceding
// the authenticator EF, with the nonce as the final S2V component (RFC 5297
// nonce mode); the same nonce goes into the EF body (RFC 8915 section 5.6).
function buildNtsRequest({ cookie, c2sKey }) {
    const header = Buffer.alloc(NTP_HEADER_LEN);
    header.writeUInt8(0x23, 0); // LI 0, VN 4, mode 3 (client)
    // Random transmit timestamp: it only needs to be echoed back, and a real
    // clock value would fingerprint the host.
    const transmitTimestamp = crypto.randomBytes(8);
    transmitTimestamp.copy(header, XMT_OFFSET);
    const uniqueId = crypto.randomBytes(UNIQUE_ID_LEN);
    const authenticated = Buffer.concat([
        header,
        extensionField(EF_UNIQUE_IDENTIFIER, uniqueId),
        extensionField(EF_NTS_COOKIE, cookie)
    ]);
    const nonce = crypto.randomBytes(NONCE_LEN);
    const sealed = Siv.sivSeal(c2sKey, [authenticated, nonce], Buffer.alloc(0));
    const authBody = Buffer.alloc(4 + nonce.length + sealed.length);
    authBody.writeUInt16BE(nonce.length, 0);
    authBody.writeUInt16BE(sealed.length, 2);
    nonce.copy(authBody, 4);
    sealed.copy(authBody, 4 + nonce.length);
    const packet = Buffer.concat([authenticated, extensionField(EF_AUTHENTICATOR, authBody, 24)]);
    return { packet, uniqueId, transmitTimestamp };
}

// Verify one NTS-protected NTPv4 response and read its transmit timestamp,
// returning { seconds, fraction }.
function parseNtsResponse(buf, { uniqueId, s2cKey, transmitTimestamp }) {
    if (!Buffer.isBuffer(buf) || buf.length < NTP_HEADER_LEN) throw new NtsPacketError("short NTP response");
    if ((buf.readUInt8(0) & 0x07) !== 4) throw new NtsPacketError("not a server-mode response");
    const stratum = buf.readUInt8(1);
    if (stratum === 0) throw new NtsPacketError("kiss-of-death response");
    if (!buf.slice(ORIGIN_OFFSET, ORIGIN_OFFSET + 8).equals(transmitTimestamp)) {
        throw new NtsPacketError("origin timestamp mismatch");
    }
    let offset = NTP_HEADER_LEN;
    let sawUniqueId = false;
    let authenticated = false;
    while (offset + 4 <= buf.length) {
        const type = buf.readUInt16BE(offset);
        const total = buf.readUInt16BE(offset + 2);
        if (total < 4 || total % 4 !== 0 || offset + total > buf.length) throw new NtsPacketError("malformed extension field");
        const body = buf.slice(offset + 4, offset + total);
        if (type === EF_UNIQUE_IDENTIFIER) {
            if (body.length < UNIQUE_ID_LEN || !body.slice(0, UNIQUE_ID_LEN).equals(uniqueId)) {
                throw new NtsPacketError("unique identifier mismatch");
            }
            sawUniqueId = true;
        } else if (type === EF_AUTHENTICATOR) {
            if (body.length < 4) throw new NtsPacketError("malformed authenticator");
            const nonceLen = body.readUInt16BE(0);
            const cipherLen = body.readUInt16BE(2);
            if (4 + nonceLen + cipherLen > body.length) throw new NtsPacketError("malformed authenticator");
            const nonce = body.slice(4, 4 + nonceLen);
            const sealed = body.slice(4 + nonceLen, 4 + nonceLen + cipherLen);
            const preceding = buf.slice(0, offset);
            if (Siv.sivOpen(s2cKey, [preceding, nonce], sealed) === null) {
                throw new NtsPacketError("authenticator verification failed");
            }
            authenticated = true;
            // Everything after an authenticated authenticator EF is unprotected.
            break;
        }
        offset += total;
    }
    if (!sawUniqueId || !authenticated) throw new NtsPacketError("response not authenticated");
    return {
        seconds: BigInt(buf.readUInt32BE(XMT_OFFSET)),
        fraction: buf.readUInt32BE(XMT_OFFSET + 4)
    };
}

// Convert an NTP timestamp to Unix epoch ms, picking the 136-year era nearest
// pivotMs. NTP carries no era number, so a system clock off by more than ~68
// years defeats disambiguation; callers bound the result.
function ntpToEpochMs(seconds, fraction, pivotMs) {
    const fractionMs = Math.round((fraction / 4294967296) * 1000);
    const pivotNtpSeconds = BigInt(Math.floor(pivotMs / 1000)) + NTP_UNIX_OFFSET;
    const eraGuess = pivotNtpSeconds / NTP_ERA_SECONDS;
    let best = null;
    for (const era of [eraGuess - 1n, eraGuess, eraGuess + 1n]) {
        if (era < 0n) continue;
        const epochMs = Number((era * NTP_ERA_SECONDS + seconds - NTP_UNIX_OFFSET) * 1000n) + fractionMs;
        if (best === null || Math.abs(epochMs - pivotMs) < Math.abs(best - pivotMs)) best = epochMs;
    }
    return best;
}

function exchangeUdp({ host, port, packet, timeoutMs }) {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket("udp4");
        let settled = false;
        const finish = (error, response) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.close();
            if (error) reject(error); else resolve(response);
        };
        const timer = setTimeout(() => finish(new NtsPacketError("NTP exchange timed out")), timeoutMs);
        socket.on("error", (error) => finish(error));
        socket.on("message", (message) => {
            if (message.length <= MAX_PACKET) finish(null, message);
        });
        socket.send(packet, port, host, (error) => {
            if (error) finish(error);
        });
    });
}

// Fetch the current time from an NTS server: one KE exchange, then one
// authenticated NTPv4 exchange (single retry on timeout). Resolves { nowMs }.
async function queryNtsTime({ host, port, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const ke = await NtsKe.performKe({ host, port, timeoutMs: timeoutMs + 2000 });
    let lastError = null;
    for (let attempt = 0; attempt < 2 && attempt < ke.cookies.length; attempt++) {
        const request = buildNtsRequest({ cookie: ke.cookies[attempt], c2sKey: ke.c2sKey });
        try {
            const response = await exchangeUdp({ host: ke.ntpHost, port: ke.ntpPort, packet: request.packet, timeoutMs });
            const { seconds, fraction } = parseNtsResponse(response, {
                uniqueId: request.uniqueId,
                s2cKey: ke.s2cKey,
                transmitTimestamp: request.transmitTimestamp
            });
            return { nowMs: ntpToEpochMs(seconds, fraction, Date.now()) };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new NtsPacketError("NTS exchange failed");
}

export default {
    EF_UNIQUE_IDENTIFIER,
    EF_NTS_COOKIE,
    EF_AUTHENTICATOR,
    NTP_HEADER_LEN,
    XMT_OFFSET,
    NtsPacketError,
    extensionField,
    buildNtsRequest,
    parseNtsResponse,
    ntpToEpochMs,
    queryNtsTime
};
