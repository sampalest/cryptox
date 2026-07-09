import { createPinia, setActivePinia } from "pinia";
import fileCrypto from "@/components/mixins/filecryto.js";
import Constants from "@shared/constants.js";
import { useDeleteBehaviorStore } from "@/store/deleteBehavior.js";
import { useErasePolicyStore } from "@/store/erasePolicy.js";

/**
 * The mixin is a plain object, so it is testable without mounting components:
 * build a fake component context carrying the mixin's data() plus the state the
 * methods touch, and call the methods with that context. Regression guards for
 * what PR #17 dropped: error-code mappings, the handler bookkeeping used by
 * EncryptLoader.beforeUnmount, and the multi-file decrypt completion counter.
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
    let storage;

    beforeEach(() => {
        setActivePinia(createPinia());
        storage = {};
        global.localStorage = {
            getItem: key => (key in storage ? storage[key] : null),
            setItem: (key, value) => { storage[key] = value; }
        };
        stubLockasaur();
        global.alert = jest.fn();
    });

    afterEach(() => {
        delete global.localStorage;
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

    describe("post-decrypt delete-encrypted prompt", () => {
        it("passes the delete mode and checkbox state after a successful decrypt", async () => {
            const files = [{ path: "/a.dino" }];
            const ctx = makeContext(files);
            ctx.decryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.window.lockasaur.files.confirmDeleteEncrypted).toHaveBeenCalledWith("/a.dino", "trash", false);
            expect(ctx.finish).toBe(true);
        });

        it("passes the configured mode and a checked checkbox", async () => {
            const behavior = useDeleteBehaviorStore();
            behavior.mode = "permanent";
            behavior.deleteEncrypted = true;
            const files = [{ path: "/a.dino" }];
            const ctx = makeContext(files);
            ctx.decryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.window.lockasaur.files.confirmDeleteEncrypted).toHaveBeenCalledWith("/a.dino", "permanent", true);
        });

        it("notifies (without failing the decrypt) when the encrypted file could not be deleted", async () => {
            global.window.lockasaur.files.confirmDeleteEncrypted = jest.fn(() => Promise.resolve({ deleted: false, error: true }));
            const files = [{ path: "/a.dino" }];
            const ctx = makeContext(files);
            ctx.decryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.alert).toHaveBeenCalledTimes(1);
            // A refused deletion is a notice, not a decrypt error: no cancel, still finishes.
            expect(ctx.cancel).not.toHaveBeenCalled();
            expect(ctx.finish).toBe(true);
        });

        it("does not report a rejected delete prompt as a decrypt error", async () => {
            global.window.lockasaur.files.confirmDeleteEncrypted = jest.fn(() => Promise.reject(new Error("boom")));
            const files = [{ path: "/a.dino" }];
            const ctx = makeContext(files);
            ctx.decryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.alert).not.toHaveBeenCalled();
            expect(ctx.cancel).not.toHaveBeenCalled();
            expect(ctx.finish).toBe(true);
        });
    });

    describe("post-encrypt delete-original prompt", () => {
        it("passes the delete mode and checkbox state after a successful encrypt", async () => {
            const files = [{ path: "/a.txt" }];
            const ctx = makeContext(files);
            ctx.encryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.window.lockasaur.files.confirmDeleteOriginal).toHaveBeenCalledWith("/a.txt", "trash", false);
            expect(ctx.finish).toBe(true);
        });

        it("passes the configured mode and a checked checkbox", async () => {
            const behavior = useDeleteBehaviorStore();
            behavior.mode = "permanent";
            behavior.deleteOriginal = true;
            const files = [{ path: "/a.txt" }];
            const ctx = makeContext(files);
            ctx.encryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.window.lockasaur.files.confirmDeleteOriginal).toHaveBeenCalledWith("/a.txt", "permanent", true);
        });

        it("notifies (without failing the encrypt) when the original could not be deleted", async () => {
            global.window.lockasaur.files.confirmDeleteOriginal = jest.fn(() => Promise.resolve({ deleted: false, error: true }));
            const files = [{ path: "/a.txt" }];
            const ctx = makeContext(files);
            ctx.encryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.alert).toHaveBeenCalledTimes(1);
            expect(ctx.cancel).not.toHaveBeenCalled();
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

    describe("erase policy messaging", () => {
        it("shows the attempts-remaining warning for WRONG_PASSWORD with a policy", () => {
            const ctx = makeContext([]);
            ctx.handleCryptoFailure("decrypt", { code: "WRONG_PASSWORD", attemptsRemaining: 2 });
            expect(global.alert).toHaveBeenCalledWith("Incorrect password. 2 attempts remaining before this file is permanently erased.");
        });

        it("uses the singular form for one remaining attempt", () => {
            const ctx = makeContext([]);
            ctx.handleCryptoFailure("decrypt", { code: "WRONG_PASSWORD", attemptsRemaining: 1 });
            expect(global.alert).toHaveBeenCalledWith("Incorrect password. 1 attempt remaining before this file is permanently erased.");
        });

        it("shows the plain wrong-password message without a policy", () => {
            const ctx = makeContext([]);
            ctx.handleCryptoFailure("decrypt", { code: "WRONG_PASSWORD" });
            expect(global.alert).toHaveBeenCalledWith("Incorrect password or the file is corrupted.");
        });

        it("appends the policy note when the counter could not be updated", () => {
            const ctx = makeContext([]);
            ctx.handleCryptoFailure("decrypt", { code: "WRONG_PASSWORD", policyError: true });
            const shown = global.alert.mock.calls.pop()[0];
            expect(shown).toContain("Incorrect password or the file is corrupted.");
            expect(shown).toContain("The failed-attempt protection could not update this file.");
        });

        it("shows the exact erased message and never the delete prompt", async () => {
            global.window.lockasaur.crypto.decrypt = jest.fn(() => Promise.resolve({ ok: false, code: "FILE_ERASED", message: "raw" }));
            const files = [{ path: "/a.dino" }];
            const ctx = makeContext(files);
            ctx.decryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.alert).toHaveBeenCalledWith("This file was erased because the failed-attempt limit was reached.");
            expect(global.window.lockasaur.files.confirmDeleteEncrypted).not.toHaveBeenCalled();
            expect(ctx.finish).toBe(false);
        });

        it("warns when a successful decrypt could not reset the counter", async () => {
            global.window.lockasaur.crypto.decrypt = jest.fn(() => Promise.resolve({ ok: true, cancelled: false, policyError: true }));
            const files = [{ path: "/a.dino" }];
            const ctx = makeContext(files);
            ctx.decryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.alert).toHaveBeenCalledWith("The failed-attempt protection could not update this file.");
            expect(ctx.cancel).not.toHaveBeenCalled();
            expect(ctx.finish).toBe(true);
        });
    });

    describe("erase policy encrypt payload", () => {
        it("passes the policy as the fourth encrypt argument when enabled", async () => {
            const store = useErasePolicyStore();
            store.enabled = true;
            store.maxAttempts = 3;
            const files = [{ path: "/a.txt" }];
            const ctx = makeContext(files);
            ctx.encryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.window.lockasaur.crypto.encrypt).toHaveBeenCalledWith(
                { path: "/a.txt" }, "secret", expect.any(String), { maxAttempts: 3 }
            );
        });

        it("passes no policy when disabled", async () => {
            const files = [{ path: "/a.txt" }];
            const ctx = makeContext(files);
            ctx.encryptFile(files[0]);
            await new Promise(res => setImmediate(res));
            expect(global.window.lockasaur.crypto.encrypt).toHaveBeenCalledWith(
                { path: "/a.txt" }, "secret", expect.any(String), undefined
            );
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
