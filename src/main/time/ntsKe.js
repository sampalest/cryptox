import net from "node:net";
import tls from "node:tls";

// NTS Key Establishment (RFC 8915 section 4): a short TLS 1.3 exchange that
// negotiates NTPv4 + AEAD_AES_SIV_CMAC_256, hands out cookies and exports the
// c2s/s2c packet keys from the TLS session. Record building and parsing are
// pure functions so tests cover them without a socket.

const CRITICAL = 0x8000;
const REC_END_OF_MESSAGE = 0;
const REC_NEXT_PROTOCOL = 1;
const REC_ERROR = 2;
const REC_WARNING = 3;
const REC_AEAD_ALGORITHM = 4;
const REC_NEW_COOKIE = 5;
const REC_NTPV4_SERVER = 6;
const REC_NTPV4_PORT = 7;

const PROTOCOL_NTPV4 = 0;
const AEAD_AES_SIV_CMAC_256 = 15;

const EXPORTER_LABEL = "EXPORTER-network-time-security";
const KEY_LEN = 32;
const MAX_RESPONSE = 65536;
const DEFAULT_TIMEOUT_MS = 5000;

class NtsKeError extends Error {
    constructor(message) {
        super(message);
        this.name = "NtsKeError";
    }
}

function record(type, body) {
    const buf = Buffer.alloc(4 + body.length);
    buf.writeUInt16BE(type, 0);
    buf.writeUInt16BE(body.length, 2);
    body.copy(buf, 4);
    return buf;
}

function u16Body(value) {
    const body = Buffer.alloc(2);
    body.writeUInt16BE(value, 0);
    return body;
}

/**
 * Build the client's complete NTS-KE request.
 * @function buildKeRequest
 * @return {Buffer} Wire bytes: next-protocol (NTPv4), AEAD (15), end of message.
 */
function buildKeRequest() {
    return Buffer.concat([
        record(CRITICAL | REC_NEXT_PROTOCOL, u16Body(PROTOCOL_NTPV4)),
        record(REC_AEAD_ALGORITHM, u16Body(AEAD_AES_SIV_CMAC_256)),
        record(CRITICAL | REC_END_OF_MESSAGE, Buffer.alloc(0))
    ]);
}

/**
 * Byte length of a complete NTS-KE message in buf, or -1 while truncated.
 * @function messageLength
 * @param {Buffer} buf Accumulated response bytes.
 * @return {Number} Length through End of Message, or -1.
 */
function messageLength(buf) {
    let offset = 0;
    for (;;) {
        if (offset + 4 > buf.length) return -1;
        const type = buf.readUInt16BE(offset) & ~CRITICAL;
        const bodyLen = buf.readUInt16BE(offset + 2);
        if (offset + 4 + bodyLen > buf.length) return -1;
        offset += 4 + bodyLen;
        if (type === REC_END_OF_MESSAGE) return offset;
    }
}

/**
 * Parse an NTS-KE response. Throws NtsKeError on error records, critical
 * unknown records, a foreign protocol/AEAD choice, or a malformed stream.
 * @function parseKeResponse
 * @param {Buffer} buf Complete response bytes (through End of Message).
 * @return {Object} { cookies: Buffer[], ntpHost: String|null, ntpPort: Number|null }
 */
function parseKeResponse(buf) {
    const cookies = [];
    let ntpHost = null;
    let ntpPort = null;
    let sawProtocol = false;
    let sawAead = false;
    let offset = 0;
    for (;;) {
        if (offset + 4 > buf.length) throw new NtsKeError("truncated NTS-KE response");
        const rawType = buf.readUInt16BE(offset);
        const bodyLen = buf.readUInt16BE(offset + 2);
        const type = rawType & ~CRITICAL;
        const critical = (rawType & CRITICAL) !== 0;
        if (offset + 4 + bodyLen > buf.length) throw new NtsKeError("truncated NTS-KE record");
        const body = buf.slice(offset + 4, offset + 4 + bodyLen);
        offset += 4 + bodyLen;
        if (type === REC_END_OF_MESSAGE) break;
        if (type === REC_ERROR) throw new NtsKeError("NTS-KE server reported an error");
        if (type === REC_WARNING) continue;
        if (type === REC_NEXT_PROTOCOL) {
            if (bodyLen !== 2 || body.readUInt16BE(0) !== PROTOCOL_NTPV4) throw new NtsKeError("server did not accept NTPv4");
            sawProtocol = true;
        } else if (type === REC_AEAD_ALGORITHM) {
            if (bodyLen !== 2 || body.readUInt16BE(0) !== AEAD_AES_SIV_CMAC_256) throw new NtsKeError("server did not accept AEAD_AES_SIV_CMAC_256");
            sawAead = true;
        } else if (type === REC_NEW_COOKIE) {
            if (bodyLen > 0) cookies.push(Buffer.from(body));
        } else if (type === REC_NTPV4_SERVER) {
            ntpHost = body.toString("ascii");
        } else if (type === REC_NTPV4_PORT) {
            if (bodyLen !== 2) throw new NtsKeError("malformed port record");
            ntpPort = body.readUInt16BE(0);
        } else if (critical) {
            throw new NtsKeError("unknown critical NTS-KE record");
        }
    }
    if (!sawProtocol || !sawAead) throw new NtsKeError("NTS-KE negotiation incomplete");
    if (cookies.length === 0) throw new NtsKeError("NTS-KE response carried no cookies");
    return { cookies, ntpHost, ntpPort };
}

/**
 * Run the NTS-KE exchange against a server and export the packet keys.
 * TLS 1.3 minimum and the ntske/1 ALPN are enforced (RFC 8915 requires both);
 * certificates verify against the system trust store.
 * @function performKe
 * @param {Object} options { host, port, timeoutMs? }
 * @return {Promise<Object>} { c2sKey, s2cKey, cookies, ntpHost, ntpPort }
 */
function performKe({ host, port, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let received = 0;
        let settled = false;
        const socket = tls.connect({
            host,
            port,
            // SNI must be a name: tls.connect throws on an IP-literal servername.
            servername: net.isIP(host) ? undefined : host,
            minVersion: "TLSv1.3",
            ALPNProtocols: ["ntske/1"]
        });
        const fail = (error) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            reject(error);
        };
        socket.setTimeout(timeoutMs, () => fail(new NtsKeError("NTS-KE timed out")));
        socket.on("error", fail);
        socket.on("secureConnect", () => {
            if (socket.alpnProtocol !== "ntske/1") return fail(new NtsKeError("server did not negotiate ntske/1"));
            socket.write(buildKeRequest());
        });
        socket.on("data", (chunk) => {
            if (settled) return;
            received += chunk.length;
            if (received > MAX_RESPONSE) return fail(new NtsKeError("oversized NTS-KE response"));
            chunks.push(chunk);
            const buf = Buffer.concat(chunks);
            const len = messageLength(buf);
            if (len === -1) return;
            try {
                const response = parseKeResponse(buf.slice(0, len));
                const context = (direction) => {
                    const ctx = Buffer.alloc(5);
                    ctx.writeUInt16BE(PROTOCOL_NTPV4, 0);
                    ctx.writeUInt16BE(AEAD_AES_SIV_CMAC_256, 2);
                    ctx.writeUInt8(direction, 4);
                    return ctx;
                };
                const c2sKey = socket.exportKeyingMaterial(KEY_LEN, EXPORTER_LABEL, context(0x00));
                const s2cKey = socket.exportKeyingMaterial(KEY_LEN, EXPORTER_LABEL, context(0x01));
                settled = true;
                socket.destroy();
                resolve({
                    c2sKey,
                    s2cKey,
                    cookies: response.cookies,
                    ntpHost: response.ntpHost || host,
                    ntpPort: response.ntpPort || 123
                });
            } catch (error) {
                fail(error);
            }
        });
    });
}

export default {
    CRITICAL,
    REC_END_OF_MESSAGE,
    REC_NEXT_PROTOCOL,
    REC_ERROR,
    REC_WARNING,
    REC_AEAD_ALGORITHM,
    REC_NEW_COOKIE,
    REC_NTPV4_SERVER,
    REC_NTPV4_PORT,
    PROTOCOL_NTPV4,
    AEAD_AES_SIV_CMAC_256,
    NtsKeError,
    buildKeRequest,
    messageLength,
    parseKeResponse,
    performKe
};
