import crypto from "node:crypto";

// AES-SIV-CMAC-256 (RFC 5297), implemented on node:crypto AES-128 primitives
// because neither Node's OpenSSL build nor Electron's BoringSSL exposes an SIV
// cipher. Used ONLY to authenticate NTS time packets (RFC 8915); it never
// touches file encryption, which stays AES-256-GCM in crypto.js.
//
// The 32-byte AEAD_AES_SIV_CMAC_256 key splits into two AES-128 halves:
// K1 (first 16 bytes) keys S2V/CMAC, K2 (last 16 bytes) keys CTR.

const BLOCK = 16;

const ZERO_BLOCK = Buffer.alloc(BLOCK);

/**
 * GF(2^128) doubling as defined by RFC 4493/5297.
 * @function dbl
 * @param {Buffer} block 16 bytes.
 * @return {Buffer} 16 bytes.
 */
function dbl(block) {
    const out = Buffer.alloc(BLOCK);
    let carry = 0;
    for (let i = BLOCK - 1; i >= 0; i--) {
        out[i] = ((block[i] << 1) | carry) & 0xff;
        carry = block[i] >>> 7;
    }
    if (carry) out[BLOCK - 1] ^= 0x87;
    return out;
}

function xorBlocks(a, b) {
    const out = Buffer.alloc(BLOCK);
    for (let i = 0; i < BLOCK; i++) out[i] = a[i] ^ b[i];
    return out;
}

function aesEcbBlock(key16, block) {
    const cipher = crypto.createCipheriv("aes-128-ecb", key16, null);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(block), cipher.final()]);
}

/**
 * AES-CMAC (RFC 4493) with an AES-128 key.
 * @function aesCmac
 * @param {Buffer} key16 16-byte key.
 * @param {Buffer} data Message of any length.
 * @return {Buffer} 16-byte tag.
 */
function aesCmac(key16, data) {
    const k1 = dbl(aesEcbBlock(key16, ZERO_BLOCK));
    const k2 = dbl(k1);
    const blocks = Math.max(1, Math.ceil(data.length / BLOCK));
    const complete = data.length > 0 && data.length % BLOCK === 0;
    let last;
    if (complete) {
        last = xorBlocks(data.slice((blocks - 1) * BLOCK), k1);
    } else {
        const padded = Buffer.alloc(BLOCK);
        data.copy(padded, 0, (blocks - 1) * BLOCK);
        padded[data.length % BLOCK] = 0x80;
        last = xorBlocks(padded, k2);
    }
    let x = ZERO_BLOCK;
    for (let i = 0; i < blocks - 1; i++) {
        x = aesEcbBlock(key16, xorBlocks(x, data.slice(i * BLOCK, (i + 1) * BLOCK)));
    }
    return aesEcbBlock(key16, xorBlocks(x, last));
}

/**
 * S2V (RFC 5297 section 2.4) over an ordered vector of strings.
 * @function s2v
 * @param {Buffer} key16 CMAC key (K1).
 * @param {Buffer[]} strings The associated-data vector; the LAST entry is the
 *                   plaintext (or, in nonce-based AEAD use, the caller places
 *                   the nonce as the final AD component before the plaintext).
 * @return {Buffer} 16-byte synthetic IV.
 */
function s2v(key16, strings) {
    if (strings.length === 0) {
        const one = Buffer.alloc(BLOCK);
        one[BLOCK - 1] = 0x01;
        return aesCmac(key16, one);
    }
    let d = aesCmac(key16, ZERO_BLOCK);
    for (let i = 0; i < strings.length - 1; i++) {
        d = xorBlocks(dbl(d), aesCmac(key16, strings[i]));
    }
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
        t = xorBlocks(dbl(d), padded);
    }
    return aesCmac(key16, t);
}

// RFC 5297: the CTR IV is the SIV with bit 31 of each of the last two 32-bit
// words cleared, so the counter cannot carry into the upper half.
function ctrIv(siv) {
    const q = Buffer.from(siv);
    q[8] &= 0x7f;
    q[12] &= 0x7f;
    return q;
}

function ctr(key16, iv, data) {
    const cipher = crypto.createCipheriv("aes-128-ctr", key16, iv);
    return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * SIV-encrypt: returns the 16-byte synthetic IV followed by the ciphertext.
 * @function sivSeal
 * @param {Buffer} key32 32-byte AEAD_AES_SIV_CMAC_256 key.
 * @param {Buffer[]} adList Associated-data vector (nonce last, when used).
 * @param {Buffer} plaintext Plaintext (may be empty).
 * @return {Buffer} SIV || ciphertext.
 */
function sivSeal(key32, adList, plaintext) {
    if (!Buffer.isBuffer(key32) || key32.length !== 32) throw new Error("SIV key must be 32 bytes");
    const k1 = key32.slice(0, BLOCK);
    const k2 = key32.slice(BLOCK);
    const siv = s2v(k1, [...adList, plaintext]);
    return Buffer.concat([siv, ctr(k2, ctrIv(siv), plaintext)]);
}

/**
 * SIV-decrypt and verify. Tag comparison is constant time.
 * @function sivOpen
 * @param {Buffer} key32 32-byte AEAD_AES_SIV_CMAC_256 key.
 * @param {Buffer[]} adList Associated-data vector (must match seal).
 * @param {Buffer} sealed SIV || ciphertext.
 * @return {Buffer|null} Plaintext, or null when authentication fails.
 */
function sivOpen(key32, adList, sealed) {
    if (!Buffer.isBuffer(key32) || key32.length !== 32) throw new Error("SIV key must be 32 bytes");
    if (!Buffer.isBuffer(sealed) || sealed.length < BLOCK) return null;
    const k1 = key32.slice(0, BLOCK);
    const k2 = key32.slice(BLOCK);
    const siv = sealed.slice(0, BLOCK);
    const plaintext = ctr(k2, ctrIv(siv), sealed.slice(BLOCK));
    const expected = s2v(k1, [...adList, plaintext]);
    if (!crypto.timingSafeEqual(expected, siv)) return null;
    return plaintext;
}

export default { dbl, aesCmac, s2v, sivSeal, sivOpen };
