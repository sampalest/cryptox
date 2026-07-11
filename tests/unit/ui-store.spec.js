import { createPinia, setActivePinia } from "pinia";
import { useUiStore } from "@/store/ui.js";

describe("ui store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("opens settings from the main view", () => {
        const store = useUiStore();

        store.toggleSettings();

        expect(store.settingsOpen).toBe(true);
        expect(store.aboutOpen).toBe(false);
    });

    it("dismisses settings when toggled again", () => {
        const store = useUiStore();
        store.openSettings();
        store.binaryRainActive = true;

        store.toggleSettings();

        expect(store.settingsOpen).toBe(false);
        expect(store.aboutOpen).toBe(false);
        expect(store.binaryRainActive).toBe(false);
    });

    it("switches from about to settings", () => {
        const store = useUiStore();
        store.openAbout();

        store.toggleSettings();

        expect(store.settingsOpen).toBe(true);
        expect(store.aboutOpen).toBe(false);
    });
});
