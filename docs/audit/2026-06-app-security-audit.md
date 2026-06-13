# Cryptox app security and build/release audit

| | |
|---|---|
| **Date** | 2026-06-13 |
| **Version audited** | 0.3.8-alpha |
| **Commit** | `2c4d334` (branch `develop`) |
| **Scope** | Electron application hardening and the build/release pipeline: `src/main/index.js` (window and app config), `index.html` (CSP), `electron-builder.config.cjs`, `scripts/notarize.js`, `scripts/publish-release.mjs`, `scripts/build-electron.mjs`, `scripts/setup-electron.mjs`, `scripts/electron-dev.mjs`, `.github/workflows/ci.yml`, `package.json`, `vite.config.js`. |
| **Method** | Per-file read, cross-checked against the renderer isolation and containment invariants in CLAUDE.md. Every High/Critical finding was re-read at the cited line and confirmed before inclusion. `npm audit --omit=dev` reported 0 vulnerabilities (baseline). |

## Executive summary

The **runtime** renderer hardening is strong and complete: context isolation, disabled node integration, sandbox, explicit `webSecurity`, a deny-all window-open handler, a strict navigation guard, dev-only DevTools, no webview surface, no custom protocol registration, and a tight CSP core. All of these were verified in place.

The weaknesses are in **packaging and distribution**, where the protections that runtime hardening assumes are simply absent:

- **Code signing and notarization do not run.** `scripts/notarize.js` is dead code (never wired, imports an absent package, depends on undeclared modules), and CI explicitly disables signing. Released macOS artifacts ship unsigned and un-notarized.
- **Electron Fuses are not configured at all**, so the packaged binary can be relaunched as a generic Node interpreter (`ELECTRON_RUN_AS_NODE`) and accepts `--inspect`/`NODE_OPTIONS`, bypassing the renderer sandbox entirely.
- **Hardened Runtime and entitlements are not set**, which also blocks any future notarization.

These three combine: an unsigned binary with `RunAsNode` left on and no asar integrity is broadly open to local tampering and code injection into the main process, which makes the (otherwise solid) renderer sandbox moot.

## Findings

| ID | Severity | Location | Summary |
|---|---|---|---|
| APP-01 | Critical | `scripts/notarize.js`, `electron-builder.config.cjs`, `ci.yml:105` | Signing/notarization is dead code; CI ships unsigned, un-notarized artifacts. |
| APP-02 | High | repo-wide (no fuse config) | Electron Fuses not configured; `RunAsNode` and Node-inspect/NODE_OPTIONS left enabled. |
| APP-03 | High | `electron-builder.config.cjs:1-35` | macOS Hardened Runtime and entitlements not configured. |
| APP-04 | Medium | `src/main/index.js` (createWindow) | No `setPermissionRequestHandler`/`setPermissionCheckHandler` (deny-by-default missing). |
| APP-05 | Medium | `yarn.lock` + `package-lock.json` | Two committed lockfiles; supply-chain drift risk. |
| APP-06 | Medium | `index.html:7-8` | Dev-only `ws://localhost` CSP entries ship into production. |
| APP-07 | Low | `index.html:7-8` | CSP could add `frame-ancestors`/`frame-src 'none'`. |
| APP-08 | Low | `src/main/index.js:204-213` | `dialog:open-files` and other non-crypto handlers lack `isTrustedSender` (mirrors CODE-04). |
| APP-09 | Info | `package.json`, `electron-builder.config.cjs:18` | Stale 2020 copyright; alpha versioning. |

---

### APP-01 (Critical): signing and notarization are dead code; CI ships unsigned artifacts

**Location:** `scripts/notarize.js:1-18`; `electron-builder.config.cjs` (no `afterSign` hook); `.github/workflows/ci.yml:105`.

**Description:** `scripts/notarize.js` is an orphan, confirmed on three independent counts:
1. It is never referenced by `electron-builder.config.cjs`, which has no `afterSign` key, so electron-builder never invokes it.
2. It `require("electron-notarize")` (`notarize.js:2`), the deprecated package, which is **not installed** (`node_modules/electron-notarize` is absent; only the scoped `@electron/notarize` exists, transitively). It also `require("dotenv")` (`notarize.js:1`). Neither `dotenv` nor any notarize package is declared in `package.json`. So even if wired, the require would throw `MODULE_NOT_FOUND`.
3. The CI package step sets `CSC_IDENTITY_AUTO_DISCOVERY: "false"` (`ci.yml:105`), disabling code signing outright, and `electron-builder.config.cjs:11-13` only sets `mac.identity` when that variable is not `"false"`, so CI never signs.

The result: the `package` job builds dmg/zip with no signing and no notarization, then `publish-release.mjs` uploads them to public GitHub releases. Separately, the `appBundleId` in the script (`com.sampalest@icloud.com.cryptox`, `notarize.js:13`) is malformed and inconsistent with the real `appId` `com.sampalest.cryptox` (`electron-builder.config.cjs:16`).

**Impact:** Distributed macOS artifacts have no cryptographic provenance binding them to the developer. Gatekeeper blocks or quarantines them, training users to bypass Gatekeeper. An attacker who can substitute or tamper with a release asset faces no signature barrier. Combined with APP-02/APP-03, a tampered build runs without complaint.

**Recommendation:** Decide on intent. If signing is deliberately deferred for the alpha, **remove `scripts/notarize.js`** so it does not imply a protection that is absent. To enable it properly: add `@electron/notarize` and `dotenv` to devDependencies, switch the import to `@electron/notarize`, wire it via `afterSign` in the builder config, fix `appBundleId` to `com.sampalest.cryptox`, migrate to `notarytool` (`appleId`/`appleIdPassword`/`teamId`, since legacy altool is retired), provide signing certs, and drop `CSC_IDENTITY_AUTO_DISCOVERY: "false"`.

### APP-02 (High): Electron Fuses not configured

**Location:** repo-wide. No `flipFuses`/`@electron/fuses` usage and no `afterPack` hook (confirmed: `@electron/fuses` exists only transitively, and no `afterPack`/`afterSign`/`fuses` reference exists in the builder config or scripts).

**Description:** None of the recommended fuses are flipped: `RunAsNode`, `EnableNodeCliInspectArguments`, `EnableNodeOptionsEnvironmentVariable`, `OnlyLoadAppFromAsar`, `EmbeddedAsarIntegrityValidation`. Electron 40 ships with `RunAsNode` and the Node-inspect/NODE_OPTIONS fuses enabled by default.

**Impact:** With `RunAsNode` on, the packaged binary can be relaunched as a generic Node interpreter via `ELECTRON_RUN_AS_NODE=1`, and `NODE_OPTIONS`/`--inspect` can inject code into the main process. This is a local code-execution lever that bypasses the renderer sandbox entirely: once the main process can be coerced into running arbitrary code, the renderer hardening is irrelevant. Without `OnlyLoadAppFromAsar` and asar integrity validation, a tampered unpacked app directory loads silently, compounding APP-01.

**Recommendation:** Add an `afterPack` hook (or electron-builder's `electronFuses` config) that disables `RunAsNode`, `EnableNodeCliInspectArguments`, and `EnableNodeOptionsEnvironmentVariable`, and enables `OnlyLoadAppFromAsar` and `EmbeddedAsarIntegrityValidation`. `@electron/fuses` is already in the dependency tree.

### APP-03 (High): macOS Hardened Runtime and entitlements not configured

**Location:** `electron-builder.config.cjs:1-35` (the `mac` block sets category/type/targets only); no entitlements plist exists (`build/` contains only `ctx.icns` and `icon.icns`).

**Description:** The `mac` target has no `hardenedRuntime: true` and no entitlements files. Hardened Runtime is a prerequisite for notarization and for restricting dangerous capabilities (JIT, debugger attach, library-validation bypass).

**Impact:** Even once APP-01 is fixed, without Hardened Runtime the binary cannot be notarized and runs without library-validation or debugger-attach protection. Combined with APP-02, the main process is broadly open to local tampering and injection.

**Recommendation:** Set `mac.hardenedRuntime: true`, add a minimal `build/entitlements.mac.plist` (this app needs essentially nothing beyond defaults), and enable `gatekeeperAssess`. Keep entitlements as tight as possible.

### APP-04 (Medium): no permission request/check handlers

**Location:** `src/main/index.js` `createWindow` (where session handlers would be installed); confirmed absent across `src/`.

**Description:** The app never installs `setPermissionRequestHandler` or `setPermissionCheckHandler` on the window session. Electron's default grants many permission requests (geolocation, media, notifications) for trusted content.

**Impact:** Lower than usual here, because the CSP and navigation guard confine content to the bundled `dist/index.html`, so there is no remote origin to abuse today. It is a defense-in-depth gap: a future renderer regression or a permissive navigation would auto-grant web permission prompts. For a security-focused crypto app this should be explicit deny-by-default.

**Recommendation:** In `createWindow`, add `session.setPermissionRequestHandler((_, __, cb) => cb(false))`, a matching `setPermissionCheckHandler(() => false)`, and optionally `setDevicePermissionHandler(() => false)`.

### APP-05 (Medium): two committed lockfiles

**Location:** repo root: `package-lock.json` and `yarn.lock` (both present, last written about two hours apart).

**Description:** CLAUDE.md and CI (`npm ci`) standardize on npm with a committed `package-lock.json`. A stale `yarn.lock` also exists and is unused by CI.

**Impact:** Supply-chain ambiguity. Anyone running `yarn install` resolves a potentially different dependency graph than CI audits and builds, so the audited tree (the clean `npm audit` baseline) may not match what someone actually installs.

**Recommendation:** Delete `yarn.lock`, add it to `.gitignore`, and keep `package-lock.json` as the single source of truth.

### APP-06 (Medium): dev-only CSP entries ship to production

**Location:** `index.html:7-8` (`connect-src 'self' ws://localhost:* ws://127.0.0.1:*`).

**Description:** The CSP is a static meta tag. The `ws://` entries exist only for Vite HMR in dev (noted as intentional in CLAUDE.md), but `index.html` is bundled into the production `dist/` unchanged, so production carries them too.

**Impact:** Low in practice (a production renderer has no reason to open a websocket, and node integration is off), but it needlessly relaxes the production CSP: a successful injection could exfiltrate to a local websocket listener.

**Recommendation:** Strip the `ws://` entries from the shipped CSP. Inject the HMR `connect-src` only in dev via a Vite HTML transform, or set the CSP per environment through `onHeadersReceived`. Production `connect-src` should be `'self'` only.

### APP-07 (Low): CSP could add frame directives

**Location:** `index.html:7-8`.

**Description:** Good directives are present (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`). Missing: `frame-ancestors 'none'` and `frame-src 'none'`. `style-src` includes `'unsafe-inline'`, required by Materialize/Vue inline styles and acceptable.

**Impact:** Minor; the window-open handler and navigation guard already block framing and new windows at the Electron layer.

**Recommendation:** Add `frame-ancestors 'none'; frame-src 'none'` as belt-and-suspenders.

### APP-08 (Low): non-crypto handlers lack isTrustedSender

**Location:** `src/main/index.js:204-213` and the other non-crypto handlers.

**Description:** Same finding as CODE-04 in the code audit, restated here for the app surface. `dialog:open-files`, `app:info`, `shell:open-external` (mitigated by the URL allowlist), and `files:confirm-delete-encrypted` (mitigated by the `.ctx` allowlist and confirm dialog) do not gate on `isTrustedSender`, unlike the crypto handlers.

**Impact:** Low; the containment controls mean only the trusted renderer should reach these channels.

**Recommendation:** Add `isTrustedSender(event, win)` to the non-crypto handlers for consistency, or document why they are exempt.

### APP-09 (Info): stale metadata

**Location:** `package.json` and `electron-builder.config.cjs:18`.

**Description:** Copyright reads 2020; version is `0.3.8-alpha`. Informational only.

**Recommendation:** Refresh the copyright year. No security action required.

---

## Verified hardening measures

Confirmed in place at the cited location.

- **Renderer isolation flags all explicitly set:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` (`src/main/index.js:114-117`).
- **No child windows:** `setWindowOpenHandler(() => ({ action: "deny" }))` (`index.js:124`).
- **Navigation guard:** `will-navigate` allows only the dev-server origin (dev) or bundled `dist/index.html` (prod), else `preventDefault()` (`index.js:127-136`).
- **DevTools gated to dev:** opened only when `VITE_DEV_SERVER_URL` is set and `IS_TEST` is not (`index.js:138-140`).
- **No webview surface:** no `webviewTag` enabled and no `will-attach-webview` handler needed (confirmed absent).
- **No custom protocol registration:** the app loads only `loadFile`/`loadURL` of trusted content; no `registerSchemes`/`registerFileProtocol` (confirmed absent).
- **Sender trust on crypto IPC:** `isTrustedSender` is the first check in all three `crypto:*` handlers (`index.js:253, 285, 312`).
- **Strong CSP core:** `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'` with no remote script origins (`index.html`; see APP-06/APP-07 for the gaps).
- **ASAR packaging on:** electron-builder defaults `asar: true` and no key disables it (integrity validation still missing, see APP-02).
- **Release pipeline secret handling:** CI uses the scoped ephemeral `${{ github.token }}` with `contents: write` only (`ci.yml:88, 113`); no long-lived PAT, no hardcoded tokens. `publish-release.mjs` shells out via `execFileSync` (no shell interpolation) and regex-validates short shas.
- **build-electron.mjs externals scope:** marks `electron`, Node builtins, and every `dependencies` key as external; everything else is bundled. No devDependency leaks into the bundle.
- **Electron currency:** `electron ^40.10.2` is current.
- **Supply chain baseline:** `npm audit --omit=dev` reports 0 vulnerabilities (see APP-05 on the yarn.lock drift caveat). `postinstall`/`postuninstall` run only the standard `electron-builder install-app-deps`.
