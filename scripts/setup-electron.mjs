// Reliably install the Electron binary on macOS CI runners. The bundled
// installer is flaky here (intermittent 504s) and its extraction is unreliable
// (truncated dist/, no path.txt). Run install.js with retries just to populate
// the download cache, then re-extract the cached zip ourselves with ditto.
import { execFileSync, spawnSync } from "node:child_process";
import { globSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

// Distrust electron's own extraction — re-extract the cached zip ourselves.
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
execFileSync("ditto", ["-x", "-k", zip, distDir], { cwd: rootDir, stdio: "inherit" });
writeFileSync(path.join(electronDir, "path.txt"), "Electron.app/Contents/MacOS/Electron");
execFileSync("test", ["-x", executable]);
