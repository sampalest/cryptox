import { defineStore } from "pinia";

// APP-12: in-window overlay visibility (About and Settings glass sheets).
export const useUiStore = defineStore("ui", {
    state: () => ({
        aboutOpen: false,
        settingsOpen: false
    }),
    actions: {
        openAbout() {
            this.settingsOpen = false;
            this.aboutOpen = true;
        },
        openSettings() {
            this.aboutOpen = false;
            this.settingsOpen = true;
        },
        closeOverlays() {
            this.aboutOpen = false;
            this.settingsOpen = false;
        }
    }
});
