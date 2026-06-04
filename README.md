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
npm run build
npm run electron:build
npm run lint
npm run test:unit
npm audit
```

`npm run electron:build` produces macOS `dmg` and `zip` artifacts in `dist_electron/`. Local notarization is skipped unless the required notarization environment is configured.

## Upgrade notes

- Vue is pinned to the latest Vue 2.7 line as a compatibility baseline. A Vue 3 and Vite migration should be handled separately.
- Electron is upgraded and production windows now use `contextIsolation: true`, `nodeIntegration: false`, and a preload IPC bridge instead of the deprecated `remote` module.
- `node-sass`, `babel-eslint`, `vuex-electron`, `file-system`, `file-type`, Nightwatch, chromedriver, and geckodriver were removed.
- Sass is built with Dart Sass.
- The current npm audit has no high or critical findings. Remaining low/moderate findings are tied to Vue 2, Materialize CSS, webpack dev-server development exposure, and legacy Vue CLI/Electron Builder internals. These need a Vue 3/Vite/UI migration to fully remove.

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
