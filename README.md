<br>
<div align="center">
<img src="screenshots/logo.png" width="400"/>
<p><> with ❤️ by Sam</p>
</div>
<hr>

## Version 2.0.0

## Description
* Lockasaur: simple app to encrypt files and folders with a password (encryption with bite)
* Encrypted files use the `.dino` extension; files from older Cryptox versions (`.ctx`) still decrypt
* Runs on macOS, Windows, and Linux

## Install
- Download latest release from https://github.com/sampalest/cryptox/releases

Beta builds are not code signed:

- **Windows**: SmartScreen shows "Windows protected your PC" on first launch. Click "More info", then "Run anyway". This is the expected prompt for unsigned apps, not a malware detection.
- **macOS**: the app is not notarized; if Gatekeeper blocks it, right click the app and choose Open.
- **Linux (Ubuntu)**: prefer the `.deb` package (`sudo apt install ./Lockasaur-<version>-<arch>.deb`); it installs the AppArmor profile Ubuntu 24.04 needs and a working Chromium sandbox. The `.AppImage` runs without installation (it needs `fusermount3`, part of a default Ubuntu install); on Ubuntu 24.04+, where AppArmor restricts unprivileged user namespaces, its first run offers a one-time, password-authorized install of an equivalent AppArmor profile so the app can start sandboxed (decline it and the app exits with manual instructions; it never runs unsandboxed). Make sure the downloaded file's arch matches your machine (`x64` vs `arm64`, check with `uname -m`: `x86_64` vs `aarch64`).

## Development

Lockasaur uses npm with a committed `package-lock.json`. Use Node.js 24 LTS for local development:

```bash
nvm use
npm install
```

Run the app in development mode:

```bash
npm run electron:serve
```

### Tests and linting

```bash
npm run lint
npm run test:unit
npm run test:e2e
npm run test:large
```

`test:unit` includes the security regression suite for the crypto format and file handling invariants (tamper rejection, no-overwrite output, tar extraction hardening, cancellation cleanup, legacy format compatibility).

`test:e2e` runs a real Electron smoke test for startup, renderer load, and preload bridge availability.

`test:large` generates a 1 GB file and a 1 GB folder and verifies the UI progress/status contract against real output visibility, printing timing metrics. Override the payload size with `CRYPTOX_LARGE_SIZE_MB` (e.g. `CRYPTOX_LARGE_SIZE_MB=128 npm run test:large`). The "Large payload tests" GitHub Actions workflow runs this suite on Linux, macOS and Windows via manual dispatch.

### Build and packaging

```bash
npm run build
npm run build:electron
npm run electron:build
```

The renderer is built with Vite into `dist/`. Electron main and preload bundles are built into `dist-electron/` before local app startup or packaging. `npm run electron:build` packages the host operating system into `dist_electron/`: macOS `dmg` and `zip`, Windows `nsis` installer and portable `exe`, or Linux `AppImage` and `deb`. Release builds cover both x64 and arm64 for each platform (built on native-architecture CI runners, except macOS x64, which is cross-compiled on the arm64 runner). Artifacts ship unsigned for the beta (see the Install section for the resulting OS prompts); macOS notarization is skipped unless the required environment is configured.

See [CHANGELOG.md](CHANGELOG.md) for release history and upgrade notes.

## Use this app
Just drag file or folder you want to encrypt, set a password and that's it. Easy!
Support all files.

<div align="center">
<img src="screenshots/encrypt.gif" width="600"/>
</div>

## Special thanks and credits
### Libs
- Electron
- Vue.js (Pinia, Vue Router)
- libsodium (Argon2id, AES-256-GCM)
- tar-fs
- Materialize
- Animate.css
- Node libs

## Author
Samuel P.E.

## License
**Lockasaur** (formerly Cryptox) is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

It is free for personal and noncommercial use: you can use it, modify it, share it, and contribute. Commercial use by companies is not permitted. See the full terms in the [LICENSE](LICENSE) file or at [polyformproject.org](https://polyformproject.org/licenses/noncommercial/1.0.0/).
