import fileCrypto from "@/components/mixins/filecryto.js";
import Constants from "@shared/constants.js";

/**
 * The mixin is a plain object, so it is testable without mounting components:
 * build a fake component context carrying the mixin's data() plus the state the
 * methods touch, and call the methods with that context. Regression guards for
 * APP-11 (PR #17 dropped error-code mappings, the handler bookkeeping used by
 * EncryptLoader.beforeUnmount, and the multi-file decrypt completion counter).
 */
function makeContext(files) {
    const ctx = Object.assign({}, fileCrypto.methods, fileCrypto.data(), {
        files: files,
        password: "secret",
        percent: { value: 0 },
        fileEvent: { counter: 0 },
        cancel: jest.fn()
    });
    return ctx;
}

function deferred() {
    let resolve;
    const promise = new Promise(res => { resolve = res; });
    return { promise, resolve };
}

function stubLockasaur(overrides) {
    global.window = {
        crypto: { randomUUID: () => `op-${Math.random().toString(16).slice(2)}` },
        lockasaur: Object.assign({
            crypto: {
                onProgress: jest.fn(() => jest.fn()),
                onStatus: jest.fn(() => jest.fn()),
                encrypt: jest.fn(() => Promise.resolve({ ok: true })),
                decrypt: jest.fn(() => Promise.resolve({ ok: true })),
                cancel: jest.fn(() => Promise.resolve())
            },
            files: {
                confirmDeleteEncrypted: jest.fn(() => Promise.resolve()),
                confirmDeleteOriginal: jest.fn(() => Promise.resolve())
            },
            log: { error: jest.fn() }
        }, overrides)
    };
}

describe("filecryto mixin", () => {
    beforeEach(() => {
        stubLockasaur();
        global.alert = jest.fn();
    });

    afterEach(() => {
        delete global.window;
        delete global.alert;
    });

    describe("failure messages", () => {
        it.each(["encrypt", "decrypt"])("maps every CRYPTO_ERROR_CODES value for %s (never the fallback)", kind => {
            for (const code of Object.values(Constants.CRYPTO_ERROR_CODES)) {
                const ctx = makeContext([]);
                ctx.handleCryptoFailure(kind, { code: code, message: "RAW_FALLBACK" });
                expect(global.alert).toHaveBeenCalled();
                const shown = global.alert.mock.calls.pop()[0];
                expect(shown).not.toBe("RAW_FALLBACK");
                expect(typeof shown).toBe("string");
                expect(shown.length).toBeGreaterThan(0);
                expect(ctx.cancel).toHaveBeenCalled();
            }
        });

        it("logs only the stable code, never the result message", () => {
            const ctx = makeContext([]);
            ctx.handleCryptoFailure("decrypt", { code: "OPERATION_FAILED", message: "/tmp/secret-path" });
            for (const call of global.window.lockasaur.log.error.mock.calls) {
                expect(String(call[0])).not.toContain("/tmp/secret-path");
            }
        });
    });

    describe("multi-file decrypt completion", () => {
        it("sets finish only after the last file resolves", async () => {
            const first = deferred();
            const second = deferred();
            const results = [first.promise, second.promise];
            global.window.lockasaur.crypto.decrypt = jest.fn(() => results.shift());

            const files = [{ path: "/a.ctx" }, { path: "/b.ctx" }];
            const ctx = makeContext(files);
            ctx.decryptFile(files[0]);
            ctx.decryptFile(files[1]);

            first.resolve({ ok: true });
            await new Promise(res => setImmediate(res));
            expect(ctx.finish).toBe(false);

            second.resolve({ ok: true });
            await new Promise(res => setImmediate(res));
            expect(ctx.finish).toBe(true);
        });

        it("does not count a cancelled decrypt as a completion", async () => {
            global.window.lockasaur.crypto.decrypt = jest.fn(() => Promise.resolve({ ok: true, cancelled: true }));
            const files = [{ path: "/a.ctx" }];
            const ctx = makeContext(files);
            ctx.decryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(ctx.finish).toBe(false);
        });
    });

    describe("post-encrypt delete-original prompt", () => {
        it("offers to delete the original after a successful encrypt", async () => {
            const files = [{ path: "/a.txt" }];
            const ctx = makeContext(files);
            ctx.encryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.window.lockasaur.files.confirmDeleteOriginal).toHaveBeenCalledWith("/a.txt");
            expect(ctx.finish).toBe(true);
        });

        it("never prompts for a cancelled or failed encrypt", async () => {
            global.window.lockasaur.crypto.encrypt = jest.fn(() => Promise.resolve({ ok: true, cancelled: true }));
            const files = [{ path: "/a.txt" }];
            let ctx = makeContext(files);
            ctx.encryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.window.lockasaur.files.confirmDeleteOriginal).not.toHaveBeenCalled();

            global.window.lockasaur.crypto.encrypt = jest.fn(() => Promise.resolve({ ok: false, code: "OPERATION_FAILED" }));
            ctx = makeContext(files);
            ctx.encryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.window.lockasaur.files.confirmDeleteOriginal).not.toHaveBeenCalled();
        });

        it("does not report a failed prompt as an encrypt error", async () => {
            global.window.lockasaur.files.confirmDeleteOriginal = jest.fn(() => Promise.reject(new Error("boom")));
            const files = [{ path: "/a.txt" }];
            const ctx = makeContext(files);
            ctx.encryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.alert).not.toHaveBeenCalled();
            expect(ctx.cancel).not.toHaveBeenCalled();
            expect(ctx.finish).toBe(true);
        });
    });

    describe("handler bookkeeping (used by EncryptLoader.beforeUnmount)", () => {
        it("exposes addHandlers, releaseHandlers and releaseAllHandlers", () => {
            const ctx = makeContext([]);
            expect(typeof ctx.addHandlers).toBe("function");
            expect(typeof ctx.releaseHandlers).toBe("function");
            expect(typeof ctx.releaseAllHandlers).toBe("function");
        });

        it("never double-releases a handler across releaseHandlers and releaseAllHandlers", () => {
            const ctx = makeContext([]);
            const offA = jest.fn();
            const offB = jest.fn();
            ctx.addHandlers(offA, offB);

            ctx.releaseHandlers([offA]);
            ctx.releaseHandlers([offA]);
            expect(offA).toHaveBeenCalledTimes(1);

            ctx.releaseAllHandlers();
            expect(offA).toHaveBeenCalledTimes(1);
            expect(offB).toHaveBeenCalledTimes(1);

            ctx.releaseAllHandlers();
            expect(offB).toHaveBeenCalledTimes(1);
        });
    });
});
