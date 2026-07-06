import { defineStore } from "pinia";

// APP-12: appearance setting. "system" follows the OS via prefers-color-scheme
// (Electron keeps matchMedia in sync with nativeTheme), so no IPC is needed.
const STORAGE_KEY = "lockasaur:theme";
const MODES = ["light", "dark", "system"];

export const useThemeStore = defineStore("theme", {
    state: () => ({
        mode: "system",
        systemDark: false
    }),
    getters: {
        effectiveDark(state) {
            if (state.mode === "system") return state.systemDark;
            return state.mode === "dark";
        }
    },
    actions: {
        init() {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (MODES.includes(saved)) this.mode = saved;
            const media = window.matchMedia("(prefers-color-scheme: dark)");
            this.systemDark = media.matches;
            media.addEventListener("change", (event) => {
                this.systemDark = event.matches;
            });
        },
        setMode(mode) {
            if (!MODES.includes(mode)) return;
            this.mode = mode;
            localStorage.setItem(STORAGE_KEY, mode);
        }
    }
});
