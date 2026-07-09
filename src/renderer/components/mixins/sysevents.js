import FileManager from "@shared/filemanager.js";
import { useFilesStore } from "@/store/files.js";
import { useUiStore } from "@/store/ui.js";

export default {
    name: "sysevents",
    data: () => {
        return {
            unsubscribeMenuOpen: null,
            unsubscribeMenuAbout: null,
            unsubscribeOpenFile: null
        };
    },
    methods: {
        // About is an in-window overlay now, not a route (menu:about channel
        // unchanged).
        onRoute() {
            useUiStore().openAbout();
        },
        // kind "files" (default, also what the macOS menu sends) or "folder";
        // on Windows/Linux the native dialog cannot mix files and folders in
        // one picker, so Home offers a button per kind there. On macOS the
        // "files" dialog picks both, so Home shows a single merged button.
        async onOpen(kind = "files") {
            const entries = await window.lockasaur.dialog.openFiles(kind);
            if (entries && entries.length) {
                this.selectFile(entries.map(entry => new FileManager(entry.path, entry.isDirectory)));
            }
        },
        openFileListener() {
            // macOS open-file events deliver a bare path; resolve the
            // directory flag through the bridge for the chip icon.
            this.unsubscribeOpenFile = window.lockasaur.files.onOpenFile(async file => {
                const isDirectory = await window.lockasaur.files.isDirectory(file);
                this.selectFile([new FileManager(file, isDirectory)]);
            });
        }
    },
    mounted() {
        this.unsubscribeMenuOpen = window.lockasaur.menu.onOpenFile(this.onOpen);
        this.unsubscribeMenuAbout = window.lockasaur.menu.onAbout(this.onRoute);
        this.openFileListener();
        window.lockasaur.files.ready();
    },
    beforeUnmount() {
        if (this.unsubscribeMenuOpen) this.unsubscribeMenuOpen();
        if (this.unsubscribeMenuAbout) this.unsubscribeMenuAbout();
        if (this.unsubscribeOpenFile) this.unsubscribeOpenFile();
        useFilesStore().clearFiles();
    }
};
