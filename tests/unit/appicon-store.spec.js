import { createPinia, setActivePinia } from "pinia";
import { useAppIconStore, APP_ICONS } from "@/store/appIcon.js";
import { useThemeStore } from "@/store/theme.js";

describe("appIcon store", () => {
    let setIcon;
    let storage;

    beforeEach(() => {
        setActivePinia(createPinia());
        storage = {};
        global.localStorage = {
            getItem: key => (key in storage ? storage[key] : null),
            setItem: (key, value) => { storage[key] = value; }
        };
        setIcon = jest.fn().mockResolvedValue(true);
        global.window = { lockasaur: { app: { setIcon } } };
    });

    afterEach(() => {
        delete global.localStorage;
        delete global.window;
    });

    it("exposes auto plus the seven concrete icon options", () => {
        expect(APP_ICONS.map(icon => icon.id)).toEqual(
            ["auto", "default", "dark", "clear-light", "clear-dark", "tinted-light", "tinted-dark", "locked"]
        );
    });

    it("stays inert when unsupported (non-macOS)", async () => {
        storage["lockasaur:app-icon"] = "dark";
        const store = useAppIconStore();
        await store.init(false);
        await store.setIcon("dark");
        expect(setIcon).not.toHaveBeenCalled();
        expect(store.icon).toBe("default");
    });

    it("reapplies a saved concrete choice on init", async () => {
        storage["lockasaur:app-icon"] = "tinted-dark";
        const store = useAppIconStore();
        await store.init(true);
        expect(setIcon).toHaveBeenCalledWith("tinted-dark");
        expect(store.icon).toBe("tinted-dark");
        expect(store.applied).toBe("tinted-dark");
    });

    it("ignores a saved value outside the option allowlist", async () => {
        storage["lockasaur:app-icon"] = "../evil";
        const store = useAppIconStore();
        await store.init(true);
        expect(setIcon).not.toHaveBeenCalled();
        expect(store.icon).toBe("default");
    });

    it("persists a selection only when the main process accepts it", async () => {
        const store = useAppIconStore();
        await store.init(true);

        setIcon.mockResolvedValueOnce(false);
        await store.setIcon("dark");
        expect(store.icon).toBe("default");
        expect(storage["lockasaur:app-icon"]).toBeUndefined();

        await store.setIcon("dark");
        expect(store.icon).toBe("dark");
        expect(storage["lockasaur:app-icon"]).toBe("dark");
    });

    it("resolves auto from the effective theme and retargets on theme flips", async () => {
        const theme = useThemeStore();
        theme.mode = "light";
        const store = useAppIconStore();
        await store.init(true);

        await store.setIcon("auto");
        // Light appearance resolves to "default", which is already applied,
        // so the selection commits without an IPC round trip.
        expect(setIcon).not.toHaveBeenCalled();
        expect(store.icon).toBe("auto");
        expect(storage["lockasaur:app-icon"]).toBe("auto");

        // The App.vue watcher calls applyResolved when resolvedIcon changes.
        theme.mode = "dark";
        expect(store.resolvedIcon).toBe("dark");
        await store.applyResolved();
        expect(setIcon).toHaveBeenCalledWith("dark");
        expect(store.applied).toBe("dark");

        theme.mode = "light";
        await store.applyResolved();
        expect(setIcon).toHaveBeenCalledWith("default");
        expect(store.applied).toBe("default");
    });

    it("skips redundant applies for the already-applied icon", async () => {
        const store = useAppIconStore();
        await store.init(true);
        await store.applyResolved();
        await store.applyResolved();
        expect(setIcon).not.toHaveBeenCalled();
    });
});
