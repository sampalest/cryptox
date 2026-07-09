import TimeProvider from "@main/time/timeProvider.js";
import { TimeUnavailableError } from "@shared/exceptions.js";

describe("TimeProvider", () => {
    it("system provider reports the local clock as untrusted", async () => {
        const before = Date.now();
        const verdict = await new TimeProvider.SystemTimeProvider().now();
        expect(verdict.source).toBe("system");
        expect(verdict.trusted).toBe(false);
        expect(verdict.nowMs).toBeGreaterThanOrEqual(before);
        expect(verdict.nowMs).toBeLessThanOrEqual(Date.now());
    });

    it("nts provider returns a trusted verdict from a successful query", async () => {
        const nowMs = Date.now() + 12345;
        const queryFn = jest.fn().mockResolvedValue({ nowMs });
        const provider = new TimeProvider.NtsTimeProvider({ host: "nts.example.com", port: 4460, queryFn });

        const verdict = await provider.now();
        expect(verdict).toEqual({ nowMs, source: "nts", trusted: true });
        expect(queryFn).toHaveBeenCalledWith({ host: "nts.example.com", port: 4460 });
    });

    it("caches the verdict so a batch of decrypts queries once", async () => {
        const queryFn = jest.fn().mockResolvedValue({ nowMs: Date.now() });
        const provider = new TimeProvider.NtsTimeProvider({ queryFn });

        const first = await provider.now();
        const second = await provider.now();
        expect(queryFn).toHaveBeenCalledTimes(1);
        expect(second.trusted).toBe(true);
        expect(second.nowMs).toBeGreaterThanOrEqual(first.nowMs);
    });

    it("falls back to the system clock by default when the query fails", async () => {
        const queryFn = jest.fn().mockRejectedValue(new Error("unreachable"));
        const provider = new TimeProvider.NtsTimeProvider({ queryFn });

        const verdict = await provider.now();
        expect(verdict.source).toBe("system");
        expect(verdict.trusted).toBe(false);
        expect(verdict.fallback).toBe(true);
    });

    it("throws TimeUnavailableError when fail-closed and the query fails", async () => {
        const queryFn = jest.fn().mockRejectedValue(new Error("unreachable"));
        const provider = new TimeProvider.NtsTimeProvider({ failClosed: true, queryFn });

        await expect(provider.now()).rejects.toThrow(TimeUnavailableError);
    });

    it("cuts off a hung query at the deadline instead of hanging the decrypt", async () => {
        const queryFn = jest.fn(() => new Promise(() => {})); // never settles
        const fallback = await new TimeProvider.NtsTimeProvider({ queryFn, deadlineMs: 50 }).now();
        expect(fallback.source).toBe("system");
        expect(fallback.fallback).toBe(true);

        const strict = new TimeProvider.NtsTimeProvider({ failClosed: true, queryFn, deadlineMs: 50 });
        await expect(strict.now()).rejects.toThrow(TimeUnavailableError);
    });

    it.each([
        ["before the plausibility floor", TimeProvider.NTS_PLAUSIBLE_MIN_MS - 1],
        ["past the format ceiling", 253402300800000],
        ["not finite", NaN]
    ])("treats a verdict %s as a failure", async (label, nowMs) => {
        const queryFn = jest.fn().mockResolvedValue({ nowMs });
        const fallback = await new TimeProvider.NtsTimeProvider({ queryFn }).now();
        expect(fallback.fallback).toBe(true);

        const strict = new TimeProvider.NtsTimeProvider({ failClosed: true, queryFn });
        await expect(strict.now()).rejects.toThrow(TimeUnavailableError);
    });

    describe("createTimeProvider", () => {
        it("maps a system config to the system provider", () => {
            expect(TimeProvider.createTimeProvider({ kind: "system" })).toBeInstanceOf(TimeProvider.SystemTimeProvider);
        });

        it("maps an nts config to a configured nts provider", () => {
            const provider = TimeProvider.createTimeProvider({ kind: "nts", host: "nts.example.com", port: 1234, failClosed: true });
            expect(provider).toBeInstanceOf(TimeProvider.NtsTimeProvider);
            expect(provider.host).toBe("nts.example.com");
            expect(provider.port).toBe(1234);
            expect(provider.failClosed).toBe(true);
        });

        it("defaults a null config to Cloudflare NTS with system fallback", () => {
            const provider = TimeProvider.createTimeProvider(null);
            expect(provider).toBeInstanceOf(TimeProvider.NtsTimeProvider);
            expect(provider.host).toBe("time.cloudflare.com");
            expect(provider.port).toBe(4460);
            expect(provider.failClosed).toBe(false);
        });
    });
});
