import Constants from "./constants.js";
var fs = require("fs");
var archiver = require("archiver");

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
            - Level: zlib level.
            - Output: Path and name to create zipfile.
            - List: File list you want to append. This list only needs filename.
            - Path: Pathg where you read files.
        */
        var output = fs.createWriteStream(args.output);
        var archive = archiver("zip", {
            gzip: true,
            zlib: { level: args.level }
        });

        archive.pipe(output);
        args.list.forEach(el => {
            let file = args.path.concat("/" + el);
            archive.file(file, {name: el});
        });
        archive.finalize();
    }
}