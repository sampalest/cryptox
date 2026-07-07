// Bundles the Electron main process (src/main/index.js -> dist-electron/background.cjs)
// and preload (src/preload/index.js -> dist-electron/preload.cjs) as two separate Vite
// library builds. Everything in package.json dependencies plus Node builtins and
// electron stays external, so runtime deps must live in dependencies. Invoked by
// "npm run build:electron" and imported by electron-dev.mjs.
import { builtinModules } from "node:module";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const external = [
    "electron",
    ...builtinModules,
    ...builtinModules.map(moduleName => `node:${moduleName}`),
    ...Object.keys(packageJson.dependencies || {})
];

async function buildElectronEntry({ entry, fileName, emptyOutDir }) {
    await build({
        configFile: false,
        root: rootDir,
        mode: process.env.NODE_ENV === "development" ? "development" : "production",
        build: {
            outDir: path.resolve(rootDir, "dist-electron"),
            emptyOutDir,
            sourcemap: process.env.NODE_ENV === "development",
            target: "node24",
            commonjsOptions: {
                transformMixedEsModules: true
            },
            lib: {
                entry: path.resolve(rootDir, entry),
                formats: ["cjs"],
                fileName: () => fileName
            },
            rollupOptions: {
                external,
                output: {
                    entryFileNames: fileName
                }
            }
        },
        resolve: {
            alias: {
                "@shared": path.resolve(rootDir, "src/shared")
            }
        }
    });
}

await buildElectronEntry({
    entry: "src/main/index.js",
    fileName: "background.cjs",
    emptyOutDir: true
});

await buildElectronEntry({
    entry: "src/preload/index.js",
    fileName: "preload.cjs",
    emptyOutDir: false
});
