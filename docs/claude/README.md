# Cryptox code reference for AI development

Per-file, per-function reference of the codebase, written to give an AI agent (or a new contributor) enough context to change code without re-reading every module first. High-level architecture, commands and security invariants live in [CLAUDE.md](../../CLAUDE.md); these documents go one level deeper.

| Document | Covers |
|---|---|
| [main-process.md](main-process.md) | `background.js`, `ipcValidation.js`, `operations.js`, `temp.js`, `constants.js`, `exceptions.js`, `messages.js`, `filemanager.js` |
| [crypto.md](crypto.md) | `crypto.js`, `format.js`, `utils.js`, `vector.js` |
| [renderer.md](renderer.md) | `preload.js`, `main.js`, `App.vue`, router, Pinia store, views, components, mixins |
| [build-test-release.md](build-test-release.md) | `scripts/`, test suites, CI and release flow |

Maintenance rule: these files describe behavior that exists in the code. When changing a documented function's contract (arguments, return shape, side effects, error behavior), update the matching section in the same commit. Do not document planned or hypothetical behavior.
