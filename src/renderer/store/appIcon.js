import { defineStore } from "pinia";
import { useThemeStore } from "@/store/theme";

// The macOS Dock icon choice. The concrete ids mirror ipcValidation's
// APP_ICON_IDS allowlist and the PNGs written to public/appicons: the six
// appearance variants come from scripts/generate-appicon.mjs, and "locked"
// (the padlock-dino) from scripts/generate-icons.mjs (build/icon.svg).
// "auto" is renderer-only: it resolves to "dark" or "default"
// from the theme store's effective appearance and never crosses the bridge
// (App.vue watches resolvedIcon so an auto selection follows theme changes
// live). "default" means the bundle icon, which macOS 26+ keeps
// appearance-aware via Assets.car, so it is applied by resetting rather than
// by setting an image.
const STORAGE_KEY = "lockasaur:app-icon";

export const APP_ICONS = [
    { id: "auto", label: "Auto" },
    { id: "default", label: "Default" },
    { id: "dark", label: "Dark" },
    { id: "clear-light", label: "Clear Light" },
    { id: "clear-dark", label: "Clear Dark" },
    { id: "tinted-light", label: "Tinted Light" },
    { id: "tinted-dark", label: "Tinted Dark" },
    { id: "locked", label: "Locked" }
];

const ICON_OPTION_IDS = new Set(APP_ICONS.map(icon => icon.id));

export const useAppIconStore = defineStore("appIcon", {
    state: () => ({
        icon: "default",
        applied: "default",
        // Set from the platform in init(); everything no-ops off macOS.
        supported: false
    }),
    getters: {
        resolvedIcon(state) {
            if (state.icon !== "auto") return state.icon;
            return useThemeStore().effectiveDark ? "dark" : "default";
        }
    },
    actions: {
        async init(supported) {
            this.supported = Boolean(supported);
            if (!this.supported) return;
            const saved = localStorage.getItem(STORAGE_KEY);
            if (ICON_OPTION_IDS.has(saved)) this.icon = saved;
            await this.applyResolved();
        },
        async setIcon(id) {
            if (!ICON_OPTION_IDS.has(id) || id === this.icon) return;
            const previous = this.icon;
            this.icon = id;
            if (await this.applyResolved()) {
                localStorage.setItem(STORAGE_KEY, id);
            } else {
                this.icon = previous;
            }
        },
        async applyResolved() {
            if (!this.supported) return false;
            const target = this.resolvedIcon;
            if (target === this.applied) return true;
            if (!(await window.lockasaur.app.setIcon(target))) return false;
            this.applied = target;
            return true;
        }
    }
});
