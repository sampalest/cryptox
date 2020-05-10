/* eslint-disable */
const { Transform } = require("stream");

class IVector extends Transform {
    constructor(initVect, opts) {
        super(opts);
        this.initVect = initVect;
        this.appended = false;
    }

    _transform(chunk, encoding, cb) {
        if (!this.appended) {
            this.push(this.initVect);
            this.appended = true;
        }
        this.push(chunk);
        cb();        
    }
}

module.exports = IVector;