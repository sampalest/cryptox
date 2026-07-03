# Build, test and release reference

## Build scripts

### scripts/build-electron.mjs

Bundles the main process (`src/main/index.js` -> `dist-electron/background.cjs`) and preload (`src/preload/index.js` -> `dist-electron/preload.cjs`) as two separate Vite library builds targeting node24/CommonJS. Everything in package.json `dependencies` plus all Node builtins (both bare and `node:` forms) and `electron` stays external, so runtime deps must be declared in `dependencies`, not `devDependencies`, or the packaged app will fail to resolve them. Dev mode (NODE_ENV=development) enables sourcemaps. The first build empties `dist-electron/`, the second does not.

### scripts/electron-dev.mjs

Dev orchestrator behind `npm run electron:serve`: starts the Vite dev server on 127.0.0.1:5173 (non-strict port), runs the electron bundles build, then spawns Electron with `VITE_DEV_SERVER_URL` pointing at the dev server. The main process (`src/main/index.js`) loads that URL instead of `dist/index.html` and opens devtools. Forwards SIGINT/SIGTERM to Electron and closes the Vite server when Electron exits.

### scripts/setup-electron.mjs

CI-only workaround for flaky Electron binary installation on macOS runners: retries `install.js` up to 5 times just to populate the download cache, then discards Electron's own extraction and re-extracts the cached zip with `ditto`, writing `path.txt` itself and asserting the binary is executable. It is macOS-only (darwin cache path and `ditto`), so the CI step that invokes it is gated to macOS runners; Windows and Linux runners use Electron's normal binary download.

### Code signing and notarization

Deliberately not configured (APP-01): macOS code signing and notarization are deferred for the alpha. CI sets `CSC_IDENTITY_AUTO_DISCOVERY: "false"` so artifacts ship unsigned. The `mac` block already carries `hardenedRuntime: true` and `build/entitlements.mac.plist`, so signing/notarization can be enabled later (add `@electron/notarize` + an `afterSign` hook) without restructuring; those settings only take effect once signing is on.

### scripts/publish-release.mjs

CI release publisher. `master` -> release `v<version>` (updated in place if the tag exists); `develop` -> prerelease `v<version>.<shortsha>`, replacing only the previous prerelease of the same version. Uploads every shippable artifact in `dist_electron/` (mac dmg/zip, Windows nsis and portable exe, Linux AppImage/deb) with `--clobber`. Never deletes or recreates releases, so other versions are untouched. The package job is a per-OS matrix, so each runner produces only its own artifacts; the `release` job downloads all of them into `dist_electron/` before this runs (see CI).

## Tests

### tests/unit/ (npm run test:unit)

Jest, node environment, `runInBand`, aliases `@main` -> `src/main`, `@shared` -> `src/shared`, `@/` -> `src/renderer` (same `@`/`@shared` as Vite). One spec per main-process module: `crypto.spec.js`, `format.spec.js`, `ipcValidation.spec.js`, `operations.spec.js`, `temp.spec.js`, `utils.spec.js`, `filemanager.spec.js`, plus `files-store.spec.js` for the Pinia store. New main-process behavior (especially anything in the Security invariants list) belongs here; `format.js` tests need no fs or sodium because the module is pure.

`crypto.spec.js` (with `utils.spec.js` for tar handling) doubles as the security regression suite for the CLAUDE.md Security invariants list (CTX-13): round-trips (binary, empty, odd filenames), wrong-password and tamper rejection (header, IV, ciphertext, auth tag, truncation) with no output or staged files left behind, never-overwrite naming, tar extraction hardening, cancellation cleanup, per-operation temp isolation, and legacy/CTXBOX decrypt-only compatibility (including path steering via their unauthenticated extension field). A change that breaks one of these tests is breaking a security property, not just a test.

### tests/large/ (npm run test:large)

Generates ~1 GB incompressible payloads (a file and a folder), encrypts and decrypts them through the real `Crypto` class, and verifies the UI event contract: progress monotonicity, the 0-99 streaming range with 100 fired only when output is actually visible on disk, loader phases, and content hashes round-tripping. 30-minute Jest timeout; size overridable via `CRYPTOX_LARGE_SIZE_MB` (e.g. 128 for local runs). Excluded from the unit testMatch.

### tests/e2e/smoke.js (npm run test:e2e)

Spawns the real packaged-layout Electron app (after `build` + `build:electron`) with `CRYPTOX_SMOKE_TEST=true`. The main process then verifies `window.cryptox` exists in the renderer (startup + renderer load + preload bridge) and exits 0/1; the script enforces a 30s timeout. The rest of `tests/e2e/` (custom-assertions, custom-commands, page-objects, specs) is leftover Nightwatch scaffolding that nothing currently runs.

## CI (.github/workflows)

- `ci.yml`: on PRs and pushes to develop/master. `lint` and `npm audit --omit=dev --audit-level=high` run on ubuntu (the audit gates on the production dependency tree, the only deps that ship in the packaged app; dev/build tooling vulns do not fail the build). `unit` runs on `[ubuntu, ubuntu-arm, windows, macos]` so the Windows filesystem exercises the tar reserved-name sanitizer and the WASM crypto core is confirmed on x64 and arm64. `e2e` runs on macOS. On pushes only, `package` is a six-leg matrix, one per (OS, arch), each passing the target arch explicitly (`npm run electron:build -- --<arch>`): macos-15 (arm64 native, and x64 cross-compiled on the same runner because GitHub retired the macos-13 Intel runners, APP-11), windows-latest (x64) and windows-11-arm (arm64), ubuntu-latest (x64) and ubuntu-24.04-arm (arm64). Each leg builds its arch's installers and uploads them; a separate `release` job on ubuntu downloads all of them and runs `publish-release.mjs`, so one release carries x64 and arm64 for every platform. The arch is baked into each `artifactName`, so the six artifact sets never collide. Jobs that do not run or package Electron set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` because the binary download is flaky on runners; the macOS package legs additionally use `setup-electron` (gated to `runner.os == 'macOS'`), while Windows/Linux download the binary normally. On the mac x64 leg, electron-builder downloads the darwin-x64 Electron dist itself via @electron/get into the shared cache.
- `large-tests.yml`: manual dispatch only; runs the large suite on ubuntu/macos/windows with a `size_mb` input (default 1024) and publishes timing metrics to the job summary.

## Packaging

`npm run electron:build` = renderer build + electron bundles + `electron-builder --config electron-builder.config.cjs --publish never`, producing the host OS's artifacts (macOS dmg/zip, Windows nsis + portable exe, Linux AppImage/deb) in `dist_electron/`. Note the three output directories: `dist/` (renderer), `dist-electron/` (main/preload bundles, the app's `main` entry), `dist_electron/` (packaged artifacts).

The config carries a `win` block (nsis + portable, `build/icon.ico`), a `linux` block (AppImage + deb, the `build/icons/` PNG set), a `deb` block, and an `nsis` block (per-user install with no elevation, desktop + start-menu shortcuts). Two Linux specifics (APP-11, both reproduced on Ubuntu 24.04 arm64): the `deb` block overrides `depends` to append `libasound2`, which the Electron binary links at load time but electron-builder's default list omits (the override replaces the default list, so it is repeated in the config; keep it in sync with `FpmTarget.getDefaultDepends` on electron-builder bumps); and `toolsets.appimage: "1.0.2"` selects the static (type2) AppImage launcher runtime, because the legacy default launcher is dynamically linked and its arm64 build needs an unversioned `libz.so`, making the arm64 AppImage unable to start on stock Ubuntu. `fileAssociations` registers the `.ctx` extension on all platforms and adds `mimeType: application/x-cryptox` for Linux mime registration. Windows and Linux ship unsigned for the alpha too (Windows shows a SmartScreen prompt). `build/icon.ico` and `build/icons/*.png` are committed and regenerated from `public/icon.png` by `npm run electron:generate-icons` (macOS-only, uses `sips` plus an inline ICO packer, `scripts/generate-icons.mjs`); the `.icns` files are committed separately. Each platform is built for both x64 and arm64 in CI (native runners everywhere except mac x64, which is cross-compiled on macos-15, APP-11); `artifactName` carries `${arch}` so the six artifact sets stay distinct in one release (a local `electron:build` still produces just the host arch unless an explicit `-- --<arch>` flag is passed).

`electron-builder.config.cjs` hardening (APP-02/03): `electronFuses` disables `runAsNode`, `enableNodeOptionsEnvironmentVariable` and `enableNodeCliInspectArguments` (so the packaged binary cannot be relaunched as a generic Node interpreter and bypass the renderer sandbox) and enables `onlyLoadAppFromAsar` + `enableEmbeddedAsarIntegrityValidation` (the integrity fuse is enforced on macOS and Windows only; on Linux it is a harmless no-op while `onlyLoadAppFromAsar` still applies, APP-10); the `mac` block sets `hardenedRuntime` with `build/entitlements.mac.plist`. The single committed lockfile is `package-lock.json`; `yarn.lock` is gitignored (APP-05).

The production CSP (`index.html`) is `connect-src 'self'` with `frame-ancestors 'none'` / `frame-src 'none'` (APP-06/07). The Vite HMR websocket origins are injected into `connect-src` only under `vite serve`, by the `cryptox-dev-csp-hmr` plugin in `vite.config.js`, so the bundled `dist/index.html` never carries them.
