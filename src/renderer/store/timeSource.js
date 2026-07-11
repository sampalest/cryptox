import { defineStore } from "pinia";
import Constants from "@shared/constants.js";

// Trusted time source consulted when DECRYPTING files that carry an
// expiration. This store only remembers the user's choice; the value is
// validated main-side (normalizeTimeSource) and the network lookup happens in
// the main process, never in the renderer.
const KIND_KEY = "lockasaur:time-source";
const HOST_KEY = "lockasaur:time-server";
const FAIL_CLOSED_KEY = "lockasaur:time-fail-closed";

// Segmented-control ids: Cloudflare and Custom are both NTS underneath.
export const TIME_SOURCE_OPTIONS = Object.freeze(["system", "cloudflare", "custom"]);

// Renderer-side UX check only; normalizeTimeSource is authoritative.
const HOSTNAME_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

export function isValidHostname(value) {
    if (typeof value !== "string" || value.length === 0 || value.length > 253) return false;
    return value.split(".").every(label => HOSTNAME_LABEL.test(label));
}

export const useTimeSourceStore = defineStore("timeSource", {
    state: () => ({
        source: "cloudflare",
        customHost: "",
        failClosed: false
    }),
    getters: {
        // Fourth argument for window.lockasaur.crypto.decrypt.
        sourcePayload(state) {
            if (state.source === "system") return { kind: "system" };
            if (state.source === "custom" && isValidHostname(state.customHost)) {
                return { kind: "nts", host: state.customHost, failClosed: state.failClosed };
            }
            return { kind: "nts", host: Constants.NTS_DEFAULT_HOST, failClosed: state.failClosed };
        }
    },
    actions: {
        init() {
            const source = localStorage.getItem(KIND_KEY);
            if (TIME_SOURCE_OPTIONS.includes(source)) this.source = source;
            const host = localStorage.getItem(HOST_KEY);
            if (isValidHostname(host)) this.customHost = host;
            this.failClosed = localStorage.getItem(FAIL_CLOSED_KEY) === "1";
        },
        choose(option) {
            if (!TIME_SOURCE_OPTIONS.includes(option)) return;
            this.source = option;
            localStorage.setItem(KIND_KEY, option);
        },
        setCustomHost(host) {
            this.customHost = host;
            if (isValidHostname(host)) localStorage.setItem(HOST_KEY, host);
        },
        chooseFailClosed(value) {
            this.failClosed = value === true;
            localStorage.setItem(FAIL_CLOSED_KEY, this.failClosed ? "1" : "0");
        }
    }
});
