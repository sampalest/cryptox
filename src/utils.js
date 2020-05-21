import Constants from "./constants.js";

const fs = require("fs");
const filetype = require("file-type");
const Path = require("path");
const tar = require("tar-fs");

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
        const output = fs.createWriteStream(args.output);
        return new Promise((resolve, reject) => {
            try {
                output.on("close", () => resolve());
                tar.pack(args.path).pipe(output);

            } catch (error) {
                console.error(error);
                reject(error);
            }
        });
    }

    static unzipDirectory(input, output) {
        fs.createReadStream(input).pipe(tar.extract(output));
    }

    static isDirectory(path) {
        return fs.lstatSync(path).isDirectory();
    }

    static textToBuffer(text) {
        var bufferText = [];
        var buffer = new Buffer(text, "utf16le");
        for (var i = 0; i < buffer.length; i++) {
            bufferText.push(buffer[i]);
        }

        console.log(bufferText);
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

    static fillExtension(extension, bytenum = 8) {
        if (extension.length > bytenum) {
            return extension.substring(0, bytenum - 3).concat("...");
        }

        let extStr = "";
        let loop = Math.abs(bytenum - extension.length);
        for (let index = 0; index < loop; index++) {
            extStr += "*";
        }
        extStr += extension;

        return extStr;
    }
}