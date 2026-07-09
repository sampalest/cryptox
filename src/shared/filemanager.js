class FileManager {
    constructor(path, isDirectory = false) {
        // Split on both separators so Windows paths resolve correctly too. This
        // module is shared with the sandboxed renderer, so node:path.basename is
        // unavailable here; sanitizeName in format.js stays the security backstop.
        let pathSplit = path.split(/[\\/]/);
        this.path = path;
        this.name = pathSplit[pathSplit.length - 1];
        // UI-only hint (chip icon); crypto paths stat the source themselves.
        this.isDirectory = Boolean(isDirectory);
    }

    extension() {
        let nameSplit = this.name.split(".");
        return nameSplit[nameSplit.length - 1];
    }
}

export default FileManager;