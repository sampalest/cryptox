// Reliably install the Electron binary on macOS CI runners. Electron downloads
// on demand now, but GitHub intermittently returns 504s and its normal
// extraction has produced truncated dist directories on these runners. Use
// Electron's checksum-pinned downloader with retries, then extract with ditto.
// The CI step is gated to macOS; Windows and Linux download normally on demand.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = path.join(rootDir, "node_modules", "electron");
const distDir = path.join(electronDir, "dist");
const executable = path.join(distDir, "Electron.app", "Contents", "MacOS", "Electron");
const electronRequire = createRequire(path.join(electronDir, "package.json"));
const { version } = electronRequire("./package.json");
const checksums = electronRequire("./checksums.json");
const { downloadArtifact } = await import(pathToFileURL(electronRequire.resolve("@electron/get")).href);

async function downloadElectron(arch) {
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
            return await downloadArtifact({
                version,
                artifactName: "electron",
                platform: "darwin",
                arch,
                checksums,
                force: attempt > 1
            });
        } catch (error) {
            lastError = error;
            console.log(`electron darwin-${arch} download attempt ${attempt} failed; retrying in 10s...`);
            await sleep(10000);
        }
    }
    throw lastError ?? new Error(`Electron darwin-${arch} zip missing after retries`);
}

const zip = await downloadElectron(process.arch);

// Distrust electron's own extraction, re-extract the cached zip ourselves.
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
execFileSync("ditto", ["-x", "-k", zip, distDir], { cwd: rootDir, stdio: "inherit" });
writeFileSync(path.join(electronDir, "path.txt"), "Electron.app/Contents/MacOS/Electron");
execFileSync("test", ["-x", executable]);

// The mac x64 leg cross-compiles on the arm64 runner. Prefetch its exact,
// checksum-verified archive into the same cache electron-builder consults.
const extraArch = process.env.ELECTRON_EXTRA_ARCH;
if (extraArch && extraArch !== process.arch) {
    await downloadElectron(extraArch);
}
