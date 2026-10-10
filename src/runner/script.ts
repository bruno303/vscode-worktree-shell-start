import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';

/**
 * Turns the configured operations into a standalone script.
 *
 * Line endings are normalized so a pasted Windows script cannot break the
 * shell, a shebang is added when the user did not provide one, and the file is
 * terminated with a newline.
 */
export function normalizeScript(script: string, shell: string): string {
  let normalized = script.replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('#!')) {
    normalized = `#!/usr/bin/env ${shell}\n${normalized}`;
  }
  if (!normalized.endsWith('\n')) {
    normalized += '\n';
  }
  return normalized;
}

export function defaultIsExecutable(file: string): boolean {
  try {
    const stat = statSync(file);
    if (!stat.isFile()) {
      return false;
    }
    return process.platform === 'win32' ? true : (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

export function findExecutable(
  name: string,
  env: Record<string, string | undefined>,
  isExecutable: (file: string) => boolean = defaultIsExecutable,
): string | undefined {
  if (isAbsolute(name) || name.includes('/') || name.includes('\\')) {
    return isExecutable(name) ? name : undefined;
  }

  const extensions =
    process.platform === 'win32'
      ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter((value) => value !== '')
      : [''];

  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (dir === '') {
      continue;
    }
    for (const extension of extensions) {
      const candidate = join(dir, name + extension);
      if (isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

/**
 * Writes the operations to a temporary script and runs it through the
 * configured shell.
 *
 * The script is always invoked through the shell binary (never executed
 * directly) so that a `noexec` temporary directory does not matter.
 */
export function executeScript(options: {
  script: string;
  shell: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  log: (message: string) => void;
}): number {
  const { script, shell, args, cwd, env, log } = options;

  if (script.trim() === '') {
    log('No operations configured; nothing to do.');
    return 0;
  }

  let shellPath = findExecutable(shell, env);
  if (!shellPath && shell !== 'sh') {
    log(`Shell '${shell}' was not found in PATH; falling back to 'sh'.`);
    shellPath = findExecutable('sh', env);
  }
  if (!shellPath) {
    log(`Error: shell '${shell}' was not found in PATH.`);
    return 127;
  }

  const directory = mkdtempSync(join(tmpdir(), 'worktree-shell-start-'));
  const scriptPath = join(directory, 'hook.sh');

  try {
    writeFileSync(scriptPath, normalizeScript(script, shell), { mode: 0o700 });
    log(`Running ${shellPath} ${scriptPath}`);
    const result = spawnSync(shellPath, [scriptPath, ...args], { cwd, env, stdio: 'inherit' });
    if (result.error) {
      log(`Error: failed to start ${shellPath}: ${result.error.message}`);
      return 127;
    }
    return result.status ?? 1;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
