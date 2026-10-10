import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `vsce` ships every file that .vscodeignore does not exclude, so adding a dev
 * file (an eslint config, a workflow, notes) silently widens the published
 * package. This test pins the published file list so that cannot happen
 * unnoticed.
 */
const VSCE = resolve(process.cwd(), 'node_modules', '@vscode', 'vsce', 'vsce');

const EXPECTED_FILES = [
  'LICENSE',
  'README.md',
  'dist/extension.js',
  'dist/runner.js',
  'images/icon.png',
  'package.json',
].sort();

function publishedFiles(): string[] {
  const result = spawnSync(process.execPath, [VSCE, 'ls', '--no-dependencies'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`vsce ls failed: ${result.stderr || result.stdout}`);
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort();
}

describe('published package contents', () => {
  it('has the vsce CLI available', () => {
    expect(existsSync(VSCE)).toBe(true);
  });

  it('contains exactly the intended files', () => {
    expect(publishedFiles()).toEqual(EXPECTED_FILES);
  });

  it('does not leak development files', () => {
    const files = publishedFiles();
    for (const forbidden of ['src/', 'test/', 'scripts/', '.github/', 'eslint.config.mjs', 'tsconfig.json']) {
      expect(files.filter((file) => file.startsWith(forbidden))).toEqual([]);
    }
  });
});
