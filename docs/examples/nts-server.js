#!/usr/bin/env node
// Minimal Network Time Security server (RFC 8915), Node.js, no dependencies.
//
// It speaks exactly the exchange documented in docs/time-server.md, so
// Lockasaur (or any RFC 8915 client) can use it as a trusted time source:
//
//   1. NTS-KE over TLS 1.3 (TCP): negotiate NTPv4 + AEAD_AES_SIV_CMAC_256,
//      export the c2s/s2c keys, hand out cookies.
//   2. NTS-protected NTPv4 (UDP): authenticate the request, answer with the
//      current time signed under the s2c key.
//
// Cookies here are the two session keys sealed under a per-run master key, so
// the stateless UDP side can recover them without shared storage. A production
// server would rotate that master key on a schedule and persist it.
//
// Run:
//   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
//     -days 365 -subj "/CN=localhost" \
//     -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
//   node nts-server.js
//
// Lockasaur verifies the certificate against the OS trust store, so pointing
// the app at a real deployment needs a publicly trusted certificate (for
// example from Let's Encrypt) and the KE port reachable on TCP 4460.

import tls from "node:tls";
import dgram from "node:dgram";
import crypto from "node:crypto";
import fs from "node:fs";

const KE_PORT = Number(process.env.NTS_KE_PORT || 4460);
const NTP_PORT = Number(process.env.NTS_NTP_PORT || 4461);
const CERT = process.env.NTS_CERT || "cert.pem";
const KEY = process.env.NTS_KEY || "key.pem";

const MASTER_KEY = crypto.randomBytes(32);

// ---------------------------------------------------------------------------
// AES-SIV-CMAC-256 (RFC 5297) on AES-128 primitives. Node exposes no SIV
// cipher, so S2V/CMAC and CTR are built by hand. The 32-byte key splits into
// K1 (CMAC) and K2 (CTR).
// ---------------------------------------------------------------------------

const BLOCK = 16;
const ZERO = Buffer.alloc(BLOCK);

function dbl(b) {
    const out = Buffer.alloc(BLOCK);
    let carry = 0;
    for (let i = BLOCK - 1; i >= 0; i--) {
        out[i] = ((b[i] << 1) | carry) & 0xff;
        carry = b[i] >>> 7;
    }
    if (carry) out[BLOCK - 1] ^= 0x87;
    return out;
}

function xor(a, b) {
    const out = Buffer.alloc(BLOCK);
    for (let i = 0; i < BLOCK; i++) out[i] = a[i] ^ b[i];
    return out;
}

function ecb(key16, block) {
    const c = crypto.createCipheriv("aes-128-ecb", key16, null);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(block), c.final()]);
}

function cmac(key16, data) {
    const k1 = dbl(ecb(key16, ZERO));
    const k2 = dbl(k1);
    const blocks = Math.max(1, Math.ceil(data.length / BLOCK));
    const whole = data.length > 0 && data.length % BLOCK === 0;
    let last;
    if (whole) {
        last = xor(data.slice((blocks - 1) * BLOCK), k1);
    } else {
        const padded = Buffer.alloc(BLOCK);
        data.copy(padded, 0, (blocks - 1) * BLOCK);
        padded[data.length % BLOCK] = 0x80;
        last = xor(padded, k2);
    }
    let x = ZERO;
    for (let i = 0; i < blocks - 1; i++) x = ecb(key16, xor(x, data.slice(i * BLOCK, (i + 1) * BLOCK)));
    return ecb(key16, xor(x, last));
}

function s2v(key16, strings) {
    if (strings.length === 0) {
        const one = Buffer.alloc(BLOCK);
        one[BLOCK - 1] = 0x01;
        return cmac(key16, one);
    }
    let d = cmac(key16, ZERO);
    for (let i = 0; i < strings.length - 1; i++) d = xor(dbl(d), cmac(key16, strings[i]));
    const last = strings[strings.length - 1];
    let t;
    if (last.length >= BLOCK) {
        t = Buffer.from(last);
        const off = last.length - BLOCK;
        for (let i = 0; i < BLOCK; i++) t[off + i] ^= d[i];
    } else {
        const padded = Buffer.alloc(BLOCK);
        last.copy(padded);
        padded[last.length] = 0x80;
        t = xor(dbl(d), padded);
    }
    return cmac(key16, t);
}

// The CTR IV clears bit 31 of each of the last two 32-bit words (RFC 5297).
function ctrIv(siv) {
    const q = Buffer.from(siv);
    q[8] &= 0x7f;
    q[12] &= 0x7f;
    return q;
}

function ctr(key16, iv, data) {
    const c = crypto.createCipheriv("aes-128-ctr", key16, iv);
    return Buffer.concat([c.update(data), c.final()]);
}

function sivSeal(key32, adList, plaintext) {
    const siv = s2v(key32.slice(0, BLOCK), [...adList, plaintext]);
    return Buffer.concat([siv, ctr(key32.slice(BLOCK), ctrIv(siv), plaintext)]);
}

function sivOpen(key32, adList, sealed) {
    if (sealed.length < BLOCK) return null;
    const siv = sealed.slice(0, BLOCK);
    const plaintext = ctr(key32.slice(BLOCK), ctrIv(siv), sealed.slice(BLOCK));
    const expected = s2v(key32.slice(0, BLOCK), [...adList, plaintext]);
    return crypto.timingSafeEqual(expected, siv) ? plaintext : null;
}

// ---------------------------------------------------------------------------
// Cookies: AES-256-GCM(masterKey) over c2s||s2c. Layout nonce(12) | tag(16) | ct.
// ---------------------------------------------------------------------------

function sealCookie(c2s, s2c) {
    const nonce = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", MASTER_KEY, nonce);
    const ct = Buffer.concat([c.update(Buffer.concat([c2s, s2c])), c.final()]);
    return Buffer.concat([nonce, c.getAuthTag(), ct]);
}

function openCookie(cookie) {
    if (cookie.length !== 12 + 16 + 64) return null;
    try {
        const d = crypto.createDecipheriv("aes-256-gcm", MASTER_KEY, cookie.slice(0, 12));
        d.setAuthTag(cookie.slice(12, 28));
        const keys = Buffer.concat([d.update(cookie.slice(28)), d.final()]);
        return { c2s: keys.slice(0, 32), s2c: keys.slice(32, 64) };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// NTS-KE (TLS 1.3, ALPN ntske/1).
// ---------------------------------------------------------------------------

const CRITICAL = 0x8000;
const REC_EOM = 0;
const REC_NEXT_PROTOCOL = 1;
const REC_AEAD = 4;
const REC_COOKIE = 5;
const REC_NTP_PORT = 7;
const PROTO_NTPV4 = 0;
const AEAD_AES_SIV_CMAC_256 = 15;

const EXPORTER_LABEL = "EXPORTER-network-time-security";
const KEY_LEN = 32;

function record(type, body) {
    const buf = Buffer.alloc(4 + body.length);
    buf.writeUInt16BE(type, 0);
    buf.writeUInt16BE(body.length, 2);
    body.copy(buf, 4);
    return buf;
}

function u16(value) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(value, 0);
    return b;
}

// Both keys derive from the TLS session: 5-byte context is protocol | AEAD |
// direction (0x00 client-to-server, 0x01 server-to-client).
function exportKey(socket, direction) {
    const ctx = Buffer.alloc(5);
    ctx.writeUInt16BE(PROTO_NTPV4, 0);
    ctx.writeUInt16BE(AEAD_AES_SIV_CMAC_256, 2);
    ctx.writeUInt8(direction, 4);
    return socket.exportKeyingMaterial(KEY_LEN, EXPORTER_LABEL, ctx);
}

// True once the accumulated request contains an End of Message record.
function requestComplete(buf) {
    let offset = 0;
    for (;;) {
        if (offset + 4 > buf.length) return false;
        const type = buf.readUInt16BE(offset) & ~CRITICAL;
        const bodyLen = buf.readUInt16BE(offset + 2);
        if (offset + 4 + bodyLen > buf.length) return false;
        offset += 4 + bodyLen;
        if (type === REC_EOM) return true;
    }
}

function buildKeResponse(cookies) {
    const parts = [
        record(CRITICAL | REC_NEXT_PROTOCOL, u16(PROTO_NTPV4)),
        record(REC_AEAD, u16(AEAD_AES_SIV_CMAC_256)),
        record(REC_NTP_PORT, u16(NTP_PORT))
    ];
    for (const cookie of cookies) parts.push(record(REC_COOKIE, cookie));
    parts.push(record(CRITICAL | REC_EOM, Buffer.alloc(0)));
    return Buffer.concat(parts);
}

const keServer = tls.createServer(
    {
        cert: fs.readFileSync(CERT),
        key: fs.readFileSync(KEY),
        minVersion: "TLSv1.3",
        ALPNProtocols: ["ntske/1"]
    },
    (socket) => {
        socket.on("error", () => {});
        if (socket.alpnProtocol !== "ntske/1") {
            socket.destroy();
            return;
        }
        const chunks = [];
        socket.on("data", (chunk) => {
            chunks.push(chunk);
            const buf = Buffer.concat(chunks);
            if (buf.length > 4096 || !requestComplete(buf)) return;
            const c2s = exportKey(socket, 0x00);
            const s2c = exportKey(socket, 0x01);
            const cookies = [sealCookie(c2s, s2c), sealCookie(c2s, s2c)];
            socket.end(buildKeResponse(cookies));
        });
    }
);

// ---------------------------------------------------------------------------
// NTS-protected NTPv4 (UDP).
// ---------------------------------------------------------------------------

const NTP_HEADER_LEN = 48;
const ORIGIN_OFFSET = 24;
const XMT_OFFSET = 40;
const EF_UNIQUE_ID = 0x0104;
const EF_COOKIE = 0x0204;
const EF_AUTHENTICATOR = 0x0404;
const NTP_UNIX_OFFSET = 2208988800;

function extensionField(type, body, minBody = 0) {
    const padded = Math.max(body.length, minBody);
    const total = 4 + padded + ((4 - ((4 + padded) % 4)) % 4);
    const buf = Buffer.alloc(total);
    buf.writeUInt16BE(type, 0);
    buf.writeUInt16BE(total, 2);
    body.copy(buf, 4);
    return buf;
}

function ntpTimestamp() {
    const ms = Date.now();
    const seconds = Math.floor(ms / 1000) + NTP_UNIX_OFFSET;
    const fraction = Math.floor(((ms % 1000) / 1000) * 4294967296);
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(seconds >>> 0, 0);
    buf.writeUInt32BE(fraction >>> 0, 4);
    return buf;
}

// Collect the extension fields the request carries, stopping at the
// authenticator (everything before it is the authenticated associated data).
function readRequest(buf) {
    const out = { authStart: -1 };
    let offset = NTP_HEADER_LEN;
    while (offset + 4 <= buf.length) {
        const type = buf.readUInt16BE(offset);
        const total = buf.readUInt16BE(offset + 2);
        if (total < 4 || total % 4 !== 0 || offset + total > buf.length) break;
        const body = buf.slice(offset + 4, offset + total);
        if (type === EF_UNIQUE_ID) {
            out.uniqueId = body.slice(0, 32);
        } else if (type === EF_COOKIE) {
            out.cookie = body;
        } else if (type === EF_AUTHENTICATOR) {
            const nonceLen = body.readUInt16BE(0);
            const cipherLen = body.readUInt16BE(2);
            out.authStart = offset;
            out.nonce = body.slice(4, 4 + nonceLen);
            out.sealed = body.slice(4 + nonceLen, 4 + nonceLen + cipherLen);
            break;
        }
        offset += total;
    }
    return out;
}

function handleNtp(req) {
    if (req.length < NTP_HEADER_LEN) return null;
    const parsed = readRequest(req);
    if (!parsed.uniqueId || !parsed.cookie || parsed.authStart < 0) return null;

    const keys = openCookie(parsed.cookie);
    if (!keys) return null;

    const associated = req.slice(0, parsed.authStart);
    if (sivOpen(keys.c2s, [associated, parsed.nonce], parsed.sealed) === null) return null;

    const header = Buffer.alloc(NTP_HEADER_LEN);
    header.writeUInt8(0x24, 0); // LI 0, VN 4, mode 4 (server)
    header.writeUInt8(1, 1); // stratum 1 (primary reference)
    header.writeInt8(-23, 3); // precision, roughly one microsecond
    header.write("LOCL", 12, "ascii"); // reference identifier
    req.copy(header, ORIGIN_OFFSET, XMT_OFFSET, XMT_OFFSET + 8); // echo client transmit as origin
    ntpTimestamp().copy(header, 32); // receive
    const now = ntpTimestamp();
    now.copy(header, 16); // reference
    now.copy(header, XMT_OFFSET); // transmit: this is the time verdict the client reads

    const idField = extensionField(EF_UNIQUE_ID, parsed.uniqueId);
    const preceding = Buffer.concat([header, idField]);
    const nonce = crypto.randomBytes(16);
    const sealed = sivSeal(keys.s2c, [preceding, nonce], Buffer.alloc(0));
    const authBody = Buffer.alloc(4 + nonce.length + sealed.length);
    authBody.writeUInt16BE(nonce.length, 0);
    authBody.writeUInt16BE(sealed.length, 2);
    nonce.copy(authBody, 4);
    sealed.copy(authBody, 4 + nonce.length);
    return Buffer.concat([preceding, extensionField(EF_AUTHENTICATOR, authBody, 24)]);
}

const ntpServer = dgram.createSocket("udp4");
ntpServer.on("message", (msg, rinfo) => {
    const response = handleNtp(msg);
    if (response) ntpServer.send(response, rinfo.port, rinfo.address);
});

keServer.listen(KE_PORT, () => console.log(`NTS-KE on tcp/${KE_PORT}`));
ntpServer.bind(NTP_PORT, () => console.log(`NTS-NTP on udp/${NTP_PORT}`));
