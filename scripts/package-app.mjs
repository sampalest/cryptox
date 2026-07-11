// Packaging entry point. Runs electron-builder with this script's CLI
// arguments (so "npm run electron:build -- --x64" still reaches
// electron-builder; npm appends extra args to the end of the script line,
// which is this script), then hardens any built AppImages (see
// harden-appimage.mjs).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hardenAppImages from "./harden-appimage.mjs";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const builderPkgPath = require.resolve("electron-builder/package.json");
const builderPkg = require("electron-builder/package.json");
const builderBin = typeof builderPkg.bin === "string" ? builderPkg.bin : builderPkg.bin["electron-builder"];
const builderCli = path.join(path.dirname(builderPkgPath), builderBin);

const result = spawnSync(process.execPath, [builderCli, "--config", "electron-builder.config.cjs", "--publish", "never", ...process.argv.slice(2)], {
    cwd: rootDir,
    stdio: "inherit"
});
if (result.status !== 0) {
    process.exit(result.status ?? 1);
}

hardenAppImages();
