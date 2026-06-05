import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [vue()],
    base: "./",
    resolve: {
        alias: {
            "@": path.resolve(rootDir, "src")
        }
    },
    build: {
        target: "es2022"
    }
});
