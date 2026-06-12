import { defineStore } from "pinia";

export const useFilesStore = defineStore("files", {
    state: () => ({
        files: null
    }),
    actions: {
        setFiles(files) {
            this.files = files;
        },
        clearFiles() {
            this.files = null;
        }
    }
});
