import FileManager from "@/filemanager.js";
import { useFilesStore } from "@/store/files.js";

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
        onRoute() {
            this.$router.push("/about");
        },
        async onOpen() {
            const paths = await window.cryptox.dialog.openFiles();
            if (paths && paths.length) {
                let fileList = [];
                paths.forEach(path => {
                    fileList.push(new FileManager(path));
                });
                this.selectFile(fileList);
            }
        },
        openFileListener() {
            this.unsubscribeOpenFile = window.cryptox.files.onOpenFile(file => {
                this.selectFile([new FileManager(file)]);
            });
        }
    },
    mounted() {
        this.unsubscribeMenuOpen = window.cryptox.menu.onOpenFile(this.onOpen);
        this.unsubscribeMenuAbout = window.cryptox.menu.onAbout(this.onRoute);
        this.openFileListener();
        window.cryptox.files.ready();
    },
    beforeUnmount() {
        if (this.unsubscribeMenuOpen) this.unsubscribeMenuOpen();
        if (this.unsubscribeMenuAbout) this.unsubscribeMenuAbout();
        if (this.unsubscribeOpenFile) this.unsubscribeOpenFile();
        useFilesStore().clearFiles();
    }
};
