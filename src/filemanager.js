class FileManager {
    constructor(path) {
        let pathSplit = path.split("/");
        this.path = path;
        this.name = pathSplit[pathSplit.length - 1];
    }

    extension() {
        let nameSplit = this.name.split(".");
        return nameSplit[nameSplit.length - 1];
    }
}

export default FileManager;