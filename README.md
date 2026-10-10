# Worktree Shell Start

Runs a shell hook when VS Code creates a new Git worktree, exporting the repository and worktree paths as environment variables — so you can copy `.env` and other git-ignored files, or run any other per-worktree setup.

## Getting started

Three steps. The second one is easy to miss, and nothing runs without it.

1. **Write the operations** in the **`worktreeShellStart.script`** setting — Settings → search for `worktree` and paste them into the multiline field (or set `"worktreeShellStart.script"` in `settings.json`). No shebang needed.
2. **Run the command `Worktree Shell Start: Enable in this Workspace`** from the Command Palette (`Ctrl/Cmd+Shift+P`).

   This step is **required**. It adds the `runOn: worktreeCreated` task to `.vscode/tasks.json`, and *that task* — not the setting on its own — is what makes VS Code call the hook when a worktree is created. With operations configured but no task entry, nothing runs and nothing tells you why. See [Where does the trigger have to live?](#where-does-the-trigger-have-to-live) for the manual entry and for applying it to every repository at once.
3. **Create a worktree**: Command Palette → **Git: Create Worktree…**. A **Worktree hook** task terminal opens showing the exported variables and the output of your operations, and `View → Output → Worktree Shell Start` records `Hook finished successfully for <worktree path>.`

To try the operations out first, without creating a worktree, run **Worktree Shell Start: Run Hook for Current Folder**.

## Why this exists

`git worktree` gives you a clean checkout, but git-ignored files (`.env`, local config, caches) do not come along. VS Code can already copy those files (`git.worktreeIncludeFiles`) and symlink folders such as `node_modules` (`git.worktreeSymlinkFolders`). This extension covers everything beyond that: arbitrary shell operations, with useful paths exported.

## Requirements

- **VS Code 1.141 or newer** — the bundled Git extension must support `runOn: worktreeCreated`.
- The worktree must be created **by VS Code** ("Git: Create Worktree…"). Worktrees created with `git worktree add` in a terminal cannot be detected: no stable VS Code API exposes them.
- `git` 2.31+ is recommended (`git rev-parse --path-format=absolute`); older versions are handled with a fallback.
- The `task.autoDetect` setting must not be `off`, otherwise task providers are never asked to resolve the hook task.

## Environment variables

| Variable | Description |
| --- | --- |
| `VSCODE_REPOSITORY_DIR` | Main working tree root — the checkout that owns `.git` (for a bare repository, the bare repository directory). |
| `VSCODE_WORKTREE_DIR` | Path of the new worktree, exactly as git reports it. |
| `VSCODE_WORKTREE_NAME` | Last path segment of `VSCODE_WORKTREE_DIR`. |
| `VSCODE_WORKTREE_BRANCH` | Branch name, or empty if the worktree is detached. |
| `VSCODE_WORKTREE_REF` | Commit SHA of the worktree HEAD; empty for an unborn branch. |
| `VSCODE_GIT_COMMON_DIR` | Absolute path of the shared git directory (the main checkout's `.git`). |

## Example operations

```sh
set -e
cp "$VSCODE_REPOSITORY_DIR/.env" "$VSCODE_WORKTREE_DIR/.env"
[ -f "$VSCODE_REPOSITORY_DIR/.env.local" ] && cp "$VSCODE_REPOSITORY_DIR/.env.local" "$VSCODE_WORKTREE_DIR/.env.local"
echo "$(date -Is) created $VSCODE_WORKTREE_NAME on ${VSCODE_WORKTREE_BRANCH:-detached}" >> "$VSCODE_REPOSITORY_DIR/.worktrees.log"
```

Notes:

- Operations run with `bash` by default and **without `set -e`**; add it yourself to stop at the first failure.
- CRLF line endings are normalized, so pasting from Windows is safe.
- `$1`, `$2`, … are available from `worktreeShellStart.args`.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `worktreeShellStart.enabled` | `true` | Turn the hook on or off. |
| `worktreeShellStart.script` | `""` | The shell operations (multiline). Empty disables the hook. |
| `worktreeShellStart.shell` | `"bash"` | Shell used to run the operations; falls back to `sh` when not found. |
| `worktreeShellStart.args` | `[]` | Arguments passed to the operations. |
| `worktreeShellStart.runInUntrustedWorkspaces` | `false` | Run the hook in untrusted workspaces. Only the value from **user** settings is honored. |

## Commands

- **Worktree Shell Start: Enable in this Workspace** — adds the `worktreeCreated` task entry to `.vscode/tasks.json`, preserving comments and formatting.
- **Worktree Shell Start: Run Hook for Current Folder** — re-runs the operations against the current checkout. This is the fast way to iterate on the script without creating a worktree; if it fails, an error notification points at the task terminal.
- **Worktree Shell Start: Show Diagnostics** — writes everything VS Code knows about the hook (trust state, resolved settings, whether a `worktree-shell-start` task is visible, its scope and `runOn`) to the output channel.

## Where does the trigger have to live?

The task entry is what makes the Git extension call the hook, so it has to exist in the workspace context:

- **Per repository** (recommended — committable, so everyone on the project gets it): `.vscode/tasks.json`, added by **Worktree Shell Start: Enable in this Workspace**.
- **Once for every repository**: the identical entry in your **user tasks** (`Tasks: Open User Tasks` from the Command Palette).

Either way the entry looks like this:

```jsonc
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "worktree-shell-start",
      "label": "Worktree hook",
      "runOptions": { "runOn": "worktreeCreated" }
    }
  ]
}
```

It has to live in `tasks.json` because the programmatic equivalent (`Task.runOptions`) is still a proposed API, which published extensions cannot use.

The operations themselves come from the `worktreeShellStart.*` settings, which can also be set per workspace or globally in your user settings. Run **Worktree Shell Start: Show Diagnostics** to confirm that VS Code can actually see the task.

## Understanding the log lines

**`The worktree-shell-start task detection didn't contribute a task for the following configuration: … The task will be ignored.`**

That message comes from VS Code, not from the hook, and it appears in **restricted (untrusted) windows**. Task detection runs there through a path that is *not* trust gated: it asks this extension to resolve the configured task, and the extension refuses to hand out a task that would execute operations from an untrusted workspace. VS Code 1.141 reports that refusal as an error, so a harmless notice task is contributed instead — in an untrusted window it prints `Hook not run: the workspace is not trusted…` and executes nothing.

Newly created worktree windows hit this, because a fresh path has never been trusted and VS Code shows **Restricted Mode** in the title bar until you trust it. Worktree creation itself is unaffected: the hook already ran in the window you created the worktree from.

**To be sure a run happened**, look at:

1. the **Worktree hook** task terminal in the window that created the worktree — it prints the exported variables and the output of your operations, and
2. `View → Output → Worktree Shell Start`, which logs `Hook finished successfully for <worktree path>.` (or the failing exit code together with the path).

## How it works

1. VS Code's Git extension creates the worktree, copies include files, symlinks folders, and finally runs every task whose `runOptions.runOn` is `worktreeCreated` — with the task's working directory set to the new worktree.
2. This extension provides the `worktree-shell-start` task type. When the Git extension resolves your `tasks.json` entry, `resolveTask` produces a process execution for a small Node runner, passing your settings as JSON (so the script text is never quoted through a shell).
3. The runner reads `git worktree list --porcelain` from its working directory, which yields the main checkout, the worktree path, branch and ref. It writes the operations to a temporary script (with a shebang and normalized line endings) and executes it through the configured shell with the six variables exported. The temporary file is removed afterwards, and the script's exit code becomes the task's exit code.

## Limitations

- **VS Code-initiated worktrees only** (see Requirements).
- **Workspace trust**: the hook is skipped in untrusted workspaces. This is also enforced by VS Code, since the task service returns no tasks there and the Git extension disables itself.
- **Multi-root workspaces**: settings are resolved at window level, so folder-level overrides of `worktreeShellStart.*` do not apply to the hook; the trigger is read from the first folder's `.vscode/tasks.json`.
- **Hint about a missing trigger** only inspects the workspace `.vscode/tasks.json`. If you keep the task in your *user* tasks, ignore the hint (and choose "Don't Show Again").
- **Windows** is best-effort: the configured shell must accept `<script-path>` as its first argument, so `pwsh` is not supported. WSL/Remote is the primary target.
- **Very large scripts**: the operations are passed to the runner as a single JSON argument; Linux caps one argument at ~128 KB.

## Development

```bash
npm ci          # reproducible install; use npm_config_cache="$PWD/.npm-cache" if ~/.npm is read-only
npm run lint    # ESLint (flat config, typescript-eslint)
npm run typecheck
npm test        # builds, then runs unit + integration tests against a real git repository
npm run package # produces the .vsix
npm run ci      # lint + typecheck + test, in the order CI runs them
```

Every pull request and push to `main` runs lint, typecheck, test and package on Node 24 through [`.github/workflows/ci.yml`](.github/workflows/ci.yml), and uploads the built `.vsix` as an artifact. Publishing is not automated.

[`test/package.test.ts`](test/package.test.ts) pins the published file list, because `vsce` ships every file that [`.vscodeignore`](.vscodeignore) does not exclude — a new config file would otherwise leak into the package silently.

The Marketplace icon is generated rather than hand-drawn: `npm run icon` rewrites `images/icon.png` from the geometry at the top of `scripts/make-icon.mjs`.

## Testing

### 1. The operations alone, no VS Code

The runner is a plain Node script, so you can exercise your operations in any checkout:

```bash
./scripts/e2e-fixture.sh
cd .fixtures/demo-check
../../scripts/run-hook-local.sh ../hook-demo/.vscode/settings.json
```

Expect the exported variables plus `hook: copied .env -> SECRET=fixture`, and `.fixtures/demo-check/.env` to exist afterwards. This is the fastest loop while writing the operations.

### 2. The real trigger, in a development host

```bash
./scripts/e2e-fixture.sh
```

Then pick **Run Extension (fixture repo)** in Run and Debug (or press F5) and, in the window that opens, run **Git: Create Worktree…** from the Command Palette. A **Worktree hook** task terminal should appear with:

```
[worktree-shell-start] repository=…/.fixtures/hook-demo
[worktree-shell-start] worktree=…/<new worktree>
[worktree-shell-start] name=<new worktree> branch=<branch> ref=<sha>
Running /usr/bin/bash /tmp/worktree-shell-start-XXXXXX/hook.sh
hook: copied .env -> SECRET=fixture
```

and the new worktree should contain a copied `.env`.

### 3. Re-running without creating a worktree

**Worktree Shell Start: Run Hook for Current Folder** runs the operations against the current checkout, in a development host or an installed window. Failures raise the same notification.

### 4. The installed extension

```bash
npm run package
```

A workspace extension has to be installed on the **WSL side**, not on Windows. The most reliable way is the remote CLI:

```bash
"$(find ~/.vscode-server/bin -maxdepth 3 -name code-server -type f | head -1)" \
  --install-extension "$PWD/vscode-worktree-shell-start-0.1.0.vsix"
```

Then run **Developer: Reload Window**. You can also use **Extensions → … → Install from VSIX…** from a WSL window, but that file picker starts on the Windows side, so keeping a copy under `/mnt/c/…` is usually easier to reach.

### 5. Automated tests

```bash
npm test          # unit tests plus integration tests against a real git repository fixture
npm run typecheck
```

### When the trigger does not fire

- **Worktree Shell Start: Show Diagnostics** — reports the trust state, the resolved settings, and whether a task of this type is visible to VS Code at all.
- **View → Output → Worktree Shell Start** — every `resolveTask` call logs its decision (run, or which skip reason).
- The **Git** extension output channel — it logs when a `worktreeCreated` task cannot be retargeted.
- `"task.autoDetect": "off"` disables task providers, so the hook task is never resolved.
- In an untrusted workspace the task service returns no tasks at all.

