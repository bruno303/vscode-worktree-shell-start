import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { executeScript, findExecutable, normalizeScript } from '../src/runner/script';

function processEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  return env;
}

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wss-script-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('normalizeScript', () => {
  it('adds a shebang when the operations have none', () => {
    expect(normalizeScript('echo hi', 'bash')).toBe('#!/usr/bin/env bash\necho hi\n');
  });

  it('keeps a shebang the user wrote', () => {
    expect(normalizeScript('#!/bin/sh\necho hi\n', 'bash')).toBe('#!/bin/sh\necho hi\n');
  });

  it('normalizes CRLF pasted from Windows', () => {
    expect(normalizeScript('echo one\r\necho two', 'sh')).toBe('#!/usr/bin/env sh\necho one\necho two\n');
  });

  it('does not add a second trailing newline', () => {
    expect(normalizeScript('echo hi\n', 'sh').endsWith('hi\n')).toBe(true);
    expect(normalizeScript('echo hi\n', 'sh').endsWith('hi\n\n')).toBe(false);
  });
});

describe('findExecutable', () => {
  const isExecutable = (file: string): boolean => file === '/usr/bin/bash' || file === '/bin/sh';

  it('finds a program on PATH', () => {
    expect(findExecutable('bash', { PATH: '/nope:/usr/bin' }, isExecutable)).toBe('/usr/bin/bash');
    expect(findExecutable('sh', { PATH: '/bin' }, isExecutable)).toBe('/bin/sh');
  });

  it('returns undefined when nothing matches', () => {
    expect(findExecutable('zsh', { PATH: '/bin:/usr/bin' }, isExecutable)).toBeUndefined();
    expect(findExecutable('bash', {}, isExecutable)).toBeUndefined();
    expect(findExecutable('bash', { PATH: '' }, isExecutable)).toBeUndefined();
  });

  it('accepts an absolute path only when it is executable', () => {
    expect(findExecutable('/usr/bin/bash', { PATH: '' }, isExecutable)).toBe('/usr/bin/bash');
    expect(findExecutable('/usr/bin/zsh', { PATH: '' }, isExecutable)).toBeUndefined();
  });
});

describe('executeScript', () => {
  it('runs the operations in the given directory with the exported environment', () => {
    const dir = tempDir();
    const out = join(dir, 'out.txt');
    const messages: string[] = [];

    const exitCode = executeScript({
      script: 'printf "%s" "$(pwd)" > "$OUT"\nprintf "%s" "$VSCODE_WORKTREE_NAME" >> "$OUT"',
      shell: 'sh',
      args: [],
      cwd: dir,
      env: { ...processEnv(), OUT: out, VSCODE_WORKTREE_NAME: 'wt-feature' },
      log: (message) => messages.push(message),
    });

    expect(exitCode).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(`${realpathSync(dir)}wt-feature`);
    expect(messages.some((message) => message.startsWith('Running '))).toBe(true);
  });

  it('passes extra arguments as positional parameters', () => {
    const dir = tempDir();
    const out = join(dir, 'args.txt');

    const exitCode = executeScript({
      script: 'printf "%s-%s" "$1" "$2" > "$OUT"',
      shell: 'sh',
      args: ['one', 'two'],
      cwd: dir,
      env: { ...processEnv(), OUT: out },
      log: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe('one-two');
  });

  it('propagates the exit code of the operations', () => {
    const dir = tempDir();
    const exitCode = executeScript({
      script: 'echo failing\nexit 9',
      shell: 'sh',
      args: [],
      cwd: dir,
      env: processEnv(),
      log: () => undefined,
    });
    expect(exitCode).toBe(9);
  });

  it('runs CRLF operations without a stray carriage return', () => {
    const dir = tempDir();
    const out = join(dir, 'crlf.txt');
    const exitCode = executeScript({
      script: 'printf "%s" one > "$OUT"\r\nprintf "%s" two >> "$OUT"\r\n',
      shell: 'sh',
      args: [],
      cwd: dir,
      env: { ...processEnv(), OUT: out },
      log: () => undefined,
    });
    expect(exitCode).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe('onetwo');
  });

  it('does nothing for empty operations', () => {
    const messages: string[] = [];
    const exitCode = executeScript({
      script: '   \n',
      shell: 'sh',
      args: [],
      cwd: tempDir(),
      env: processEnv(),
      log: (message) => messages.push(message),
    });
    expect(exitCode).toBe(0);
    expect(messages).toEqual(['No operations configured; nothing to do.']);
  });

  it('falls back to sh when the configured shell is missing', () => {
    const messages: string[] = [];
    const exitCode = executeScript({
      script: 'true',
      shell: 'definitely-not-a-shell',
      args: [],
      cwd: tempDir(),
      env: processEnv(),
      log: (message) => messages.push(message),
    });
    expect(exitCode).toBe(0);
    expect(messages.some((message) => message.includes("falling back to 'sh'"))).toBe(true);
  });

  it('fails with 127 when no shell can be found', () => {
    const messages: string[] = [];
    const exitCode = executeScript({
      script: 'true',
      shell: 'definitely-not-a-shell',
      args: [],
      cwd: tempDir(),
      env: { PATH: '' },
      log: (message) => messages.push(message),
    });
    expect(exitCode).toBe(127);
    expect(messages.some((message) => message.includes('was not found in PATH'))).toBe(true);
  });
});
