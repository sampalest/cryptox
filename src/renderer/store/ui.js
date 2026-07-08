import { defineStore } from "pinia";

// In-window overlay visibility (About and Settings glass sheets).
// binaryRainActive drives the easter-egg rain overlay (hold the Home dino).
export const useUiStore = defineStore("ui", {
    state: () => ({
        aboutOpen: false,
        settingsOpen: false,
        binaryRainActive: false
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
        startBinaryRain() {
            this.binaryRainActive = true;
        },
        stopBinaryRain() {
            this.binaryRainActive = false;
        }
    }
});
