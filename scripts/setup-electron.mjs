// Reliably install the Electron binary on macOS CI runners. The bundled
// installer is flaky here (intermittent 504s) and its extraction is unreliable
// (truncated dist/, no path.txt). Run install.js with retries just to populate
// the download cache, then re-extract the cached zip ourselves with ditto.
// macOS-only by design (uses the darwin cache path and `ditto`); the CI step is
// gated to macOS runners, and Windows/Linux use electron's normal download.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, globSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = path.join(rootDir, "node_modules", "electron");
const distDir = path.join(electronDir, "dist");
const executable = path.join(distDir, "Electron.app", "Contents", "MacOS", "Electron");
const cacheGlob = path.join(os.homedir(), "Library/Caches/electron/*/electron-v*-darwin-*.zip");

const cachedZip = () => globSync(cacheGlob).sort()[0];

for (let attempt = 1; attempt <= 5; attempt += 1) {
    const installed = spawnSync("node", [path.join(electronDir, "install.js")], { cwd: rootDir, stdio: "inherit" }).status === 0;
    if (installed || cachedZip()) {
        break;
    }
    console.log(`electron download attempt ${attempt} failed; retrying in 10s...`);
    await sleep(10000);
}

const zip = cachedZip();
if (!zip) {
    throw new Error("Electron zip not found in cache after retries");
}

// Distrust electron's own extraction, re-extract the cached zip ourselves.
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
execFileSync("ditto", ["-x", "-k", zip, distDir], { cwd: rootDir, stdio: "inherit" });
writeFileSync(path.join(electronDir, "path.txt"), "Electron.app/Contents/MacOS/Electron");
execFileSync("test", ["-x", executable]);

// APP-11: the mac x64 leg cross-compiles on the arm64 runner, and app-builder's
// own download of the target-arch Electron dist has no retry loop (it EOFs
// intermittently just like install.js above). Prefetch that zip ourselves,
// checksum-verified against SHASUMS256.txt, into the flat cache path
// electron-builder consults, so packaging never has to download.
const extraArch = process.env.ELECTRON_EXTRA_ARCH;
if (extraArch && extraArch !== process.arch) {
    const { version } = createRequire(import.meta.url)(path.join(electronDir, "package.json"));
    const zipName = `electron-v${version}-darwin-${extraArch}.zip`;
    const zipPath = path.join(os.homedir(), "Library/Caches/electron", zipName);
    const base = `https://github.com/electron/electron/releases/download/v${version}`;
    const fetchOk = async url => {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`download failed with status ${res.status}`);
        }
        return res;
    };

    let lastError = null;
    for (let attempt = 1; attempt <= 5 && !existsSync(zipPath); attempt += 1) {
        try {
            const sums = await (await fetchOk(`${base}/SHASUMS256.txt`)).text();
            const line = sums.split("\n").find(entry => entry.trim().endsWith(`*${zipName}`));
            if (!line) {
                throw new Error(`no published checksum for ${zipName}`);
            }
            const expected = line.trim().split(/\s+/)[0];
            const body = Buffer.from(await (await fetchOk(`${base}/${zipName}`)).arrayBuffer());
            const actual = createHash("sha256").update(body).digest("hex");
            if (actual !== expected) {
                throw new Error(`checksum mismatch for ${zipName}`);
            }
            mkdirSync(path.dirname(zipPath), { recursive: true });
            writeFileSync(zipPath, body);
            lastError = null;
        } catch (error) {
            lastError = error;
            console.log(`electron darwin-${extraArch} prefetch attempt ${attempt} failed; retrying in 10s...`);
            await sleep(10000);
        }
    }
    if (!existsSync(zipPath)) {
        throw lastError ?? new Error(`electron darwin-${extraArch} zip missing after retries`);
    }
}
