/* eslint-disable */
import Constants from "@/constants.js";
import FileManager from "@/filemanager.js";
const electron = require("electron");
const { app, Menu, dialog } = electron.remote;
const isMac = process.platform === "darwin";

export default {
    name: "sysevents",
    data: () => {
        return {};
    },
    methods: {
        initDockMenu() {
            const template = [
                {
                    label: "Open file",
                    click: () => {
                        this.onOpen();
                    }
                },
                { type: "separator" },
                {
                    label: "About...",
                    click: () => {
                        this.onRoute();
                    }
                }

            ]
			const dockMenu = Menu.buildFromTemplate(template);            
			app.dock.setMenu(dockMenu);
        },
        onRoute() {
            this.$router.push("/about");
        },
        onOpen() {
            const win = electron.remote.getCurrentWindow();
            dialog.showOpenDialog(win, {
                properties: ["openFile", "openDirectory"],
                filters: [{
                    name: "All Files", extensions: ["*"]
                }]
            })
            .then(files => {
                let fileList = [];
                let paths = files.filePaths;

                paths.forEach(path => {
                    fileList.push(new FileManager(path, name));
                });            
                this.selectFile(fileList);
                if (!files) return;
            });
        },
        initCustomMenu() {
            const macTemplate = [
                {
                    label: app.name,
                    submenu: [
                        {
                            label: "About Cryptox",
                            click: () => {
                                this.onRoute();
                            }
                        },
                        { type: "separator" },
                        { role: "hide" },
                        { role: "hideothers" },
                        { role: "unhide" },
                        { type: "separator" },
                        { role: "quit" }
                    ]
                },
                {
                    label: "File",
                    submenu: [
                        {
                            label: "Open File",
                            accelerator: "CmdOrCtrl+O",
                            click: () => { this.onOpen(); }
                        },
                    ]
                }
            ];
            
            const customMenu = Menu.buildFromTemplate(macTemplate);
            Menu.setApplicationMenu(customMenu);
        }
    },
    mounted() {
        this.$nextTick(() => {
            if (isMac) this.initDockMenu();
            this.initCustomMenu();
        });
    }
};