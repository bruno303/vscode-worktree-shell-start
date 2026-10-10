#!/usr/bin/env bash
#
# Runs the worktree hook for a checkout without VS Code, using the same runner
# the extension uses. Useful for iterating on the operations quickly.
#
#   cd <checkout-to-test>
#   /path/to/repo/scripts/run-hook-local.sh [path/to/settings.json]
#
# The optional argument points at a settings.json containing
# `worktreeShellStart.*` values; it defaults to ./.vscode/settings.json of the
# current directory. The hook always runs against the *current* directory.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
settings_file="${1:-.vscode/settings.json}"

if [ ! -f "$settings_file" ]; then
  echo "settings file not found: $settings_file" >&2
  exit 2
fi

config="$(
  node -e '
    const fs = require("fs");
    const settings = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(
      JSON.stringify({
        script: settings["worktreeShellStart.script"] || "",
        shell: settings["worktreeShellStart.shell"] || "bash",
        args: settings["worktreeShellStart.args"] || [],
      }),
    );
  ' "$settings_file"
)"

exec node "$repo_root/dist/runner.js" --config "$config"
