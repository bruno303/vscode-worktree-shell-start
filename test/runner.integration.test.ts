import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRepoFixture, createTempDir, type RepoFixture } from './helpers/gitFixture';

const RUNNER = resolve(process.cwd(), 'dist/runner.js');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runRunner(cwd: string, config: unknown, extraEnv: Record<string, string> = {}): RunResult {
  const result = spawnSync(process.execPath, [RUNNER, '--config', JSON.stringify(config)], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? result.error.message : ''),
  };
}

function runRunnerRaw(cwd: string, args: string[], extraEnv: Record<string, string> = {}): RunResult {
  const result = spawnSync(process.execPath, [RUNNER, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? result.error.message : ''),
  };
}

const RECORD_SCRIPT = [
  '{',
  '  echo "repository=$VSCODE_REPOSITORY_DIR"',
  '  echo "worktree=$VSCODE_WORKTREE_DIR"',
  '  echo "name=$VSCODE_WORKTREE_NAME"',
  '  echo "branch=$VSCODE_WORKTREE_BRANCH"',
  '  echo "ref=$VSCODE_WORKTREE_REF"',
  '  echo "common=$VSCODE_GIT_COMMON_DIR"',
  '} > "$OUT"',
].join('\n');

function readRecorded(path: string): Record<string, string> {
  const recorded: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
    const separator = line.indexOf('=');
    recorded[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return recorded;
}

describe('runner against a real repository', () => {
  let fixture: RepoFixture;

  beforeAll(() => {
    fixture = createRepoFixture();
  });

  afterAll(() => {
    fixture?.dispose();
  });

  it('exports every documented variable for a created worktree', () => {
    const out = join(fixture.root, 'recorded.txt');
    const result = runRunner(
      fixture.worktree,
      { script: RECORD_SCRIPT, shell: 'sh', args: [] },
      { OUT: out },
    );

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);

    const recorded = readRecorded(out);
    expect(recorded.repository).toBe(realpathSync(fixture.main));
    expect(recorded.worktree).toBe(realpathSync(fixture.worktree));
    expect(recorded.name).toBe('wt-feature');
    expect(recorded.branch).toBe('feature');
    expect(recorded.ref).toMatch(/^[0-9a-f]{40}$/);
    expect(recorded.common).toBe(join(realpathSync(fixture.main), '.git'));
  });

  it('reports the repository itself when run from the main working tree', () => {
    const out = join(fixture.root, 'recorded-main.txt');
    const result = runRunner(fixture.main, { script: RECORD_SCRIPT, shell: 'sh' }, { OUT: out });

    expect(result.code).toBe(0);
    const recorded = readRecorded(out);
    expect(recorded.repository).toBe(realpathSync(fixture.main));
    expect(recorded.worktree).toBe(realpathSync(fixture.main));
    expect(recorded.name).toBe('main');
    expect(recorded.branch).toBe('main');
  });

  it('leaves the branch empty for a detached worktree', () => {
    const detached = join(fixture.root, 'wt-detached');
    const added = spawnSync('git', ['worktree', 'add', '-q', '--detach', detached], {
      cwd: fixture.main,
      encoding: 'utf8',
    });
    expect(added.status).toBe(0);

    const out = join(fixture.root, 'recorded-detached.txt');
    const result = runRunner(detached, { script: RECORD_SCRIPT, shell: 'sh' }, { OUT: out });

    expect(result.code).toBe(0);
    const recorded = readRecorded(out);
    expect(recorded.name).toBe('wt-detached');
    expect(recorded.branch).toBe('');
    expect(recorded.ref).toMatch(/^[0-9a-f]{40}$/);
  });

  it('propagates a failing script exit code', () => {
    const result = runRunner(fixture.worktree, {
      script: 'echo "about to fail"\nexit 9',
      shell: 'sh',
    });
    expect(result.code).toBe(9);
    expect(result.stdout).toContain('about to fail');
  });

  it('does nothing when no operations are configured', () => {
    const result = runRunner(fixture.worktree, { script: '   ', shell: 'sh' });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No operations configured');
  });

  it('passes arguments through to the operations', () => {
    const result = runRunner(fixture.worktree, {
      script: 'echo "args=$1,$2"',
      shell: 'sh',
      args: ['one', 'two'],
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('args=one,two');
  });
});

describe('runner argument handling', () => {
  let temp: { path: string; dispose: () => void };

  beforeAll(() => {
    temp = createTempDir();
  });

  afterAll(() => {
    temp?.dispose();
  });

  it('fails with 2 when --config is missing', () => {
    const result = runRunnerRaw(temp.path, []);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Usage:');
  });

  it('fails with 2 when --config is not valid JSON', () => {
    const result = runRunnerRaw(temp.path, ['--config', '{oops']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('not valid JSON');
  });

  it('fails with 3 outside a git repository', () => {
    const result = runRunner(temp.path, { script: 'true', shell: 'sh' });
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('git worktree list');
  });
});
