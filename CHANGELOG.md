# Changelog

All notable changes to the **Worktree Shell Start** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No user-facing changes.

### Internal

- Document the lint and CI scripts in the README, including why the published package
  contents are pinned by a test.
- Move the CI workflow to current action majors, where the previous ones targeted the
  deprecated Node 20 runtime.
- Exclude `.github/**` and `eslint.config.mjs` from the `.vsix`, and add a packaging test
  that pins the exact published file list.

## [0.1.0] - 2026-10-10

First public release, prepared for the Marketplace.

### Added

- MIT `LICENSE` file, matching the license already declared in `package.json`.
- Generated 128x128 PNG icon (`scripts/make-icon.mjs`, exposed as `npm run icon`) in place
  of the default placeholder, referenced from `package.json`.
- Marketplace search keywords.
- `Getting started` section that makes
  **Worktree Shell Start: Enable in this Workspace** an explicit, required setup step, since
  a configured operation otherwise never runs and reports no visible error.
- ESLint 10 with `typescript-eslint` (flat config), plus `lint`, `lint:fix`, and a `ci`
  script that runs lint, typecheck and tests in order.
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) running lint, typecheck, test and
  package on pull requests and pushes to `main`, with concurrency cancellation and the
  `.vsix` uploaded as an artifact. No publishing.
- `test/package.test.ts`, which fails when a development file leaks into the published
  package.
- Node globals for the Node-executed tooling (`.mjs`/`.cjs`) so `process`, `Buffer` and
  `module` are not flagged.

### Changed

- Bumped to `0.1.0` for the first public release and refreshed the `.vsix` name in the README.
- The minified production build now runs from the standard `vscode:prepublish` hook, so
  `vsce package` and `vsce publish` always build rather than packaging whatever happened to
  be in `dist/`.
- Consolidated the manual `tasks.json` entry and its rationale into the trigger-location
  section, leaving a single setup flow.

### Fixed

- An invalid `--config` now attaches the original `JSON.parse` error as `cause` instead of
  dropping it.

## [0.0.2] - 2026-10-10

### Fixed

- **Activation failure**: `jsonc-parser`'s UMD entry passes `require` to its factory as a
  parameter, so esbuild could not follow `require('./impl/format')` and the emitted bundle
  kept those calls. Activating the extension failed with
  `Cannot find module './impl/format'`. The package is now aliased to its ESM build, whose
  static imports bundle correctly (bundle grows from 25 KB to 61 KB, 26 KB minified, now that
  the real implementation is inlined).

### Added

- `test/bundle.test.ts` loads the built bundle in a sandbox with a stubbed `vscode` module,
  activates it, runs the enable command, resolves the configured task, and pins the
  untrusted-workspace notice task — an unresolvable dependency can no longer ship silently,
  which the source-importing unit tests could not catch.

## [0.0.1] - 2026-10-10

### Added

- Initial implementation of Worktree Shell Start: a VS Code extension that runs a
  user-defined shell hook when the built-in Git extension creates a new worktree.
- Environment variables exported to the hook: `VSCODE_REPOSITORY_DIR`, `VSCODE_WORKTREE_DIR`,
  `VSCODE_WORKTREE_NAME`, `VSCODE_WORKTREE_BRANCH`, `VSCODE_WORKTREE_REF` and
  `VSCODE_GIT_COMMON_DIR`.
- Trigger via a `tasks.json` entry with `runOn: worktreeCreated` — the only stable route,
  since the programmatic `Task.runOptions` API is still proposed.
- Task provider that resolves that entry into a Node runner invocation carrying the
  configured operations as JSON, so the script text is never shell-quoted.
- Runner that derives every path from `git worktree list --porcelain`, normalizes CRLF,
  writes a temporary script, executes it through bash with an `sh` fallback, and propagates
  the exit code.
- Commands: **Run Hook for Current Folder** and **Enable in this Workspace**.
- Settings: `worktreeShellStart.enabled`, `script`, `shell`, `args` and
  `runInUntrustedWorkspaces` (user-settings-only override).
- Workspace-trust gating, an output channel, and a failure notification.
- 63 unit and integration tests, a development-host fixture, a local runner script and
  documentation.

### Fixed

- Restricted-window task detection runs through `getKnownTasks()`, which is not trust gated,
  so VS Code asked the extension for the configured hook task and logged
  *"The worktree-shell-start task detection didn't contribute a task ... The task will be
  ignored"* when the provider declined. The extension now contributes an explanatory notice
  task for untrusted workspaces, which is never started automatically there because the Git
  extension is disabled.

### Changed

- Every `resolveTask` decision is now logged, and a throwing `resolveTask` reports the reason
  instead of letting VS Code swallow it.
- The worktree path is named in the task-end log line and in the failure notification.
- Added **Worktree Shell Start: Show Diagnostics** (trust, settings, task visibility).
- Documented the log line and where the trigger has to live (workspace or user tasks).
