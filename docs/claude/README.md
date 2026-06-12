# Cryptox code reference for AI development

Per-file, per-function reference of the codebase, written to give an AI agent (or a new contributor) enough context to change code without re-reading every module first. High-level architecture, commands and security invariants live in [CLAUDE.md](../../CLAUDE.md); these documents go one level deeper.

`src/` is organized by Electron process: `src/main/` (main process), `src/preload/` (context bridge), `src/renderer/` (Vue app), `src/shared/` (modules imported by both processes). Import aliases: `@` -> `src/renderer`, `@shared` -> `src/shared`, and `@main` -> `src/main` (Jest only; main-process code uses relative imports).

| Document | Covers |
|---|---|
| [main-process.md](main-process.md) | `main/index.js`, `main/ipcValidation.js`, `main/operations.js`, `main/temp.js`, `shared/constants.js`, `shared/exceptions.js`, `shared/filemanager.js` |
| [crypto.md](crypto.md) | `main/crypto.js`, `main/format.js`, `main/utils.js`, `main/vector.js` |
| [renderer.md](renderer.md) | `preload/index.js`, `renderer/main.js`, `App.vue`, `messages.js`, router, Pinia store, views, components, mixins |
| [build-test-release.md](build-test-release.md) | `scripts/`, test suites, CI and release flow |

Maintenance rule: these files describe behavior that exists in the code. When changing a documented function's contract (arguments, return shape, side effects, error behavior), update the matching section in the same commit. Do not document planned or hypothetical behavior.
