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
                "@": path.resolve(rootDir, "src")
            }
        }
    });
}

await buildElectronEntry({
    entry: "src/background.js",
    fileName: "background.cjs",
    emptyOutDir: true
});

await buildElectronEntry({
    entry: "src/preload.js",
    fileName: "preload.cjs",
    emptyOutDir: false
});
