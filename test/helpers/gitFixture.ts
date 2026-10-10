import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface GitRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs git with the user/system configuration isolated from the host. */
export function git(args: string[], cwd: string): GitRun {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? result.error.message : ''),
  };
}

export function mustGit(args: string[], cwd: string): string {
  const result = git(args, cwd);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

export interface RepoFixture {
  root: string;
  main: string;
  worktree: string;
  dispose: () => void;
}

const COMMIT_AUTHOR = ['-c', 'user.email=test@example.com', '-c', 'user.name=Worktree Test'];

/**
 * Creates a repository with a committed file plus one branch worktree:
 *
 *   <root>/main         main working tree
 *   <root>/wt-feature   worktree on branch `feature`
 */
export function createRepoFixture(): RepoFixture {
  const root = mkdtempSync(join(tmpdir(), 'wss-test-'));
  const main = join(root, 'main');
  mkdirSync(main);

  mustGit(['init', '-q', '-b', 'main'], main);
  writeFileSync(join(main, 'README.md'), '# fixture\n');
  writeFileSync(join(main, '.env'), 'SECRET=fixture\n');
  mustGit(['add', '.'], main);
  mustGit([...COMMIT_AUTHOR, 'commit', '-q', '-m', 'init'], main);

  const worktree = join(root, 'wt-feature');
  mustGit(['worktree', 'add', '-q', '-b', 'feature', worktree], main);

  return {
    root,
    main,
    worktree,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function createTempDir(prefix = 'wss-test-'): { path: string; dispose: () => void } {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return { path, dispose: () => rmSync(path, { recursive: true, force: true }) };
}
