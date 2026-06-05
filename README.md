<br>
<div align="center">
<img src="screenshots/logo.png" width="400"/>
<p><> with ❤️ by Sam</p>
</div>
<hr>

## Version 0.2.1-alpha

## Description
* Simple app for encrypt files
* Support macOS
* Windows and Linux coming soon...

## Install
- Download latest release from https://github.com/sampalest/cryptox/releases

## Development

Cryptox now uses npm with a committed `package-lock.json`. Use Node.js 24 LTS for local development:

```bash
nvm use
npm install
```

Useful commands:

```bash
npm run electron:serve
npm run serve
npm run build
npm run build:electron
npm run electron:build
npm run lint
npm run test:unit
npm run test:e2e
npm audit
```

The renderer is built with Vite into `dist/`. Electron main and preload bundles are built into `dist-electron/` before local app startup or packaging. `npm run electron:build` produces macOS `dmg` and `zip` artifacts in `dist_electron/`. Local notarization is skipped unless the required notarization environment is configured.

## Upgrade notes

- SAM-6 migrated the renderer to Vue 3.5, Vue Router 4, Pinia, and Vite. Vue CLI, Vuex, `vue-template-compiler`, and the Vue CLI Electron Builder plugin were removed.
- Electron is upgraded and production windows now use `contextIsolation: true`, `nodeIntegration: false`, and a preload IPC bridge instead of the deprecated `remote` module.
- External URL opening and renderer-to-main crypto payloads are validated in the main process.
- macOS file-open events are queued until the renderer explicitly signals that its preload listeners are ready.
- `test:e2e` now runs a real Electron smoke test for startup, renderer load, and preload bridge availability.
- `node-sass`, `babel-eslint`, `vuex-electron`, `file-system`, `file-type`, Nightwatch, chromedriver, and geckodriver were removed.
- Sass is built with Dart Sass.
- npm overrides were removed after the Vue 3/Vite migration because the old override list only covered Vue CLI/Webpack-era transitive packages that are no longer installed.
- Full `npm audit` currently reports one moderate `materialize-css` advisory group with no fix available. `npm audit --audit-level=high` passes and is the CI gate until Materialize is replaced or patched.

## Verification

SAM-6 was verified on June 5, 2026 with:

```bash
npm install --ignore-scripts
npm run postinstall
npm run lint
npm run test:unit
npm run build
npm run build:electron
node tests/e2e/smoke.js
CRYPTOX_SMOKE_TEST=true IS_TEST=true npm run electron:serve
npm audit
npm audit --audit-level=high
npm run electron:build
```

`node tests/e2e/smoke.js`, `npm run electron:serve`, and `npm run electron:build` require permission to launch/sign/package Electron on macOS. `npm run electron:build` completed with signed macOS `dmg` and `zip` artifacts; notarization was skipped because notarization options were not configured.

## Use this app
Just drag file or folder you want to encrypt, set a password and that's it. Easy!
Support all files.

<div align="center">
<img src="screenshots/encrypt.gif" width="600"/>
</div>

## Special thanks and credits
### Libs
- Vue.js
- Materialize
- Electron
- Node libs
- Archiver
- Animate.css
- ...

## Author
Samuel Palomo Esteban

## License
**Cryptox** is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

It is free for personal and noncommercial use: you can use it, modify it, share it, and contribute. Commercial use by companies is not permitted. See the full terms in the [LICENSE](LICENSE) file or at [polyformproject.org](https://polyformproject.org/licenses/noncommercial/1.0.0/).
