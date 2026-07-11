import { defineStore } from "pinia";

// Crystal alert banners dropping in below the titlebar. One entry per message;
// each dismisses itself after DISMISS_MS, or earlier on click.
const DISMISS_MS = 5000;
let nextId = 0;

export const useToastStore = defineStore("toasts", {
    state: () => ({
        toasts: []
    }),
    actions: {
        show(kind, message) {
            const id = ++nextId;
            this.toasts.push({ id, kind, message });
            const timer = setTimeout(() => this.dismiss(id), DISMISS_MS);
            // Node returns a Timeout (unit tests); never keep the process alive for it.
            if (timer.unref) timer.unref();
        },
        error(message) {
            this.show("error", message);
        },
        warning(message) {
            this.show("warning", message);
        },
        info(message) {
            this.show("info", message);
        },
        dismiss(id) {
            this.toasts = this.toasts.filter(toast => toast.id !== id);
        }
    }
});
