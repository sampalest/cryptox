import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));

// index.html ships a production CSP with connect-src 'self' only. Vite HMR needs
// a websocket back to the dev server, so add ws:// origins to connect-src in dev
// only; this transform runs solely under `vite serve`, so the bundled
// dist/index.html never carries the dev websocket origins (APP-06).
function devCspHmr() {
    return {
        name: "lockasaur-dev-csp-hmr",
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
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version)
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
