import { createPinia, setActivePinia } from "pinia";
import { ERASE_ATTEMPT_OPTIONS, useErasePolicyStore } from "@/store/erasePolicy.js";

describe("erasePolicy store", () => {
    let storage;
    let confirmErasePolicy;

    beforeEach(() => {
        setActivePinia(createPinia());
        storage = {};
        global.localStorage = {
            getItem: key => (key in storage ? storage[key] : null),
            setItem: (key, value) => { storage[key] = value; }
        };
        confirmErasePolicy = jest.fn().mockResolvedValue(true);
        global.window = { lockasaur: { dialog: { confirmErasePolicy } } };
    });

    afterEach(() => {
        delete global.localStorage;
        delete global.window;
    });

    it("exposes the fixed attempt options", () => {
        expect([...ERASE_ATTEMPT_OPTIONS]).toEqual([3, 5, 10]);
    });

    it("defaults to disabled with 5 attempts", () => {
        const store = useErasePolicyStore();
        store.init();
        expect(store.enabled).toBe(false);
        expect(store.maxAttempts).toBe(5);
        expect(store.policyPayload).toBeUndefined();
    });

    it("restores saved values on init", () => {
        storage["lockasaur:erase-enabled"] = "1";
        storage["lockasaur:erase-attempts"] = "10";
        const store = useErasePolicyStore();
        store.init();
        expect(store.enabled).toBe(true);
        expect(store.maxAttempts).toBe(10);
        expect(store.policyPayload).toEqual({ maxAttempts: 10 });
    });

    it("ignores persisted values outside the allowlist", () => {
        storage["lockasaur:erase-attempts"] = "7";
        const store = useErasePolicyStore();
        store.init();
        expect(store.maxAttempts).toBe(5);
    });

    it("asks for confirmation before enabling and persists on accept", async () => {
        const store = useErasePolicyStore();
        store.init();

        await store.choose(3);

        expect(confirmErasePolicy).toHaveBeenCalledTimes(1);
        expect(store.enabled).toBe(true);
        expect(store.maxAttempts).toBe(3);
        expect(storage["lockasaur:erase-enabled"]).toBe("1");
        expect(storage["lockasaur:erase-attempts"]).toBe("3");
    });

    it("stays disabled and persists nothing when the confirmation is declined", async () => {
        confirmErasePolicy.mockResolvedValue(false);
        const store = useErasePolicyStore();
        store.init();

        await store.choose(5);

        expect(store.enabled).toBe(false);
        expect(store.maxAttempts).toBe(5);
        expect(storage["lockasaur:erase-enabled"]).toBeUndefined();
        expect(storage["lockasaur:erase-attempts"]).toBeUndefined();
        expect(store.policyPayload).toBeUndefined();
    });

    it("changes the count without a dialog while already enabled", async () => {
        const store = useErasePolicyStore();
        store.init();
        await store.choose(5);
        confirmErasePolicy.mockClear();

        await store.choose(10);

        expect(confirmErasePolicy).not.toHaveBeenCalled();
        expect(store.maxAttempts).toBe(10);
        expect(storage["lockasaur:erase-attempts"]).toBe("10");
    });

    it("disables without a dialog", async () => {
        const store = useErasePolicyStore();
        store.init();
        await store.choose(5);
        confirmErasePolicy.mockClear();

        await store.choose("off");

        expect(confirmErasePolicy).not.toHaveBeenCalled();
        expect(store.enabled).toBe(false);
        expect(storage["lockasaur:erase-enabled"]).toBe("0");
        expect(store.policyPayload).toBeUndefined();
    });

    it("ignores attempt counts outside the allowlist", async () => {
        const store = useErasePolicyStore();
        store.init();

        await store.choose(7);

        expect(confirmErasePolicy).not.toHaveBeenCalled();
        expect(store.enabled).toBe(false);
    });
});
