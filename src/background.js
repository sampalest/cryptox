"use strict";

import { app, protocol, BrowserWindow, Menu, dialog } from "electron";
import { createProtocol, /* installVueDevtools */ } from "vue-cli-plugin-electron-builder/lib";
const isDevelopment = process.env.NODE_ENV !== "production";

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{scheme: "app", privileges: { secure: true, standard: true } }]);

function createWindow () {
    // Create the browser window.
    win = new BrowserWindow({
        width: 700,
        height: 600,
        title: "Cryptox",
        icon: __dirname + "/src/assets/icons/Icon.icns",
        titleBarStyle: "hiddenInset",
        resizable: false,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true,
        }
    });

    if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
        win.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
        if (!process.env.IS_TEST) win.webContents.openDevTools();
    } else {
        createProtocol("app");
        // Load the index.html when not in development
        win.loadURL("app://./index.html");
    }

    win.on("closed", () => {
        win = null;
    });
}

function initCustomMenu() {
    const macTemplate = [
        {
            label: app.name,
            submenu: [
                { role: "about" },
                { type: "separator" },
                { role: "services" },
                { type: "separator" },
                { type: "separator" },
                {
                    label: "Configuration",
                    submenu: [
                        { label: "Remove after encrypt", type: "checkbox", checked: true }
                    ]
                },
                { type: "separator" },
                { role: "hide" },
                { role: "hideothers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" }
            ]
        },
        // {
        //     label: "File",
        //     submenu: [
        //         {
        //             label: "Open File",
        //             accelerator: "CmdOrCtrl+O",
        //             click () { openFile(); }
        //         },
        //     ]
        // },
        {
            label: "Help",
            submenu: [
                {
                    label: "About Cryptox",
                    click: () => { console.log("Copyright © 2020 Samuel Palomo Esteban"); }
                }
            ]
        }
    ];
    
    const customMenu = Menu.buildFromTemplate(macTemplate);
    Menu.setApplicationMenu(customMenu);
}

app.name = "Cryptox";
registerListeners();


if (process.platform === "darwin") {
    // To fix chrome-bug on MacOS
    app.commandLine.appendArgument("--enable-features=Metal");
}

// Quit when all windows are closed.
app.on("window-all-closed", () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow();
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
    if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    // Devtools extensions are broken in Electron 6.0.0 and greater
    // See https://github.com/nklayman/vue-cli-plugin-electron-builder/issues/378 for more info
    // Electron will not launch with Devtools extensions installed on Windows 10 with dark mode
    // If you are not using Windows 10 dark mode, you may uncomment these lines
    // In addition, if the linked issue is closed, you can upgrade electron and uncomment these lines
    // try {
    //   await installVueDevtools();
    // } catch (e) {
    //   console.error("Vue Devtools failed to install:", e.toString());
    // }

    }
    initCustomMenu();
    createWindow();
});

function registerListeners() {

	/**
	 * macOS: when someone drops a file to the not-yet running VSCode, the open-file event fires even before
	 * the app-ready event. We listen very early for open-file and remember this upon startup as path to open.
	 *
	 * @type {string[]}
	 */
	const macOpenFiles = [];
    global['macOpenFiles'] = macOpenFiles;
    app.on('will-finish-launching', function() {
        app.on('open-file', function (event, path) {
            event.preventDefault();
            console.log("start register");
            console.log(event);
            console.log(path);
            macOpenFiles.push(path);
        });
    });    

	/**
	 * macOS: react to open-url requests.
	 *
	 * @type {string[]}
	 */
	const openUrls = [];
	const onOpenUrl = function (event, url) {
		event.preventDefault();
		openUrls.push(url);
	};

	app.on('will-finish-launching', function () {
		app.on('open-url', onOpenUrl);
	});

	global['getOpenUrls'] = function () {
		app.removeListener('open-url', onOpenUrl);

		return openUrls;
	};
}

function openFile() {
    const files = dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: [{
            name: "ctx Files",
            extensions: ["ctx"]
        }]
    });

    if (!files) return;
}

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
    if (process.platform === "win32") {
        process.on("message", data => {
            if (data === "graceful-exit") {
                app.quit();
            }
        });
    } else {
        process.on("SIGTERM", () => {
            app.quit();
        });
    }
}
