import { describe, expect, it } from 'vitest';
import { findEntryForDir, parseWorktreePorcelain, resolveRepositoryDir } from '../src/runner/git';

const TWO_WORKTREES = `worktree /tmp/demo/main
HEAD b7e835111201227c190370e90121e65c6acb20eb
branch refs/heads/main

worktree /tmp/demo/wt-feature
HEAD b7e835111201227c190370e90121e65c6acb20eb
branch refs/heads/feature

`;

const BARE = `worktree /tmp/demo/bare.git
bare

worktree /tmp/demo/wt1
HEAD 0000000000000000000000000000000000000000
branch refs/heads/wt1

`;

describe('parseWorktreePorcelain', () => {
  it('parses multiple entries and keeps git order', () => {
    const entries = parseWorktreePorcelain(TWO_WORKTREES);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ path: '/tmp/demo/main', branch: 'refs/heads/main' });
    expect(entries[1]).toMatchObject({ path: '/tmp/demo/wt-feature', branch: 'refs/heads/feature' });
  });

  it('marks a bare repository', () => {
    const entries = parseWorktreePorcelain(BARE);
    expect(entries[0]).toMatchObject({ path: '/tmp/demo/bare.git', bare: true });
    expect(entries[0].head).toBeUndefined();
  });

  it('records a detached worktree without a branch', () => {
    const entries = parseWorktreePorcelain(
      'worktree /tmp/demo/detached\nHEAD abc123\ndetached\n\n',
    );
    expect(entries[0]).toMatchObject({ path: '/tmp/demo/detached', detached: true, head: 'abc123' });
    expect(entries[0].branch).toBeUndefined();
  });

  it('handles locked and prunable markers', () => {
    const entries = parseWorktreePorcelain(
      'worktree /tmp/demo/locked\nHEAD abc123\nbranch refs/heads/x\nlocked some reason\n\n' +
        'worktree /tmp/demo/gone\nHEAD abc123\nbranch refs/heads/y\nprunable gitdir file points nowhere\n\n',
    );
    expect(entries[0].locked).toBe(true);
    expect(entries[1].prunable).toBe(true);
  });

  it('keeps paths that contain spaces', () => {
    const entries = parseWorktreePorcelain('worktree /tmp/demo/my worktree\nHEAD abc\nbranch refs/heads/x\n\n');
    expect(entries[0].path).toBe('/tmp/demo/my worktree');
  });

  it('tolerates CRLF output and a missing trailing newline', () => {
    const entries = parseWorktreePorcelain('worktree /tmp/demo/main\r\nHEAD abc\r\nbranch refs/heads/main');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: '/tmp/demo/main', head: 'abc' });
  });

  it('returns an empty list for empty output', () => {
    expect(parseWorktreePorcelain('')).toEqual([]);
  });
});

describe('resolveRepositoryDir', () => {
  it('uses the main working tree, which git lists first', () => {
    expect(resolveRepositoryDir(parseWorktreePorcelain(TWO_WORKTREES))).toBe('/tmp/demo/main');
  });

  it('uses the bare repository directory when there is no working tree', () => {
    expect(resolveRepositoryDir(parseWorktreePorcelain(BARE))).toBe('/tmp/demo/bare.git');
  });

  it('returns undefined without entries', () => {
    expect(resolveRepositoryDir([])).toBeUndefined();
  });
});

describe('findEntryForDir', () => {
  it('matches a listed worktree', () => {
    const entries = parseWorktreePorcelain(TWO_WORKTREES);
    expect(findEntryForDir(entries, '/tmp/demo/wt-feature')?.branch).toBe('refs/heads/feature');
  });

  it('returns undefined for an unlisted directory', () => {
    const entries = parseWorktreePorcelain(TWO_WORKTREES);
    expect(findEntryForDir(entries, '/tmp/demo/elsewhere')).toBeUndefined();
  });
});
