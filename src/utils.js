import Constants from "./constants.js";

const fs = require("fs");
const archiver = require("archiver");
const filetype = require("file-type");
const Path = require("path");

export default class Utils {
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

    static zipDirectory(args) {
        const archive = archiver("zip", { zlib: { level: args.level }});
        const output = fs.createWriteStream(args.output);
    
        return new Promise((resolve, reject) => {
            output.on("close", () => resolve());
            archive.on("error", err => { reject(err); });
            
            archive.pipe(output);
            let files = fs.readdirSync(args.path);
            files.forEach(el => {
                let file = fs.createReadStream(`${args.path}/${el}`);
                archive.append(file, { name: el });
            });
            archive.finalize();
        });

    }

    static isDirectory(path) {
        return fs.lstatSync(path).isDirectory();
    }

    static rmDir(path, callback) {
        fs.rmdir(path, callback);
    }

    static rmRf(path) {
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach(file => {
                const currentPath = Path.join(path, file);
                if (fs.lstatSync(currentPath).isDirectory()) {
                    this.rmRf(currentPath);
                }
                else {
                    fs.unlinkSync(currentPath);
                }
            });
            fs.rmdirSync(path);
        }
    }

    static async getExtension(path) {
        let fileObj = await filetype.fromFile(path);
        return fileObj;
    }
}