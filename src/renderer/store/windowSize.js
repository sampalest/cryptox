import { defineStore } from "pinia";

// The fixed window-size choice. Ids mirror ipcValidation's WINDOW_SIZE_IDS
// allowlist; the main process maps each id to a preset (bounds plus zoom
// factor), so no dimensions ever cross the bridge. The zoom resets on every
// launch, which is why init() reapplies the saved choice through IPC even
// though the value itself is persisted renderer-side.
const STORAGE_KEY = "lockasaur:window-size";

export const WINDOW_SIZES = [
    { id: "default", label: "Default" },
    { id: "l", label: "L" },
    { id: "xl", label: "XL" }
];

const SIZE_OPTION_IDS = new Set(WINDOW_SIZES.map(size => size.id));

export const useWindowSizeStore = defineStore("windowSize", {
    state: () => ({
        size: "default",
        applied: "default"
    }),
    actions: {
        async init() {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (SIZE_OPTION_IDS.has(saved)) this.size = saved;
            // A failed apply (e.g. the saved preset no longer fits the
            // current display) leaves the app at the default size.
            if (!(await this.apply()) && this.size !== "default") {
                this.size = "default";
            }
        },
        async setSize(id) {
            if (!SIZE_OPTION_IDS.has(id) || id === this.size) return;
            const previous = this.size;
            this.size = id;
            if (await this.apply()) {
                localStorage.setItem(STORAGE_KEY, id);
            } else {
                this.size = previous;
            }
        },
        // Pushes the selection to the main process. Only commits `applied`
        // when the main process accepted the preset.
        async apply() {
            if (this.size === this.applied) return true;
            if (!(await window.lockasaur.window.setSize(this.size))) return false;
            this.applied = this.size;
            return true;
        }
    }
});
