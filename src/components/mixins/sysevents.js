const { app, shell, Menu } = require("electron").remote;
const isMac = process.platform === "darwin";

export default {
    name: "sysevents",
    data: () => {
        return {};
    },
    methods: {
        initDockMenu() {
			const dockMenu = Menu.buildFromTemplate([{
				label: "About...",
				click: () => {
                    shell.openExternal("https://github.com/Samuelpe/cryptox");
                }
            }]);
            
			app.dock.setMenu(dockMenu);
        }
    },
    mounted() {
        this.$nextTick(() => {
            if (isMac) this.initDockMenu();
        });
    }
};