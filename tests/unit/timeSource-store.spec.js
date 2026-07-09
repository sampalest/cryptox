import { createPinia, setActivePinia } from "pinia";
import { TIME_SOURCE_OPTIONS, isValidHostname, useTimeSourceStore } from "@/store/timeSource.js";

describe("timeSource store", () => {
    let storage;

    beforeEach(() => {
        setActivePinia(createPinia());
        storage = {};
        global.localStorage = {
            getItem: key => (key in storage ? storage[key] : null),
            setItem: (key, value) => { storage[key] = value; }
        };
    });

    afterEach(() => {
        delete global.localStorage;
    });

    it("exposes the fixed source options", () => {
        expect([...TIME_SOURCE_OPTIONS]).toEqual(["system", "cloudflare", "custom"]);
    });

    it("defaults to Cloudflare NTS with system-clock fallback", () => {
        const store = useTimeSourceStore();
        store.init();
        expect(store.source).toBe("cloudflare");
        expect(store.failClosed).toBe(false);
        expect(store.sourcePayload).toEqual({ kind: "nts", host: "time.cloudflare.com", failClosed: false });
    });

    it("restores saved values on init", () => {
        storage["lockasaur:time-source"] = "custom";
        storage["lockasaur:time-server"] = "nts.example.com";
        storage["lockasaur:time-fail-closed"] = "1";
        const store = useTimeSourceStore();
        store.init();
        expect(store.sourcePayload).toEqual({ kind: "nts", host: "nts.example.com", failClosed: true });
    });

    it("ignores persisted values outside the allowlist", () => {
        storage["lockasaur:time-source"] = "carrier-pigeon";
        storage["lockasaur:time-server"] = "not a hostname";
        const store = useTimeSourceStore();
        store.init();
        expect(store.source).toBe("cloudflare");
        expect(store.customHost).toBe("");
    });

    it("produces a bare system payload for the system clock", () => {
        const store = useTimeSourceStore();
        store.init();
        store.choose("system");
        store.chooseFailClosed(true);
        expect(store.sourcePayload).toEqual({ kind: "system" });
        expect(storage["lockasaur:time-source"]).toBe("system");
    });

    it("falls back to the default host while the custom host is invalid", () => {
        const store = useTimeSourceStore();
        store.init();
        store.choose("custom");
        store.setCustomHost("still typ ing");
        expect(store.sourcePayload).toEqual({ kind: "nts", host: "time.cloudflare.com", failClosed: false });
        expect(storage["lockasaur:time-server"]).toBeUndefined();

        store.setCustomHost("nts.example.com");
        expect(store.sourcePayload).toEqual({ kind: "nts", host: "nts.example.com", failClosed: false });
        expect(storage["lockasaur:time-server"]).toBe("nts.example.com");
    });

    it("persists the fail-closed choice as a strict boolean", () => {
        const store = useTimeSourceStore();
        store.init();
        store.chooseFailClosed("truthy");
        expect(store.failClosed).toBe(false);
        store.chooseFailClosed(true);
        expect(store.failClosed).toBe(true);
        expect(storage["lockasaur:time-fail-closed"]).toBe("1");
    });

    it("ignores source choices outside the allowlist", () => {
        const store = useTimeSourceStore();
        store.init();
        store.choose("carrier-pigeon");
        expect(store.source).toBe("cloudflare");
    });

    it("validates hostnames the same way the main process does", () => {
        expect(isValidHostname("time.cloudflare.com")).toBe(true);
        expect(isValidHostname("a-b.example")).toBe(true);
        expect(isValidHostname("https://example.com")).toBe(false);
        expect(isValidHostname("example.com/path")).toBe(false);
        expect(isValidHostname(`${"a".repeat(254)}.com`)).toBe(false);
        expect(isValidHostname("")).toBe(false);
        expect(isValidHostname(null)).toBe(false);
    });
});
