import { Promise } from "core-js";

export default class FileSlicer {
    constructor(file, size=128) {
        this.file = file;
        this.sliceSize = size * size;
        this.currentSlice = 0;
    }

    getNextSlice() {
        var start = this.currentSlice * this.sliceSize;
        var end = Math.min((this.currentSlice + 1) * this.sliceSize, this.file.size);
        ++this.currentSlice;
        
        return this.file.slice(start, end);
    }

    getSlices() {
        var complete_slices =  [];
        var slices = Math.ceil(this.file.size / this.sliceSize);

        for (var i = 0; i < slices; i++) {
            complete_slices[i] = this.getNextSlice();
        }

        return complete_slices;
    }

    static blobToByte(blob) {
        var fr = new FileReader();
        return new Promise(resolve => {
            fr.onload = el => {
                let arrayBuffer = el.target.result;
                resolve(arrayBuffer);
            };

            fr.readAsArrayBuffer(blob);
        });
    }

    static blobToBase64(blob) {
        return new Promise(resolve => {
            var reader = new FileReader();
            reader.onload = () => {
                var dataUrl = reader.result;
                var base64 = dataUrl.split(",")[1];
                resolve(base64);
            };

            reader.readAsDataURL(blob);
        });
    }

    static base64ToBlob (base64) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
    
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
    
        const byteArray = new Uint8Array(byteNumbers);

        return new Blob([byteArray], {type:"image/jpg"});
    }
}