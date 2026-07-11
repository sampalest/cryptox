# Contributing to Lockasaur

Lockasaur accepts bug reports, documentation improvements, bug fixes, and carefully scoped feature proposals. Read this guide before opening an issue or pull request.

## Maintainer authority

Lockasaur is independently maintained by Sam ([@sampalest](https://github.com/sampalest)). Every issue, pull request, review, and suggested change is a proposal.

Sam retains final authority over the project. This includes the final decision to accept, request revisions to, defer, reject, close, edit, rework, merge, or revert any contribution. It also includes decisions about the product scope, design, security model, roadmap, and releases.

Passing automated checks, receiving positive reviews, or reaching agreement in a discussion does not guarantee acceptance. A change becomes part of the official project only after Sam explicitly approves and merges it. Submitting a contribution does not guarantee that it will be merged or included in a release.

## Before you start

Search the [existing issues](https://github.com/sampalest/cryptox/issues) and [pull requests](https://github.com/sampalest/cryptox/pulls) before starting work.

### Bugs

Open an issue that includes:

- The Lockasaur version
- Your operating system and architecture
- Steps that reproduce the problem
- The expected and actual behavior
- Relevant logs or screenshots, with sensitive information removed

Small, clear bug fixes can be proposed directly. For a change that affects encryption, the DINO or legacy file formats, file deletion, IPC boundaries, packaging, or platform compatibility, discuss the approach in an issue before writing the implementation.

### Features and substantial changes

Open an issue and wait for maintainer feedback before investing significant time in a feature, redesign, dependency change, architectural change, or broad refactor. Prior discussion reduces duplicated effort, but it is not a promise that an implementation will be accepted.

### Security reports

Do not report a suspected vulnerability in a public issue. Email `cryptox.sam@outlook.com` with a description, reproduction steps, impact, and any proposed fix. Do not include real passwords, private files, or other sensitive data.

## Development setup

Use Node.js 24 LTS and npm. The committed `package-lock.json` is the source of truth for dependencies.

```bash
git clone https://github.com/YOUR-USERNAME/cryptox.git
cd cryptox
git remote add upstream https://github.com/sampalest/cryptox.git
nvm use
npm ci
```

Create a focused branch from the latest `develop` branch:

```bash
git fetch upstream
git checkout develop
git pull --ff-only upstream develop
git checkout -b fix/short-description
```

Run the application in development mode:

```bash
npm run electron:serve
```

Unless Sam requests a different base, open pull requests against `develop`. The `master` branch is reserved for stable releases.

## Change requirements

- Keep each pull request focused on one bug, feature, or documentation topic.
- Follow the existing JavaScript, Vue, Sass, test, and documentation conventions.
- Add or update tests for behavior changes. If a test is not practical, explain why in the pull request.
- Preserve encrypted-file compatibility unless a format change was discussed and explicitly approved first.
- Do not weaken sandboxing, IPC validation, path validation, authenticated encryption, safe extraction, no-overwrite behavior, or cleanup guarantees.
- Discuss new runtime dependencies before adding them. Explain their purpose, maintenance status, security impact, and size impact.
- Use npm and update `package-lock.json` when dependencies change. Do not add `yarn.lock`.
- Do not commit generated `dist/`, `dist-electron/`, `dist_electron/`, or `node_modules/` content.
- Include before and after screenshots or a short recording for visible interface changes.
- Update user-facing documentation and `CHANGELOG.md` when the change affects behavior, compatibility, installation, or security.

## Tests and checks

At minimum, run:

```bash
npm run lint
npm run test:unit
```

For renderer, main-process, preload, IPC, startup, or build changes, also run:

```bash
npm run test:e2e
```

For packaging changes, run the relevant build on a supported host platform:

```bash
npm run build
npm run build:electron
```

The large-payload suite creates a large file and folder. Run it only when the change affects streaming, progress, cancellation, output visibility, file or folder handling, or performance:

```bash
LOCKASAUR_LARGE_SIZE_MB=128 npm run test:large
```

State exactly which checks you ran and which platforms you tested. Continuous integration is required to pass, but passing it does not replace maintainer approval.

## Commits

Write concise, descriptive commits using the repository's existing convention:

```text
fix: prevent duplicate output names
feat: add a focused user-facing capability
docs: clarify Linux installation
test: cover a crypto regression
```

Avoid unrelated formatting, generated files, and cleanup in the same commit as a functional change. Multiple work-in-progress commits are acceptable during review and may be squashed before merging.

## Opening a pull request

The pull request description should include:

- What changed and why
- The issue it addresses, when applicable
- The implementation and any important tradeoffs
- Tests run and platforms tested
- Screenshots or recordings for interface changes
- Compatibility, security, migration, or performance impact
- Any known limitation or follow-up work
- Disclosure of material AI assistance, if used

Enable **Allow edits from maintainers** when GitHub offers the option. Respond to review comments and keep the branch current. A maintainer request is not automatic acceptance, and requested revisions may be followed by further review or rejection.

## AI-assisted contributions

You are responsible for every part of a contribution, regardless of the tools used to create it. Review, understand, test, and be able to explain all submitted code and documentation. Unreviewed or unverifiable generated contributions may be closed.

## License and contribution rights

By submitting a contribution, you confirm that you have the right to provide it and agree that it may be distributed under the project's [PolyForm Noncommercial License 1.0.0](../LICENSE). Do not submit code, assets, or other material copied from a source whose license is incompatible with this project.

## Communication

Keep discussions technical, specific, and respectful. Harassment, personal attacks, spam, repeated demands for acceptance, or attempts to bypass a maintainer decision may result in comments being removed, discussions being locked, or contributions being closed.
