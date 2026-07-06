import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import Crypto from "@main/crypto.js";
import FileManager from "@shared/filemanager.js";
import TempManager from "@main/temp.js";

// Large-payload suite: generates ~1 GB inputs and verifies the UI contract
// (progress/status event stream) against real output visibility on disk.
// Excluded from test:unit; run with `npm run test:large`. Size is overridable
// for quicker local runs: CRYPTOX_LARGE_SIZE_MB=128 npm run test:large.
const SIZE_MB = parseInt(process.env.CRYPTOX_LARGE_SIZE_MB || "1024", 10);
const CHUNK_MB = 16;
const PASSWORD = "correct horse battery staple";

// KDF + streaming + fsync of SIZE_MB twice per test, on CI-grade disks.
jest.setTimeout(30 * 60 * 1000);

const metrics = [];

/** Write sizeMb of incompressible data and return its sha256. */
function writeLargeFile(filePath, sizeMb) {
    const chunk = crypto.randomBytes(CHUNK_MB * 1024 * 1024);
    const hash = crypto.createHash("sha256");
    const fd = fs.openSync(filePath, "w");
    try {
        for (let written = 0; written < sizeMb; written += CHUNK_MB) {
            fs.writeSync(fd, chunk);
            hash.update(chunk);
        }
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest("hex");
}

function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        fs.createReadStream(filePath)
            .on("data", chunk => hash.update(chunk))
            .on("end", () => resolve(hash.digest("hex")))
            .on("error", reject);
    });
}

/** Map of relative file path -> sha256, for directory round-trip checks. */
async function hashDirectory(dir, base = dir, out = {}) {
    for (const name of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
            await hashDirectory(full, base, out);
        } else {
            out[path.relative(base, full).split(path.sep).join("/")] = await hashFile(full);
        }
    }
    return out;
}

/**
 * Capture the exact event stream the renderer receives (background.js relays
 * onProgress/onStatus 1:1 over crypto:progress/crypto:status), with the
 * visibility of the final output path sampled at every progress event.
 */
function recordUi(finalPath) {
    const t0 = Date.now();
    const progress = [];
    const statuses = [];
    return {
        progress,
        statuses,
        events: {
            onProgress: value => progress.push({ t: Date.now() - t0, value, visible: fs.existsSync(finalPath) }),
            onStatus: status => statuses.push({ t: Date.now() - t0, status })
        }
    };
}

/** The UI contract: 100% only once the output is visible at its final path. */
function assertUiContract({ progress, statuses }, requiredMsgs) {
    expect(progress.length).toBeGreaterThan(1);
    progress.slice(0, -1).forEach(event => {
        expect(event.value).toBeLessThanOrEqual(99);
        expect(event.visible).toBe(false);
    });
    const last = progress[progress.length - 1];
    expect(last.value).toBe(100);
    expect(last.visible).toBe(true);

    const msgs = statuses.map(event => event.status.msg).filter(Boolean);
    requiredMsgs.forEach(msg => expect(msgs).toContain(msg));
    // Every indeterminate phase must be closed before completion.
    expect(statuses[statuses.length - 1].status).toEqual({ loader: false });
}

/** Duration of the indeterminate phase opened by the given status message. */
function phaseMs(statuses, msg) {
    const start = statuses.findIndex(event => event.status.msg === msg);
    if (start === -1) return null;
    const end = statuses.slice(start + 1).find(event => event.status.loader === false);
    return end ? end.t - statuses[start].t : null;
}

function recordMetrics(label, totalMs, ui) {
    metrics.push({
        label,
        totalMs,
        kdfMs: phaseMs(ui.statuses, "Preparing secure key..."),
        tarMs: phaseMs(ui.statuses, "Reading files..."),
        finishingMs: phaseMs(ui.statuses, "Saving file..."),
        extractMs: phaseMs(ui.statuses, "Extracting files..."),
        progressEvents: ui.progress.length
    });
}

describe(`large payloads (${SIZE_MB} MB) on ${process.platform}`, () => {
    let workDir;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cryptox-large-"));
    });

    afterEach(() => {
        TempManager.releaseAll();
        fs.rmSync(workDir, { force: true, recursive: true });
    });

    afterAll(() => {
        const lines = [
            `### Cryptox large payload metrics (${SIZE_MB} MB, ${process.platform} ${os.arch()}, Node ${process.version})`,
            "",
            "| Operation | Total | KDF | Tar | Finishing | Extract | Progress events |",
            "| --- | --- | --- | --- | --- | --- | --- |",
            ...metrics.map(m => {
                const cell = ms => (ms === null ? "n/a" : `${ms} ms`);
                return `| ${m.label} | ${cell(m.totalMs)} | ${cell(m.kdfMs)} | ${cell(m.tarMs)} | ${cell(m.finishingMs)} | ${cell(m.extractMs)} | ${m.progressEvents} |`;
            }),
            ""
        ];
        console.log(lines.join("\n"));
        if (process.env.CRYPTOX_METRICS_FILE) {
            fs.writeFileSync(process.env.CRYPTOX_METRICS_FILE, lines.join("\n"));
        }
    });

    it("encrypts and decrypts a large file honoring the UI contract", async () => {
        const sourcePath = path.join(workDir, "big.bin");
        const encryptedPath = path.join(workDir, "big.dino");
        const sourceHash = writeLargeFile(sourcePath, SIZE_MB);

        const encryptUi = recordUi(encryptedPath);
        let started = Date.now();
        await new Crypto(PASSWORD).encrypt(new FileManager(sourcePath), { value: 0 }, {}, encryptUi.events);
        recordMetrics("file encrypt", Date.now() - started, encryptUi);

        assertUiContract(encryptUi, ["Preparing secure key...", "Saving file..."]);
        expect(fs.statSync(encryptedPath).size).toBeGreaterThan(SIZE_MB * 1024 * 1024);

        // Round trip: the restored file must be visible only at 100% and
        // match the original bit for bit.
        fs.unlinkSync(sourcePath);
        const decryptUi = recordUi(sourcePath);
        started = Date.now();
        await new Crypto(PASSWORD).decrypt(new FileManager(encryptedPath), { value: 0 }, decryptUi.events);
        recordMetrics("file decrypt", Date.now() - started, decryptUi);

        assertUiContract(decryptUi, ["Preparing secure key...", "Saving file..."]);
        expect(await hashFile(sourcePath)).toBe(sourceHash);
    });

    it("encrypts and decrypts a large folder honoring the UI contract", async () => {
        const sourceDir = path.join(workDir, "big-folder");
        const encryptedPath = path.join(workDir, "big-folder.dino");
        fs.mkdirSync(path.join(sourceDir, "nested"), { recursive: true });
        const partMb = Math.max(CHUNK_MB, Math.floor(SIZE_MB / 4));
        const hashes = {
            "part-0.bin": writeLargeFile(path.join(sourceDir, "part-0.bin"), partMb),
            "part-1.bin": writeLargeFile(path.join(sourceDir, "part-1.bin"), partMb),
            "nested/part-2.bin": writeLargeFile(path.join(sourceDir, "nested", "part-2.bin"), partMb),
            "nested/part-3.bin": writeLargeFile(path.join(sourceDir, "nested", "part-3.bin"), partMb)
        };

        const encryptUi = recordUi(encryptedPath);
        let started = Date.now();
        await new Crypto(PASSWORD).encrypt(new FileManager(sourceDir), { value: 0 }, {}, encryptUi.events);
        recordMetrics("folder encrypt", Date.now() - started, encryptUi);

        assertUiContract(encryptUi, ["Reading files...", "Preparing secure key...", "Saving file..."]);

        // Round trip: extraction happens during the "Extracting files..."
        // phase, and 100% is only reported once it completed.
        fs.rmSync(sourceDir, { force: true, recursive: true });
        const decryptUi = recordUi(sourceDir);
        started = Date.now();
        await new Crypto(PASSWORD).decrypt(new FileManager(encryptedPath), { value: 0 }, decryptUi.events);
        recordMetrics("folder decrypt", Date.now() - started, decryptUi);

        // Streaming progress events all precede extraction, so the output
        // directory must be invisible for every event but the final 100%.
        assertUiContract(decryptUi, ["Preparing secure key...", "Extracting files..."]);
        expect(await hashDirectory(sourceDir)).toEqual(hashes);
    });
});
