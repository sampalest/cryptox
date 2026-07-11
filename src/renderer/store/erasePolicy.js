import { defineStore } from "pinia";
import Constants from "@shared/constants.js";

// Erase-after-failed-attempts policy applied to NEW encryptions. This store
// only remembers the user's choice; the policy itself is validated main-side
// (normalizeErasePolicy) and baked into the encrypted file's header.
const ENABLED_KEY = "lockasaur:erase-enabled";
const ATTEMPTS_KEY = "lockasaur:erase-attempts";

export const ERASE_ATTEMPT_OPTIONS = Constants.ERASE_ATTEMPT_OPTIONS;

export const useErasePolicyStore = defineStore("erasePolicy", {
    state: () => ({
        enabled: false,
        maxAttempts: Constants.ERASE_MAX_ATTEMPTS_DEFAULT
    }),
    getters: {
        // Fourth argument for window.lockasaur.crypto.encrypt.
        policyPayload(state) {
            return state.enabled ? { maxAttempts: state.maxAttempts } : undefined;
        }
    },
    actions: {
        init() {
            const attempts = Number(localStorage.getItem(ATTEMPTS_KEY));
            if (ERASE_ATTEMPT_OPTIONS.includes(attempts)) this.maxAttempts = attempts;
            this.enabled = localStorage.getItem(ENABLED_KEY) === "1";
        },
        // Segmented control: "off" or one of ERASE_ATTEMPT_OPTIONS. Enabling
        // from Off is gated by the native irreversible-loss warning; declining
        // it leaves the policy off and persists nothing.
        async choose(option) {
            if (option === "off") {
                this.enabled = false;
                localStorage.setItem(ENABLED_KEY, "0");
                return;
            }
            if (!ERASE_ATTEMPT_OPTIONS.includes(option)) return;
            if (!this.enabled) {
                const confirmed = await window.lockasaur.dialog.confirmErasePolicy();
                if (!confirmed) return;
                this.enabled = true;
                localStorage.setItem(ENABLED_KEY, "1");
            }
            this.maxAttempts = option;
            localStorage.setItem(ATTEMPTS_KEY, String(option));
        }
    }
});
