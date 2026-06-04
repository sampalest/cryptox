<br>
<div align="center">
<img src="screenshots/logo.png" width="400"/>
<p><> with ❤️ by Sam</p>
</div>
<hr>

## Version 0.2.0-pre

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
**Cryptox** is under the MIT license.
```text
MIT License

Copyright (c) 2020 Samuel Palomo Esteban

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
