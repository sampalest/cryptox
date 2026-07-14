// Dev orchestrator behind "npm run electron:serve": starts the Vite dev server,
// builds the electron bundles, then spawns Electron with VITE_DEV_SERVER_URL
// pointing at the dev server. Forwards SIGINT/SIGTERM and closes Vite on exit.
import { spawn } from "node:child_process";
import { createServer } from "vite";
import { ensureElectronForHost } from "./ensure-electron.mjs";

process.env.NODE_ENV = "development";
await ensureElectronForHost();
const { default: electronPath } = await import("electron");

const server = await createServer({
    configFile: "vite.config.js",
    server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: false
    }
});

await server.listen();
const serverUrls = server.resolvedUrls.local;
const rendererUrl = serverUrls[0];

await import("./build-electron.mjs");

const electron = spawn(electronPath, ["."], {
    stdio: "inherit",
    env: {
        ...process.env,
        VITE_DEV_SERVER_URL: rendererUrl
    }
});

electron.on("exit", async code => {
    await server.close();
    process.exit(code ?? 0);
});

process.on("SIGTERM", () => electron.kill("SIGTERM"));
process.on("SIGINT", () => electron.kill("SIGINT"));
