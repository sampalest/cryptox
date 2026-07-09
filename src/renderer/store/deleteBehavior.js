import { defineStore } from "pinia";

// What happens to the source file after a successful operation. The mode is
// enforced main-side (normalizeDeleteMode); this store only remembers the
// user's choice and the two checkbox states.
const MODE_KEY = "lockasaur:delete-mode";
const ORIGINAL_KEY = "lockasaur:delete-original";
const ENCRYPTED_KEY = "lockasaur:delete-encrypted";

export const DELETE_MODES = [
    { id: "trash", label: "Trash" },
    { id: "permanent", label: "Permanent" },
    { id: "ask", label: "Ask" }
];

const MODE_IDS = DELETE_MODES.map(mode => mode.id);

export const useDeleteBehaviorStore = defineStore("deleteBehavior", {
    state: () => ({
        mode: "trash",
        deleteOriginal: false,
        deleteEncrypted: false
    }),
    getters: {
        usesCheckbox(state) {
            return state.mode !== "ask";
        }
    },
    actions: {
        init() {
            const saved = localStorage.getItem(MODE_KEY);
            if (MODE_IDS.includes(saved)) this.mode = saved;
            this.deleteOriginal = localStorage.getItem(ORIGINAL_KEY) === "1";
            this.deleteEncrypted = localStorage.getItem(ENCRYPTED_KEY) === "1";
        },
        setMode(mode) {
            if (!MODE_IDS.includes(mode)) return;
            this.mode = mode;
            localStorage.setItem(MODE_KEY, mode);
        },
        setDeleteOriginal(value) {
            this.deleteOriginal = Boolean(value);
            localStorage.setItem(ORIGINAL_KEY, this.deleteOriginal ? "1" : "0");
        },
        setDeleteEncrypted(value) {
            this.deleteEncrypted = Boolean(value);
            localStorage.setItem(ENCRYPTED_KEY, this.deleteEncrypted ? "1" : "0");
        }
    }
});
