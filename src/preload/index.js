import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("lockasaur", {
    app: {
        getInfo: () => ipcRenderer.invoke("app:info"),
        setIcon: iconId => ipcRenderer.invoke("app:set-icon", iconId)
    },
    window: {
        minimize: () => ipcRenderer.invoke("window:minimize"),
        close: () => ipcRenderer.invoke("window:close"),
        setSize: sizeId => ipcRenderer.invoke("window:set-size", sizeId)
    },
    crypto: {
        encrypt: (file, password, operationId, erasePolicy, expiration) => ipcRenderer.invoke("crypto:encrypt", {
            file: { path: file?.path },
            password,
            operationId,
            erasePolicy: erasePolicy ? { maxAttempts: erasePolicy.maxAttempts } : undefined,
            expiration: expiration ? { at: expiration.at } : undefined
        }),
        decrypt: (file, password, operationId, timeSource) => ipcRenderer.invoke("crypto:decrypt", {
            file: { path: file?.path },
            password,
            operationId,
            timeSource: timeSource ? {
                kind: timeSource.kind,
                host: timeSource.host,
                port: timeSource.port,
                failClosed: timeSource.failClosed === true
            } : undefined
        }),
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
        openFiles: kind => ipcRenderer.invoke("dialog:open-files", kind),
        confirmErasePolicy: () => ipcRenderer.invoke("dialog:confirm-erase-policy")
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
        isDirectory: path => ipcRenderer.invoke("files:is-directory", path),
        confirmDeleteEncrypted: (path, mode, requested) => ipcRenderer.invoke("files:confirm-delete-encrypted", path, mode, requested),
        confirmDeleteOriginal: (path, mode, requested) => ipcRenderer.invoke("files:confirm-delete-original", path, mode, requested),
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
