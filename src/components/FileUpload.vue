<template>
    <div>
        <input type="password" name="password" id="passwd" v-model="password" placeholder="Password">
        <br>
        <p>Encrypt File</p>
        <input id="input-file" type="file" class="hide" @change="encFile">

        <p>Encrypt File Multipart</p>
        <input id="input-file" type="file" class="hide" @change="encFileMp">

        <p>Decrypt File</p>
        <input id="dec-file" type="file" class="hide" @change="decFile">
        <br>
        <button @click="rebuildFile">Rebuild</button>
    </div>
</template>
<script>
import Crypto from "../crypto.js";
import Utils from "../utils.js";
import FileSlicer from "../fileslicer.js";
import Constants from "../constants.js";

var fs = require("fs");

export default {
    name: "fileupload",
    data: () => {
        return {
            password: "12345",
            crypto: null
        };
    },
    methods: {
        encFile: function (e) {
            let files = e.target.files;
            files.forEach(el => {
                try {
                    let df = Utils.splitFromPath(el);
                    let file = fs.readFileSync(el.path);

                    let base64 = Utils.extensionMetadata(new Buffer.from(file).toString("base64"), df.ext);
                    let encFile = this.crypto.encryptFile(base64);

                    let filewrite = df.path.concat("/" + df.filename).concat(".ctx");
                    fs.writeFileSync(filewrite, encFile.toString(), "utf-8");
                
                } catch(e) {
                    alert("There's an error with file operation.");
                    console.error(e);
                }
            });
        },
        encFileMp: function (e) {
            var files = e.target.files;
            var filelist = [];
            var df = null;

            files.forEach(file => {
                var dir = Utils.createTempFiles();
                df = Utils.splitFromPath(file);

                var fisl = new FileSlicer(file);
                var bytes = fisl.getSlices();

                bytes.forEach((el, index) => {
                    let filewrite = dir
                        .concat("/" + df.filename)
                        .concat("_" + index)
                        .concat(".ctx");
                    
                    filelist.push(filewrite);

                    FileSlicer.blobToBase64(el)
                        .then(result => {
                            let base64 = index==0 ? Utils.extensionMetadata(result, df.ext) : result;
                            var encrypted = this.crypto.encryptFile(base64);
                            fs.writeFileSync(filewrite, encrypted, "utf-8");

                            if (index == bytes.length - 1) {
                                let args = {
                                    "level": 9,
                                    "output": df.path_woext.concat(".ctx"),
                                    "list": filelist,
                                    "path": Constants.LNXTMP,
                                    "filename": df.filename
                                };
                                Utils.fileFusion(args);
                            }
                        });
                });
            });
        },
        decFile: function (e) {
            let files = e.target.files;
            files.forEach(el => {
                let df = Utils.splitFromPath(el);

                let encFile = fs.readFileSync(el.path);
                let base64 = this.crypto.decryptFile(encFile.toString());
                
                let b64Split = base64.split("::"); // Used for read metadata (ext)
                let ext = ".".concat(b64Split[1]);
                
                base64 = b64Split[b64Split.length - 1];
                fs.writeFile(df.path_woext + ext, base64, "base64", function(err) {
                    console.log(err);
                });
            });
        },
        rebuildFile: function () {
            let base64Array = [];
            let macrobyte = [];

            Utils.getFilesDir(Constants.LNXTMP)
                .then(files => {
                    files = files.sort((x, y) => parseInt(x.split("_")[1]) - parseInt(y.split("_")[1]));
                    files.forEach((el, i) => {
                        if (el.endsWith(".ctx")) {
                            console.log(`Reading ${el}...`);
                            let completePath = Constants.LNXTMP.concat("/" + el);
                            
                            // Group in base64 array
                            let b64file = fs.readFileSync(completePath);
                            let base64 = this.crypto.decryptFile(b64file.toString());
                            
                            if (i === 1) {
                                let b64Split = base64.split("::");
                                base64 = b64Split[b64Split.length - 1];
                            }

                            base64Array.push(base64);
                        }
                    });

                    for (let i in base64Array) {
                        var blob = FileSlicer.base64ToBlob(base64Array[i]);
                        if (macrobyte.length == 0) {
                            macrobyte = new Blob([blob], {type:"image/jpeg"});
                        }
                        else {
                            macrobyte = new Blob([macrobyte, blob], {type:"image/jpeg"});
                        }
                    }

                    console.log("Converting to file");

                    FileSlicer.blobToBase64(new File([macrobyte], "blobfile"))
                        .then(response => {
                            fs.writeFile("/Users/sam/Desktop/textfile.png", response, "base64", function(err) {
                                console.log(err);
                            });
                        });
                });
        }
    },
    beforeMount: function () {
        this.crypto = new Crypto(this.password);
    }
};
</script>