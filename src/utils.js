import Constants from "./constants.js";

const fs = require("fs");
const archiver = require("archiver");
const filetype = require("file-type");

export default class Utils {
    static splitFromPath(el) {
        let splitPath = el.path.split(".");
        let extension = splitPath[splitPath.length - 1];
        let filename = el.name.substring(0, el.name.lastIndexOf("."));
        let lastIndex = el.path.lastIndexOf("/");
        let path = el.path.substring(0, lastIndex);

        return {
            "ext": extension,
            "filename": filename,
            "path": path,
            "path_woext": path + "/" + filename
        };
    }

    static extensionMetadata(base64, ext) {
        var b64ext = "::"
            .concat(ext + "::")
            .concat(base64);

        return b64ext;
    }

    static createTempFiles() {
        var dir = "";
        switch (process.platform) {
        case "darwin":
        case "linux":
            dir = Constants.LNXTMP;
            if (!fs.existsSync(dir)) fs.mkdir(dir, err => {
                if(err) console.log("error", err);
            });
            break;

        case "win32":
            break;
        }

        return dir;
    }

    static getFilesDir(dir) {
        return new Promise((resolve, reject) => {
            fs.readdir(dir, (err, filenames) => {
                if (err) {
                    console.error(err);
                    reject();
                }
                
                resolve(filenames);
            });
        });
    }

    static fileFusion(args) {
        /* 
        Function args:
            - Level: zlib level. Numeric
            - Output: Path and name to create zipfile.
            - List: File list you want to append. This list needs all path.
            - Filename: Filename in all parts.
        */
        try {
            var ok = true;
            var output = fs.createWriteStream(args.output);
            var archive = archiver("zip", {
                gzip: true,
                zlib: { level: args.level }
            });

            archive.pipe(output);
            args.list.forEach((el, index) => {
                let filename = args.filename.concat(`_${index}.ctx`);
                let file = fs.createReadStream(el);
                archive.append(file, {name: `${filename}.ctx`});
                // fs.unlinkSync(el);
            });

            archive.finalize();
        } catch (error) {
            console.error(error);
            ok = false;
        }

        return ok;

    }

    static isDirectory(path) {
        return fs.lstatSync(path).isDirectory();
    }

    static rmDir(path, callback) {
        fs.rmdir(path, callback);
    }

    static async getExtension(path) {
        let fileObj = await filetype.fromFile(path);
        return fileObj;
    }
}