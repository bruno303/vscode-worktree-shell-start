import { describe, expect, it } from 'vitest';
import { parseRunnerConfig } from '../src/runner/config';

describe('parseRunnerConfig', () => {
  it('parses a full configuration', () => {
    const config = parseRunnerConfig(
      JSON.stringify({ script: 'echo hi\n', shell: 'zsh', args: ['a', 'b'] }),
    );
    expect(config).toEqual({ script: 'echo hi\n', shell: 'zsh', args: ['a', 'b'] });
  });

  it('keeps newlines, quotes and variables intact', () => {
    const script = 'cp "$VSCODE_REPOSITORY_DIR/.env" "$VSCODE_WORKTREE_DIR/.env"\necho \'done\'';
    const config = parseRunnerConfig(JSON.stringify({ script, shell: 'bash', args: [] }));
    expect(config.script).toBe(script);
  });

  it('defaults the shell to bash when missing or blank', () => {
    expect(parseRunnerConfig(JSON.stringify({ script: 'true' })).shell).toBe('bash');
    expect(parseRunnerConfig(JSON.stringify({ script: 'true', shell: '   ' })).shell).toBe('bash');
  });

  it('drops non-string arguments', () => {
    const config = parseRunnerConfig(JSON.stringify({ script: 'true', args: ['a', 3, null, 'b'] }));
    expect(config.args).toEqual(['a', 'b']);
  });

  it('rejects a missing, malformed or wrongly typed configuration', () => {
    expect(() => parseRunnerConfig(undefined)).toThrow(/missing --config/);
    expect(() => parseRunnerConfig('')).toThrow(/missing --config/);
    expect(() => parseRunnerConfig('{oops')).toThrow(/not valid JSON/);
    expect(() => parseRunnerConfig('[1,2]')).toThrow(/must be a JSON object/);
    expect(() => parseRunnerConfig(JSON.stringify({ shell: 'bash' }))).toThrow(/script must be a string/);
  });
});
