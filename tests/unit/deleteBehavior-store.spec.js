import { createPinia, setActivePinia } from "pinia";
import { DELETE_MODES, useDeleteBehaviorStore } from "@/store/deleteBehavior.js";

describe("deleteBehavior store", () => {
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

    it("exposes the three fixed modes", () => {
        expect(DELETE_MODES.map(mode => mode.id)).toEqual(["trash", "permanent", "ask"]);
    });

    it("defaults to trash with both checkboxes off", () => {
        const store = useDeleteBehaviorStore();
        store.init();
        expect(store.mode).toBe("trash");
        expect(store.deleteOriginal).toBe(false);
        expect(store.deleteEncrypted).toBe(false);
        expect(store.usesCheckbox).toBe(true);
    });

    it("restores saved values on init", () => {
        storage["lockasaur:delete-mode"] = "ask";
        storage["lockasaur:delete-original"] = "1";
        storage["lockasaur:delete-encrypted"] = "1";
        const store = useDeleteBehaviorStore();
        store.init();
        expect(store.mode).toBe("ask");
        expect(store.deleteOriginal).toBe(true);
        expect(store.deleteEncrypted).toBe(true);
        expect(store.usesCheckbox).toBe(false);
    });

    it("falls back to trash when the saved mode is outside the allowlist", () => {
        storage["lockasaur:delete-mode"] = "shred";
        const store = useDeleteBehaviorStore();
        store.init();
        expect(store.mode).toBe("trash");
    });

    it("persists mode and checkbox selections", () => {
        const store = useDeleteBehaviorStore();
        store.init();
        store.setMode("permanent");
        store.setDeleteOriginal(true);
        store.setDeleteEncrypted(true);
        expect(storage["lockasaur:delete-mode"]).toBe("permanent");
        expect(storage["lockasaur:delete-original"]).toBe("1");
        expect(storage["lockasaur:delete-encrypted"]).toBe("1");
        store.setDeleteOriginal(false);
        expect(storage["lockasaur:delete-original"]).toBe("0");
    });

    it("ignores modes outside the allowlist", () => {
        const store = useDeleteBehaviorStore();
        store.init();
        store.setMode("shred");
        expect(store.mode).toBe("trash");
        expect(storage["lockasaur:delete-mode"]).toBeUndefined();
    });
});
