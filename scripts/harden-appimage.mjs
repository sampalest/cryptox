// APP-11: post-process built AppImages so the wrapper in
// build/appimage/AppRun.sh becomes the entry point (the original generated
// AppRun is kept as AppRun.orig and exec'd by the wrapper). The wrapper
// handles the Ubuntu 24.04+ user-namespace restriction with a one-time
// AppArmor profile install instead of Chromium's sandbox FATAL.
//
// The AppImage layout is the launcher runtime ELF followed by a squashfs at
// the ELF's end. The runtime bytes of the input artifact are reused verbatim,
// so the only external tools needed are unsquashfs/mksquashfs. When those are
// missing the script skips with a warning unless CRYPTOX_REQUIRE_APPIMAGE_HARDEN
// is set (CI sets it on Linux legs so artifacts can never ship unhardened).
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, openSync, writeSync, closeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist_electron");
const wrapperPath = path.join(rootDir, "build", "appimage", "AppRun.sh");

const toolAvailable = tool => spawnSync(tool, ["-version"], { stdio: "ignore" }).status !== null;

// The squashfs payload starts exactly where the runtime ELF ends
// (mksquashfs -offset in electron-builder); compute that end from the
// section header table and verify the squashfs magic sits there.
function runtimeLength(buf) {
    if (buf.readUInt32BE(0) !== 0x7f454c46 || buf[4] !== 2 || buf[5] !== 1) {
        throw new Error("not a 64-bit little-endian ELF launcher");
    }
    const shoff = buf.readBigUInt64LE(0x28);
    const shentsize = buf.readUInt16LE(0x3a);
    const shnum = buf.readUInt16LE(0x3c);
    const end = Number(shoff + BigInt(shentsize * shnum));
    if (buf.toString("latin1", end, end + 4) !== "hsqs") {
        throw new Error("squashfs payload not found at the runtime boundary");
    }
    return end;
}

function hardenOne(artifact) {
    const buf = readFileSync(artifact);
    const offset = runtimeLength(buf);
    const runtime = buf.subarray(0, offset);
    const workDir = mkdtempSync(path.join(os.tmpdir(), "cryptox-appimage-"));
    try {
        const treeDir = path.join(workDir, "squashfs-root");
        execFileSync("unsquashfs", ["-o", String(offset), "-d", treeDir, artifact], { stdio: ["ignore", "ignore", "inherit"] });

        const appRun = path.join(treeDir, "AppRun");
        const appRunOrig = path.join(treeDir, "AppRun.orig");
        if (existsSync(appRunOrig)) {
            console.log(`harden-appimage: ${path.basename(artifact)} already hardened, skipping`);
            return;
        }
        renameSync(appRun, appRunOrig);
        cpSync(wrapperPath, appRun);
        chmodSync(appRun, 0o755);
        chmodSync(appRunOrig, 0o755);

        // Mirror the mksquashfs arguments electron-builder uses, then write
        // the original runtime over the zero padding created by -offset. The
        // output is staged next to the artifact so the final rename stays on
        // one filesystem (rename across mounts fails with EXDEV).
        const output = `${artifact}.harden-part`;
        try {
            execFileSync("mksquashfs", [treeDir, output, "-offset", String(offset), "-all-root", "-noappend", "-no-progress", "-quiet", "-no-xattrs", "-no-fragments"], { stdio: ["ignore", "ignore", "inherit"] });
            const fd = openSync(output, "r+");
            try {
                writeSync(fd, runtime, 0, runtime.length, 0);
            } finally {
                closeSync(fd);
            }
            chmodSync(output, 0o755);
            renameSync(output, artifact);
        } catch (error) {
            rmSync(output, { force: true });
            throw error;
        }
        console.log(`harden-appimage: ${path.basename(artifact)} hardened (${statSync(artifact).size} bytes)`);
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
}

export default function hardenAppImages() {
    const artifacts = existsSync(distDir)
        ? readdirSync(distDir).filter(name => name.endsWith(".AppImage")).map(name => path.join(distDir, name))
        : [];
    if (artifacts.length === 0) {
        console.log("harden-appimage: no AppImage artifacts, nothing to do");
        return;
    }
    if (!toolAvailable("mksquashfs") || !toolAvailable("unsquashfs")) {
        const message = "harden-appimage: squashfs-tools not available; AppImages left with the stock AppRun";
        if (process.env.CRYPTOX_REQUIRE_APPIMAGE_HARDEN) {
            throw new Error(message);
        }
        console.warn(`${message} (install squashfs-tools to harden locally)`);
        return;
    }
    for (const artifact of artifacts) {
        hardenOne(artifact);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    hardenAppImages();
}
