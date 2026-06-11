# Build, test and release reference

## Build scripts

### scripts/build-electron.mjs

Bundles the main process (`src/background.js` -> `dist-electron/background.cjs`) and preload (`src/preload.js` -> `dist-electron/preload.cjs`) as two separate Vite library builds targeting node24/CommonJS. Everything in package.json `dependencies` plus all Node builtins (both bare and `node:` forms) and `electron` stays external, so runtime deps must be declared in `dependencies`, not `devDependencies`, or the packaged app will fail to resolve them. Dev mode (NODE_ENV=development) enables sourcemaps. The first build empties `dist-electron/`, the second does not.

### scripts/electron-dev.mjs

Dev orchestrator behind `npm run electron:serve`: starts the Vite dev server on 127.0.0.1:5173 (non-strict port), runs the electron bundles build, then spawns Electron with `VITE_DEV_SERVER_URL` pointing at the dev server. `background.js` loads that URL instead of `dist/index.html` and opens devtools. Forwards SIGINT/SIGTERM to Electron and closes the Vite server when Electron exits.

### scripts/setup-electron.mjs

CI-only workaround for flaky Electron binary installation on macOS runners: retries `install.js` up to 5 times just to populate the download cache, then discards Electron's own extraction and re-extracts the cached zip with `ditto`, writing `path.txt` itself and asserting the binary is executable.

### scripts/notarize.js

electron-builder afterSign hook: notarizes the macOS app via electron-notarize using `APPLEID`/`APPLEIDPASS` from the environment (dotenv-loaded). No-op for non-darwin builds; local builds without the env are skipped.

### scripts/publish-release.mjs

CI release publisher. `master` -> release `v<version>` (updated in place if the tag exists); `develop` -> prerelease `v<version>.<shortsha>`, replacing only the previous prerelease of the same version. Uploads the `dist_electron/` dmg/zip assets with `--clobber`. Never deletes or recreates releases, so other versions are untouched.

## Tests

### tests/unit/ (npm run test:unit)

Jest, node environment, `runInBand`, `@/` mapped to `src/`. One spec per main-process module: `crypto.spec.js`, `format.spec.js`, `ipcValidation.spec.js`, `operations.spec.js`, `temp.spec.js`, `utils.spec.js`, `filemanager.spec.js`, plus `files-store.spec.js` for the Pinia store. New main-process behavior (especially anything in the Security invariants list) belongs here; `format.js` tests need no fs or sodium because the module is pure.

### tests/large/ (npm run test:large)

Generates ~1 GB incompressible payloads (a file and a folder), encrypts and decrypts them through the real `Crypto` class, and verifies the UI event contract: progress monotonicity, the 0-99 streaming range with 100 fired only when output is actually visible on disk, loader phases, and content hashes round-tripping. 30-minute Jest timeout; size overridable via `CRYPTOX_LARGE_SIZE_MB` (e.g. 128 for local runs). Excluded from the unit testMatch.

### tests/e2e/smoke.js (npm run test:e2e)

Spawns the real packaged-layout Electron app (after `build` + `build:electron`) with `CRYPTOX_SMOKE_TEST=true`. The main process then verifies `window.cryptox` exists in the renderer (startup + renderer load + preload bridge) and exits 0/1; the script enforces a 30s timeout. The rest of `tests/e2e/` (custom-assertions, custom-commands, page-objects, specs) is leftover Nightwatch scaffolding that nothing currently runs.

## CI (.github/workflows)

- `ci.yml`: on PRs and pushes to develop/master: lint, unit tests, and `npm audit --audit-level=high` on ubuntu. Jobs that do not run Electron set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` because the binary download is flaky on runners.
- `large-tests.yml`: manual dispatch only; runs the large suite on ubuntu/macos/windows with a `size_mb` input (default 1024) and publishes timing metrics to the job summary.

## Packaging

`npm run electron:build` = renderer build + electron bundles + `electron-builder --config electron-builder.config.cjs --publish never`, producing macOS dmg/zip artifacts in `dist_electron/`. Note the three output directories: `dist/` (renderer), `dist-electron/` (main/preload bundles, the app's `main` entry), `dist_electron/` (packaged artifacts).
