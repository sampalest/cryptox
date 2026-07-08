import { createPinia, setActivePinia } from "pinia";
import { useWindowSizeStore, WINDOW_SIZES } from "@/store/windowSize.js";

describe("windowSize store", () => {
    let setSize;
    let storage;

    beforeEach(() => {
        setActivePinia(createPinia());
        storage = {};
        global.localStorage = {
            getItem: key => (key in storage ? storage[key] : null),
            setItem: (key, value) => { storage[key] = value; }
        };
        setSize = jest.fn().mockResolvedValue(true);
        global.window = { lockasaur: { window: { setSize } } };
    });

    afterEach(() => {
        delete global.localStorage;
        delete global.window;
    });

    it("exposes the three fixed presets", () => {
        expect(WINDOW_SIZES.map(size => size.id)).toEqual(["default", "l", "xl"]);
    });

    it("reapplies a saved choice on init", async () => {
        storage["lockasaur:window-size"] = "xl";
        const store = useWindowSizeStore();
        await store.init();
        expect(setSize).toHaveBeenCalledWith("xl");
        expect(store.size).toBe("xl");
        expect(store.applied).toBe("xl");
    });

    it("skips IPC on init when nothing is saved (default already applied)", async () => {
        const store = useWindowSizeStore();
        await store.init();
        expect(setSize).not.toHaveBeenCalled();
        expect(store.size).toBe("default");
    });

    it("ignores a saved value outside the option allowlist", async () => {
        storage["lockasaur:window-size"] = "900x900";
        const store = useWindowSizeStore();
        await store.init();
        expect(setSize).not.toHaveBeenCalled();
        expect(store.size).toBe("default");
    });

    it("falls back to default when the saved preset no longer fits", async () => {
        storage["lockasaur:window-size"] = "xl";
        setSize.mockResolvedValueOnce(false);
        const store = useWindowSizeStore();
        await store.init();
        expect(store.size).toBe("default");
        expect(store.applied).toBe("default");
    });

    it("persists a selection only when the main process accepts it", async () => {
        const store = useWindowSizeStore();
        await store.init();

        setSize.mockResolvedValueOnce(false);
        await store.setSize("l");
        expect(store.size).toBe("default");
        expect(storage["lockasaur:window-size"]).toBeUndefined();

        await store.setSize("l");
        expect(store.size).toBe("l");
        expect(store.applied).toBe("l");
        expect(storage["lockasaur:window-size"]).toBe("l");
    });

    it("rejects ids outside the allowlist without touching IPC", async () => {
        const store = useWindowSizeStore();
        await store.init();
        await store.setSize("huge");
        expect(setSize).not.toHaveBeenCalled();
        expect(store.size).toBe("default");
    });

    it("skips redundant applies for the already-applied size", async () => {
        const store = useWindowSizeStore();
        await store.init();
        await store.setSize("l");
        expect(setSize).toHaveBeenCalledTimes(1);
        await store.apply();
        await store.apply();
        expect(setSize).toHaveBeenCalledTimes(1);
    });
});
