import Constants from "../../shared/constants.js";
import { TimeUnavailableError } from "../../shared/exceptions.js";
import NtsClient from "./ntsClient.js";

// Time sources for expiration checks. Providers resolve
// { nowMs, source: "system"|"nts", trusted, fallback? } or throw
// TimeUnavailableError (fail-closed NTS only). Hostnames never appear in
// error messages or logs.

// An NTS verdict outside these bounds is treated as a failure: era selection
// leans on the local clock, so an implausible result is not trusted time.
const NTS_PLAUSIBLE_MIN_MS = 1577836800000; // 2020-01-01T00:00:00Z
const CACHE_WINDOW_MS = 60000;
// Hard ceiling on one lookup, above the per-socket timeouts, so now() can never
// hang a decrypt however the network misbehaves.
const QUERY_DEADLINE_MS = 10000;

function withDeadline(promise, ms) {
    let timer;
    return Promise.race([
        promise,
        new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error("time lookup deadline exceeded")), ms);
        })
    ]).finally(() => clearTimeout(timer));
}

function elapsedMs(sinceHrtime) {
    return Number((process.hrtime.bigint() - sinceHrtime) / 1000000n);
}

class SystemTimeProvider {
    async now() {
        return { nowMs: Date.now(), source: "system", trusted: false };
    }
}

class NtsTimeProvider {
    constructor({ host = Constants.NTS_DEFAULT_HOST, port = Constants.NTS_DEFAULT_PORT, failClosed = false, queryFn = NtsClient.queryNtsTime, deadlineMs = QUERY_DEADLINE_MS } = {}) {
        this.host = host;
        this.port = port;
        this.failClosed = failClosed;
        this.queryFn = queryFn;
        this.deadlineMs = deadlineMs;
        this._cache = null;
    }

    async now() {
        if (this._cache && elapsedMs(this._cache.atHrtime) < CACHE_WINDOW_MS) {
            return { nowMs: this._cache.nowMs + elapsedMs(this._cache.atHrtime), source: "nts", trusted: true };
        }
        try {
            const { nowMs } = await withDeadline(this.queryFn({ host: this.host, port: this.port }), this.deadlineMs);
            if (!Number.isFinite(nowMs) || nowMs < NTS_PLAUSIBLE_MIN_MS || nowMs > Constants.EXPIRES_AT_MAX) {
                throw new Error("implausible NTS verdict");
            }
            this._cache = { nowMs, atHrtime: process.hrtime.bigint() };
            return { nowMs, source: "nts", trusted: true };
        } catch (error) {
            if (this.failClosed) throw new TimeUnavailableError(error);
            return { nowMs: Date.now(), source: "system", trusted: false, fallback: true };
        }
    }
}

// Build a provider (async now()) from a normalized decrypt-payload time source.
// A null config means the default: Cloudflare NTS with system-clock fallback.
function createTimeProvider(config) {
    if (config && config.kind === "system") return new SystemTimeProvider();
    return new NtsTimeProvider(config && config.kind === "nts" ? config : {});
}

export default { SystemTimeProvider, NtsTimeProvider, createTimeProvider, NTS_PLAUSIBLE_MIN_MS, CACHE_WINDOW_MS, QUERY_DEADLINE_MS };
