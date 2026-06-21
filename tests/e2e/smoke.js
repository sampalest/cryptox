const { spawn } = require("node:child_process");
const electronPath = require("electron");
const path = require("node:path");

const child = spawn(electronPath, [path.resolve(__dirname, "..", "..")], {
    stdio: "inherit",
    env: {
        ...process.env,
        NODE_ENV: "production",
        IS_TEST: "true",
        CRYPTOX_SMOKE_TEST: "true"
    }
});

const timeout = setTimeout(() => {
    child.kill("SIGTERM");
    console.error("Electron smoke test timed out.");
    process.exit(1);
}, 30000);

child.on("exit", code => {
    clearTimeout(timeout);
    process.exit(code ?? 1);
});
