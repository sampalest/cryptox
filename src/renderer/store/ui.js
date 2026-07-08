import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", {
    state: () => ({
        aboutOpen: false,
        settingsOpen: false,
        binaryRainActive: false,
        dropOpen: false
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
            this.binaryRainActive = false;
        },
        showDrop() {
            this.dropOpen = true;
        },
        hideDrop() {
            this.dropOpen = false;
        },
        startBinaryRain() {
            this.binaryRainActive = true;
        },
        stopBinaryRain() {
            this.binaryRainActive = false;
        }
    }
});
