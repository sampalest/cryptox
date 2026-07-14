// Electron 43 downloads its binary on first use. Its bundled native ZIP
// extractor can fail to load on Windows ARM64, so the normal installer cannot
// unpack electron-v<version>-win32-arm64.zip. On that host only, download the
// official checksum-pinned archive through Electron's own @electron/get
// dependency and extract it with the pure-JavaScript unzipper package before
// Electron is imported. Other platform and architecture pairs keep Electron's
// normal path.
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import unzipper from "unzipper";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronPackageDir = path.join(rootDir, "node_modules", "electron");
const electronRequire = createRequire(path.join(electronPackageDir, "package.json"));
const { version } = electronRequire("./package.json");
const checksums = electronRequire("./checksums.json");

function isInstalled(installDir) {
    const pathFile = path.join(installDir, "path.txt");
    try {
        return readFileSync(pathFile, "utf8").trim() === "electron.exe"
            && existsSync(path.join(installDir, "dist", "electron.exe"));
    } catch {
        return false;
    }
}

async function downloadWindowsArm64() {
    const { downloadArtifact } = await import(pathToFileURL(electronRequire.resolve("@electron/get")).href);
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
            return await downloadArtifact({
                version,
                artifactName: "electron",
                platform: "win32",
                arch: "arm64",
                checksums,
                force: attempt > 1
            });
        } catch (error) {
            lastError = error;
            console.log(`electron win32-arm64 download attempt ${attempt} failed; retrying in 10s...`);
            await sleep(10000);
        }
    }
    throw lastError ?? new Error("Electron win32-arm64 archive missing after retries");
}

export async function ensureElectronForHost({
    platform = process.platform,
    arch = process.arch,
    installDir = electronPackageDir
} = {}) {
    if (platform !== "win32" || arch !== "arm64" || isInstalled(installDir)) return;

    const archive = await downloadWindowsArm64();
    const distDir = path.join(installDir, "dist");
    const stagingDir = path.join(installDir, "dist-installing");
    const pathFile = path.join(installDir, "path.txt");
    const cleanupOptions = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };
    rmSync(stagingDir, cleanupOptions);
    rmSync(distDir, cleanupOptions);
    rmSync(pathFile, { force: true });
    mkdirSync(distDir, { recursive: true });

    try {
        // Extract directly because Windows can reject a directory rename while
        // the newly written executable is still being inspected.
        await pipeline(createReadStream(archive), unzipper.Extract({ path: distDir }));
        if (!existsSync(path.join(distDir, "electron.exe"))) {
            throw new Error("Electron win32-arm64 archive did not contain electron.exe");
        }
        writeFileSync(pathFile, "electron.exe");
        console.log(`Electron ${version} win32-arm64 installed.`);
    } catch (error) {
        rmSync(distDir, cleanupOptions);
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    await ensureElectronForHost();
}
