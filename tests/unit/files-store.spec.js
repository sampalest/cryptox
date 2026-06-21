import { createPinia, setActivePinia } from "pinia";
import { useFilesStore } from "@/store/files.js";

describe("files store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("stores and clears a pending file path", () => {
        const store = useFilesStore();

        store.setFiles("/tmp/example.ctx");
        expect(store.files).toBe("/tmp/example.ctx");

        store.clearFiles();
        expect(store.files).toBeNull();
    });
});
