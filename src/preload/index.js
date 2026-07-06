import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("cryptox", {
    app: {
        getInfo: () => ipcRenderer.invoke("app:info")
    },
    window: {
        minimize: () => ipcRenderer.invoke("window:minimize"),
        close: () => ipcRenderer.invoke("window:close")
    },
    crypto: {
        encrypt: (file, password, operationId) => ipcRenderer.invoke("crypto:encrypt", { file: { path: file?.path }, password, operationId }),
        decrypt: (file, password, operationId) => ipcRenderer.invoke("crypto:decrypt", { file: { path: file?.path }, password, operationId }),
        cancel: operationId => ipcRenderer.invoke("crypto:cancel", operationId),
        onProgress: callback => {
            const listener = (_, payload) => callback(payload);
            ipcRenderer.on("crypto:progress", listener);
            return () => ipcRenderer.removeListener("crypto:progress", listener);
        },
        onStatus: callback => {
            const listener = (_, payload) => callback(payload);
            ipcRenderer.on("crypto:status", listener);
            return () => ipcRenderer.removeListener("crypto:status", listener);
        }
    },
    dialog: {
        openFiles: () => ipcRenderer.invoke("dialog:open-files")
    },
    menu: {
        onOpenFile: callback => {
            const listener = () => callback();
            ipcRenderer.on("menu:open-file", listener);
            return () => ipcRenderer.removeListener("menu:open-file", listener);
        },
        onAbout: callback => {
            const listener = () => callback();
            ipcRenderer.on("menu:about", listener);
            return () => ipcRenderer.removeListener("menu:about", listener);
        }
    },
    files: {
        ready: () => ipcRenderer.invoke("files:renderer-ready"),
        getPathForFile: file => webUtils.getPathForFile(file),
        confirmDeleteEncrypted: path => ipcRenderer.invoke("files:confirm-delete-encrypted", path),
        onOpenFile: callback => {
            const listener = (_, file) => callback(file);
            ipcRenderer.on("files:open-file", listener);
            return () => ipcRenderer.removeListener("files:open-file", listener);
        }
    },
    shell: {
        openExternal: url => ipcRenderer.invoke("shell:open-external", url)
    },
    log: {
        error: error => ipcRenderer.invoke("log:error", error && error.message ? error.message : error)
    }
});
