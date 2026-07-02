// Publish GitHub releases for Cryptox CI.
//   master  -> release "v<version>"; updated in place if it already exists.
//   develop -> prerelease "v<version>.<shortsha>"; only this version's previous
//              prerelease (same version, any short sha) is replaced. Other
//              versions' releases are never touched.
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
const notes = `Automated build of ${sha}`;

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

if (process.env.GITHUB_REF_NAME === "master") {
    upsert(`v${version}`);
}

if (process.env.GITHUB_REF_NAME === "develop") {
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
