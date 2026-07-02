import fs from "node:fs";
import Path from "node:path";
import tar from "tar-fs";

export default class Utils {
    static zipDirectory(args) {
        const output = fs.createWriteStream(args.output);
        return new Promise((resolve, reject) => {
            try {
                output.on("close", () => resolve());
                tar.pack(args.path).pipe(output);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Rewrite an entry path so every segment is writable on Windows. Windows
     * cannot create files named after reserved DOS devices (CON, PRN, AUX, NUL,
     * COM1-9, LPT1-9, case-insensitive, with or without an extension) or ending
     * in a dot or space. A directory encrypted on macOS/Linux may hold such
     * names, so each offending segment is renamed (trailing dots/spaces dropped,
     * a "_" prefixed to a reserved base) instead of failing the whole extract.
     * Purely a Windows-writability rewrite, NOT a security control: it never adds
     * separators or "..", and traversal/absolute/type checks stay hard rejects in
     * _validateTarEntry. Applied only on win32 (see unzipDirectory), so extraction
     * on other platforms is unchanged. Kept platform-agnostic here so it is unit
     * testable everywhere.
     * @param {String} name tar entry path (segments separated by "/" or "\").
     * @return {String} A name whose segments are all writable on Windows.
     */
    static sanitizeReservedPath(name) {
        const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
        return name.split(/[\\/]/).map(segment => {
            if (segment === "" || segment === "." || segment === "..") return segment;
            let safe = segment.replace(/[. ]+$/, "");
            if (safe === "") safe = "_";
            if (reserved.test(safe)) safe = `_${safe}`;
            return safe;
        }).join("/");
    }

    /**
     * Validate a tar entry before it is written to disk. Only plain files and
     * directories are allowed; anything else (symlink, hardlink, devices, FIFO,
     * socket) and any name escaping the extraction root is rejected.
     * @param {String} root Extraction root directory (already resolved).
     * @param {Object} header tar entry header.
     * @return {Error|null} The rejection error, or null when the entry is safe.
     */
    static _validateTarEntry(root, header) {
        if (header.type !== "file" && header.type !== "directory") {
            return new Error(`Unsafe tar entry type "${header.type}" for "${header.name}"`);
        }
        if (Path.isAbsolute(header.name) || /^[a-zA-Z]:[\\/]/.test(header.name)) {
            return new Error(`Absolute path in tar entry "${header.name}"`);
        }
        if (header.name.split(/[\\/]/).includes("..")) {
            return new Error(`Path traversal in tar entry "${header.name}"`);
        }
        const resolved = Path.resolve(root, header.name);
        if (resolved !== root && !resolved.startsWith(root + Path.sep)) {
            return new Error(`Tar entry "${header.name}" resolves outside the output directory`);
        }
        return null;
    }

    /**
     * Safely extract a tar archive. Entries are validated (no traversal, no
     * absolute paths, no link/device/FIFO/socket types) and written to a fresh
     * temp directory next to the output, which is only moved into place once
     * the whole archive extracted cleanly. The extraction never merges into an
     * existing directory: if the output name got taken mid-extraction, the
     * result lands at a fresh "name (n)" variant instead.
     * @param {String} input Tar file path.
     * @param {String} output Output directory path.
     * @return {Promise.<void>}
     */
    static unzipDirectory(input, output) {
        const outputRoot = Path.resolve(output);
        // Same parent as the output so the final move never crosses filesystems.
        const tempRoot = fs.mkdtempSync(Path.join(Path.dirname(outputRoot), ".cryptox-extract-"));

        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(input);
            // On the first unsafe entry, remember the error and skip everything
            // after it; the whole extraction is rejected once the stream ends.
            // (Destroying the stream mid-entry would leak an unhandled error
            // from tar-stream's inner entry stream.)
            let entryError = null;
            const extractStream = tar.extract(tempRoot, {
                // tar-fs runs map, then its own win32 normalize (which rewrites a
                // drive-letter ":" to "_", erasing the evidence of an absolute
                // path), then ignore. So the security gate must run here in map on
                // the ORIGINAL name; validating in ignore would see the normalized
                // name and let Windows absolute paths (C:\...) slip through.
                map: header => {
                    if (!entryError) entryError = this._validateTarEntry(tempRoot, header);
                    // Then rename segments unwritable on Windows (reserved device
                    // names, trailing dot/space). Off win32 the name is untouched,
                    // so extraction stays byte-for-byte identical. This only ever
                    // makes a name safer, so the gate above still holds.
                    if (process.platform === "win32") {
                        header.name = this.sanitizeReservedPath(header.name);
                    }
                    return header;
                },
                ignore: () => entryError !== null
            });

            let settled = false;
            const fail = error => {
                if (settled) return;
                settled = true;
                readStream.destroy();
                this.rmRf(tempRoot);
                reject(error);
            };

            readStream.on("error", fail);
            extractStream.on("error", fail);
            extractStream.on("finish", () => {
                if (settled) return;
                if (entryError) return fail(entryError);
                settled = true;
                try {
                    // Merging into an existing directory would overwrite files
                    // inside it and could leave partial output if interrupted:
                    // re-resolve to a fresh name and move atomically instead.
                    const target = fs.existsSync(outputRoot)
                        ? this.uniquePath(outputRoot, true)
                        : outputRoot;
                    fs.renameSync(tempRoot, target);
                    resolve();
                } catch (error) {
                    this.rmRf(tempRoot);
                    reject(error);
                }
            });

            readStream.pipe(extractStream);
        });
    }

    static isDirectory(path) {
        return fs.lstatSync(path).isDirectory();
    }

    /**
     * Return desiredPath if nothing exists there, otherwise the first free
     * "name (n)" variant. For files the counter goes before the last extension
     * ("report.ctx" -> "report (1).ctx"); for directories it goes at the very
     * end ("mydir.v2" -> "mydir.v2 (1)"), since a dotted directory name has no
     * extension to preserve.
     * @param {String} desiredPath Wanted output path.
     * @param {Boolean} isDirectory Whether the output is a directory.
     * @return {String} A path that did not exist when checked.
     */
    static uniquePath(desiredPath, isDirectory = false) {
        if (!fs.existsSync(desiredPath)) return desiredPath;
        const parsed = Path.parse(desiredPath);
        const stem = isDirectory ? parsed.base : parsed.name;
        const ext = isDirectory ? "" : parsed.ext;
        for (let i = 1; i <= 10000; i++) {
            const candidate = Path.join(parsed.dir, `${stem} (${i})${ext}`);
            if (!fs.existsSync(candidate)) return candidate;
        }
        throw new Error(`could not find a free output name for ${desiredPath}`);
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
