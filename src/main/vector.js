import { Transform } from "node:stream";

export default class IVector extends Transform {
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

    // An empty plaintext produces no cipher chunks at all, so _transform never
    // runs; the IV must still be emitted or the file would be missing it.
    _flush(cb) {
        if (!this.appended) {
            this.push(this.initVect);
            this.appended = true;
        }
        cb();
    }
}
