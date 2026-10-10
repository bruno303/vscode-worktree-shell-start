import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/** One `git worktree list --porcelain` entry. */
export interface WorktreeEntry {
  path: string;
  head?: string;
  branch?: string;
  detached?: boolean;
  bare?: boolean;
  locked?: boolean;
  prunable?: boolean;
}

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runGit(args: string[], cwd: string): GitResult {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? result.error.message : ''),
  };
}

/**
 * Parses `git worktree list --porcelain`.
 *
 * Entries are separated by a blank line; the main working tree is listed first
 * and a bare repository is marked with a `bare` line.
 */
export function parseWorktreePorcelain(stdout: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | undefined;

  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line === '') {
      if (current) {
        entries.push(current);
        current = undefined;
      }
      continue;
    }

    const separator = line.indexOf(' ');
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1);

    switch (key) {
      case 'worktree':
        if (current) {
          entries.push(current);
        }
        current = { path: value };
        break;
      case 'HEAD':
        if (current) current.head = value;
        break;
      case 'branch':
        if (current) current.branch = value;
        break;
      case 'detached':
        if (current) current.detached = true;
        break;
      case 'bare':
        if (current) current.bare = true;
        break;
      case 'locked':
        if (current) current.locked = true;
        break;
      case 'prunable':
        if (current) current.prunable = true;
        break;
      default:
        break;
    }
  }

  if (current) {
    entries.push(current);
  }

  return entries;
}

/**
 * The repository directory is the main working tree, which `git worktree list`
 * always reports first. For a bare repository that is the bare repository
 * itself.
 */
export function resolveRepositoryDir(entries: WorktreeEntry[]): string | undefined {
  return entries[0]?.path;
}

/** Resolves symlinks so the task cwd can be matched against git's paths. */
export function canonicalPath(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

export function findEntryForDir(entries: WorktreeEntry[], dir: string): WorktreeEntry | undefined {
  const target = canonicalPath(dir);
  return entries.find((entry) => canonicalPath(entry.path) === target);
}

export function resolveTopLevel(cwd: string): string | undefined {
  const result = runGit(['rev-parse', '--show-toplevel'], cwd);
  const value = result.stdout.trim();
  return result.code === 0 && value !== '' ? value : undefined;
}

/**
 * `--path-format=absolute` needs git 2.31+; older git is handled by resolving
 * the relative result against the working directory.
 */
export function resolveGitCommonDir(cwd: string): string | undefined {
  const absolute = runGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  const absoluteValue = absolute.stdout.trim();
  if (absolute.code === 0 && absoluteValue !== '') {
    return absoluteValue;
  }

  const relative = runGit(['rev-parse', '--git-common-dir'], cwd);
  const relativeValue = relative.stdout.trim();
  if (relative.code === 0 && relativeValue !== '') {
    return isAbsolute(relativeValue) ? relativeValue : resolve(cwd, relativeValue);
  }

  return undefined;
}
