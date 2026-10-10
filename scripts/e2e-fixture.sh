#!/usr/bin/env bash
#
# Creates a throwaway repository used to verify the worktree hook.
#
#   ./scripts/e2e-fixture.sh
#
# Creates:
#   .fixtures/hook-demo    repository with an inline hook + the task entry
#   .fixtures/demo-check   an existing worktree, for testing the runner alone
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixtures="$repo_root/.fixtures"
fixture="$fixtures/hook-demo"

rm -rf "$fixtures"
mkdir -p "$fixture/.vscode"
cd "$fixture"

git init -q -b main
git config user.email "fixture@example.com"
git config user.name "Worktree Hook Fixture"

printf 'SECRET=fixture\n' > .env
printf '.env\n' > .gitignore
printf '# worktree hook fixture\n' > README.md

# The operations are the same ones the extension runs; the guard keeps a manual
# run inside the main checkout from copying .env onto itself.
cat > .vscode/settings.json <<'JSON'
{
  "worktreeShellStart.script": "echo \"hook: name=$VSCODE_WORKTREE_NAME branch=${VSCODE_WORKTREE_BRANCH:-detached}\"\necho \"hook: repository=$VSCODE_REPOSITORY_DIR\"\necho \"hook: worktree=$VSCODE_WORKTREE_DIR\"\nif [ \"$VSCODE_REPOSITORY_DIR\" != \"$VSCODE_WORKTREE_DIR\" ]; then\n  cp \"$VSCODE_REPOSITORY_DIR/.env\" \"$VSCODE_WORKTREE_DIR/.env\"\n  echo \"hook: copied .env -> $(cat \"$VSCODE_WORKTREE_DIR/.env\")\"\nelse\n  echo \"hook: inside the main checkout, nothing to copy\"\nfi"
}
JSON

cat > .vscode/tasks.json <<'JSON'
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
JSON

git add -A
git commit -q -m "fixture"

git worktree add -q -b demo-check "$fixtures/demo-check"

cat <<INFO
Fixture ready.

  repository  $fixture
  worktree    $fixtures/demo-check

Test the operations without VS Code:
  cd $fixtures/demo-check
  $repo_root/scripts/run-hook-local.sh $fixture/.vscode/settings.json

Test the real trigger in a development host:
  1. Run and Debug -> "Run Extension (fixture repo)" (or press F5).
  2. In the new window: "Git: Create Worktree..." from the Command Palette.
  3. Expect a "Worktree hook" task terminal printing the exported variables and
     a copied .env inside the new worktree.

Check the failure notification by setting worktreeShellStart.script to "exit 3".
INFO
