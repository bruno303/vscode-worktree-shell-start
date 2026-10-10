import { describe, expect, it } from 'vitest';
import { buildHookEnv, HOOK_ENV_KEYS } from '../src/runner/env';
import { parseWorktreePorcelain } from '../src/runner/git';

const MAIN = '/home/dev/repo';
const WORKTREE = '/home/dev/repo-wt/feature-login';
const COMMON_DIR = '/home/dev/repo/.git';

describe('buildHookEnv', () => {
  it('exports the three documented variables plus the extras', () => {
    const entry = { path: WORKTREE, head: 'abc123', branch: 'refs/heads/feature-login' };
    const env = buildHookEnv({ entry, repositoryDir: MAIN, commonDir: COMMON_DIR });

    expect(env).toEqual({
      VSCODE_REPOSITORY_DIR: MAIN,
      VSCODE_WORKTREE_DIR: WORKTREE,
      VSCODE_WORKTREE_NAME: 'feature-login',
      VSCODE_WORKTREE_BRANCH: 'feature-login',
      VSCODE_WORKTREE_REF: 'abc123',
      VSCODE_GIT_COMMON_DIR: COMMON_DIR,
    });
    expect(Object.keys(env).sort()).toEqual([...HOOK_ENV_KEYS].sort());
  });

  it('strips the refs/heads prefix and leaves tag refs untouched', () => {
    const env = buildHookEnv({
      entry: { path: WORKTREE, head: 'abc', branch: 'refs/heads/nested/name' },
      repositoryDir: MAIN,
      commonDir: COMMON_DIR,
    });
    expect(env.VSCODE_WORKTREE_BRANCH).toBe('nested/name');
  });

  it('reports an empty branch for a detached worktree', () => {
    const env = buildHookEnv({
      entry: { path: WORKTREE, head: 'abc', detached: true },
      repositoryDir: MAIN,
      commonDir: COMMON_DIR,
    });
    expect(env.VSCODE_WORKTREE_BRANCH).toBe('');
    expect(env.VSCODE_WORKTREE_REF).toBe('abc');
  });

  it('reports an empty ref for an unborn HEAD', () => {
    const env = buildHookEnv({
      entry: { path: WORKTREE, head: '0000000000000000000000000000000000000000', branch: 'refs/heads/wt1' },
      repositoryDir: MAIN,
      commonDir: COMMON_DIR,
    });
    expect(env.VSCODE_WORKTREE_REF).toBe('');
  });

  it('points the repository directory at a bare repository', () => {
    const entries = parseWorktreePorcelain(
      `worktree ${MAIN}/bare.git\nbare\n\nworktree ${WORKTREE}\nHEAD abc\nbranch refs/heads/x\n\n`,
    );
    const env = buildHookEnv({
      entry: entries[1],
      repositoryDir: entries[0].path,
      commonDir: `${MAIN}/bare.git`,
    });
    expect(env.VSCODE_REPOSITORY_DIR).toBe(`${MAIN}/bare.git`);
    expect(env.VSCODE_WORKTREE_NAME).toBe('feature-login');
  });

  it('uses the last path segment for the worktree name', () => {
    const env = buildHookEnv({
      entry: { path: '/home/dev/repo/my worktree' },
      repositoryDir: MAIN,
      commonDir: COMMON_DIR,
    });
    expect(env.VSCODE_WORKTREE_NAME).toBe('my worktree');
  });
});
