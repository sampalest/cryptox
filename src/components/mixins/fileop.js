import Crypto from "../../crypto.js";
import Utils from "../../utils.js";
import Constants from "../../constants.js";
import FileSlicer from "../../fileslicer.js";
const fs = require("fs");

export default {
	name: "file-operations",
	data: () => {
		return {
			crypto: null,
			finish: false
		};
	},
    methods: {
		encryptBytes(bytes, dir, df) {
			return new Promise(resolve => {
				const slices = bytes.length;
				var processed = 0;
				var filelist = [];

				bytes.forEach((el, index) => {
					let filewrite = `${dir}/${df.filename}_${index}.ctx`;
					filelist.push(filewrite);
					FileSlicer.blobToBase64(el).then(result => {
						let base64 = index==0 ? Utils.extensionMetadata(result, df.ext) : result;
						this.crypto.encryptFile(base64).then(encrypted => {
							fs.writeFile(filewrite, encrypted, () => {
								if (index == bytes.length - 1) {
									let args = {
										"level": 9,
										"output": df.path_woext.concat(".ctx"),
										"list": filelist,
										"path": Constants.LNXTMP,
										"filename": df.filename
									};
									resolve(args);
								}
							});
							processed++;
							this.percent = parseInt(processed / slices * 100);
							console.log(`PERCENT ${this.perc}`);
						});
					});
				});
			});
		},
        encryptTempFiles() {
			try {
				this.crypto = new Crypto(this.password);
				let df = null;

				this.files.forEach((file, i) => {
					df = Utils.splitFromPath(file);
					let dir = Utils.createTempFiles();
					let fisl = new FileSlicer(file);
					let bytes = fisl.getSlices();
					this.encryptBytes(bytes, dir, df).then(args =>{
						Utils.fileFusion(args);
						if (i == this.files.length - 1) this.finish = true;
					});
				});
				
			} catch (error) {
				alert("Encryption error.");
				console.error(error);
				this.error = true;
			}
        },
        encryptFiles() {
            this.encryptTempFiles();
        }
    }
};
