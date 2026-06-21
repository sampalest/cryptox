import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// index.html ships a production CSP with connect-src 'self' only. Vite HMR needs
// a websocket back to the dev server, so add ws:// origins to connect-src in dev
// only; this transform runs solely under `vite serve`, so the bundled
// dist/index.html never carries the dev websocket origins (APP-06).
function devCspHmr() {
    return {
        name: "cryptox-dev-csp-hmr",
        apply: "serve",
        transformIndexHtml(html) {
            return html.replace(
                "connect-src 'self';",
                "connect-src 'self' ws://localhost:* ws://127.0.0.1:*;"
            );
        }
    };
}

export default defineConfig({
    plugins: [vue(), devCspHmr()],
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
