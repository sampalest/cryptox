import Siv from "@main/time/aesSiv.js";

const h = value => Buffer.from(value.replace(/\s+/g, ""), "hex");

// Official RFC 5297 appendix A vectors, byte for byte.
describe("AES-SIV-CMAC-256 (RFC 5297)", () => {
    describe("A.1 deterministic authenticated encryption", () => {
        const key = h("fffefdfc fbfaf9f8 f7f6f5f4 f3f2f1f0 f0f1f2f3 f4f5f6f7 f8f9fafb fcfdfeff");
        const ad = h("10111213 14151617 18191a1b 1c1d1e1f 20212223 24252627");
        const plaintext = h("11223344 55667788 99aabbcc ddee");
        const sealed = h("85632d07 c6e8f37f 950acd32 0a2ecc93 40c02b96 90c4dc04 daef7f6a fe5c");

        it("seals to the exact vector bytes", () => {
            expect(Siv.sivSeal(key, [ad], plaintext).equals(sealed)).toBe(true);
        });

        it("opens the vector bytes back to the plaintext", () => {
            expect(Siv.sivOpen(key, [ad], sealed).equals(plaintext)).toBe(true);
        });
    });

    describe("A.2 nonce-based authenticated encryption", () => {
        const key = h("7f7e7d7c 7b7a7978 77767574 73727170 40414243 44454647 48494a4b 4c4d4e4f");
        const ad1 = h("00112233 44556677 8899aabb ccddeeff deaddada deaddada ffeeddcc bbaa9988 77665544 33221100");
        const ad2 = h("10203040 50607080 90a0");
        const nonce = h("09f91102 9d74e35b d84156c5 635688c0");
        const plaintext = Buffer.from("this is some plaintext to encrypt using SIV-AES", "utf-8");
        const sealed = h(
            "7bdb6e3b 432667eb 06f4d14b ff2fbd0f cb900f2f ddbe4043 26601965 c889bf17" +
            "dba77ceb 094fa663 b7a3f748 ba8af829 ea64ad54 4a272e9c 485b62a3 fd5c0d"
        );

        it("seals to the exact vector bytes with the nonce as the final ad component", () => {
            expect(Siv.sivSeal(key, [ad1, ad2, nonce], plaintext).equals(sealed)).toBe(true);
        });

        it("opens the vector bytes back to the plaintext", () => {
            expect(Siv.sivOpen(key, [ad1, ad2, nonce], sealed).equals(plaintext)).toBe(true);
        });

        it("rejects a flipped ciphertext bit", () => {
            const tampered = Buffer.from(sealed);
            tampered[20] ^= 0x01;
            expect(Siv.sivOpen(key, [ad1, ad2, nonce], tampered)).toBeNull();
        });

        it("rejects a flipped tag bit", () => {
            const tampered = Buffer.from(sealed);
            tampered[0] ^= 0x01;
            expect(Siv.sivOpen(key, [ad1, ad2, nonce], tampered)).toBeNull();
        });

        it("rejects tampered associated data", () => {
            const tamperedAd = Buffer.from(ad1);
            tamperedAd[0] ^= 0x01;
            expect(Siv.sivOpen(key, [tamperedAd, ad2, nonce], sealed)).toBeNull();
        });

        it("rejects a different nonce", () => {
            const otherNonce = Buffer.from(nonce);
            otherNonce[15] ^= 0x01;
            expect(Siv.sivOpen(key, [ad1, ad2, otherNonce], sealed)).toBeNull();
        });
    });

    it("round-trips an empty plaintext (the NTS request shape)", () => {
        const key = Buffer.alloc(32, 7);
        const ad = Buffer.from("header bytes");
        const nonce = Buffer.alloc(16, 9);
        const sealed = Siv.sivSeal(key, [ad, nonce], Buffer.alloc(0));
        expect(sealed.length).toBe(16);
        expect(Siv.sivOpen(key, [ad, nonce], sealed).length).toBe(0);
        expect(Siv.sivOpen(key, [Buffer.from("other bytes"), nonce], sealed)).toBeNull();
    });

    it("rejects sealed inputs shorter than one block", () => {
        expect(Siv.sivOpen(Buffer.alloc(32), [], Buffer.alloc(8))).toBeNull();
    });

    it("refuses keys that are not 32 bytes", () => {
        expect(() => Siv.sivSeal(Buffer.alloc(16), [], Buffer.alloc(0))).toThrow("32 bytes");
        expect(() => Siv.sivOpen(Buffer.alloc(64), [], Buffer.alloc(16))).toThrow("32 bytes");
    });
});
