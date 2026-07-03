// Publish GitHub releases for Cryptox CI.
//   master  -> release "v<version>"; updated in place if it already exists.
//   develop -> prerelease "v<version>.<shortsha>"; only this version's previous
//              prerelease (same version, any short sha) is replaced. Other
//              versions' releases are never touched.
//   manual  -> with CRYPTOX_MANUAL_RELEASE=true (the manual-deploy workflow),
//              prerelease "v<version>.<shortsha>" for the built commit on any
//              branch. No other release is deleted or replaced, so re-running
//              the workflow for another platform on the same commit aggregates
//              that platform's assets into the same release (APP-11).
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist_electron");
const { version } = require("../package.json");

const gh = args => execFileSync("gh", args, { cwd: rootDir, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();
const target = process.env.GITHUB_SHA;
// Shippable artifacts across all platforms (mac dmg/zip, Windows nsis+portable
// exe, Linux AppImage/deb). Blockmaps, yml manifests and unpacked dirs are left
// out. In CI these are aggregated from the per-OS package runners first.
const SHIPPABLE_EXTENSIONS = [".dmg", ".zip", ".exe", ".AppImage", ".deb"];
const assets = readdirSync(distDir)
    .filter(name => SHIPPABLE_EXTENSIONS.some(ext => name.endsWith(ext)))
    .map(name => path.join(distDir, name));
// Static install notes (APP-11): builds ship unsigned for the beta, and the
// AppImage has known limitations on Ubuntu 24.04, so every release body carries
// the two user-facing warnings alongside the build stamp.
const notes = `Automated build of ${sha}

**Install notes**
- Builds are not code signed for the beta. On Windows, SmartScreen shows "Windows protected your PC" on first launch: click "More info", then "Run anyway". On macOS, right click the app and choose Open if Gatekeeper blocks it.
- On Ubuntu, prefer the \`.deb\` package (it installs the AppArmor profile Ubuntu 24.04 needs). The \`.AppImage\` can be blocked by Ubuntu 24.04's user-namespace restriction. Pick the file matching your CPU: \`x64\` or \`arm64\`.`;

const releaseExists = tag => {
    try {
        gh(["release", "view", tag]);
        return true;
    } catch {
        return false;
    }
};

// Create the release, or update it in place when the tag already exists (move it
// to this commit and replace its assets). Never deletes/recreates, so other
// releases are left untouched.
const upsert = (tag, extraArgs = []) => {
    if (releaseExists(tag)) {
        gh(["release", "edit", tag, "--target", target, "--title", tag, "--notes", notes, ...extraArgs]);
        gh(["release", "upload", tag, ...assets, "--clobber"]);
    } else {
        gh(["release", "create", tag, ...assets, "--target", target, "--title", tag, "--notes", notes, ...extraArgs]);
    }
};

if (process.env.CRYPTOX_MANUAL_RELEASE === "true") {
    upsert(`v${version}.${sha}`, ["--prerelease"]);
} else if (process.env.GITHUB_REF_NAME === "master") {
    upsert(`v${version}`);
} else if (process.env.GITHUB_REF_NAME === "develop") {
    const tag = `v${version}.${sha}`;
    const prefix = `v${version}.`;
    const stale = gh(["release", "list", "--limit", "200", "--json", "tagName,isPrerelease", "--jq", ".[] | select(.isPrerelease) | .tagName"])
        .split("\n")
        .filter(Boolean)
        .filter(name => name !== tag && name.startsWith(prefix) && /^[0-9a-f]{7,40}$/.test(name.slice(prefix.length)));

    for (const old of stale) {
        try {
            gh(["release", "delete", old, "--yes", "--cleanup-tag"]);
        } catch {
            // Release may already be gone.
        }
    }

    upsert(tag, ["--prerelease"]);
}
