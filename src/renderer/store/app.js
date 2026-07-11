import { defineStore } from "pinia";

let infoPromise = null;

export const useAppStore = defineStore("app", {
    state: () => ({
        platform: null
    }),
    getters: {
        isMac: state => state.platform === "darwin",
        isFrameless: state => state.platform === "win32" || state.platform === "linux"
    },
    actions: {
        load() {
            if (!infoPromise) {
                infoPromise = window.lockasaur.app.getInfo();
            }
            return infoPromise.then(info => {
                this.platform = info.platform;
            });
        }
    }
});
