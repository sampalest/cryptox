import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [vue()],
    base: "./",
    css: {
        preprocessorOptions: {
            scss: {
                // color-functions, slash-div and global-builtin deprecations have
                // been fixed in-place (see src/renderer/sass/materialize). Only @import
                // remains: Materialize 1.0 is built entirely on @import's shared
                // global scope, so migrating it to @use bloats/duplicates the
                // output. Silence just that one until Materialize is replaced.
                silenceDeprecations: ["import"]
            }
        }
    },
    resolve: {
        alias: {
            "@": path.resolve(rootDir, "src/renderer"),
            "@shared": path.resolve(rootDir, "src/shared")
        }
    },
    build: {
        target: "es2022"
    }
});
