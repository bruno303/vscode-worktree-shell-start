import { describe, expect, it } from 'vitest';
import {
  applyDefinitionOverrides,
  decideSkip,
  readHookConfig,
  skipReasonMessage,
  type ConfigReader,
  type RawHookConfig,
} from '../src/hookConfig';

function reader(
  values: Record<string, unknown>,
  globalValues: Record<string, unknown> = {},
): ConfigReader {
  return {
    get: <T>(section: string): T | undefined => values[section] as T | undefined,
    inspect: <T>(section: string): { globalValue?: T } => ({
      globalValue: globalValues[section] as T | undefined,
    }),
  };
}

const baseConfig: RawHookConfig = {
  enabled: true,
  script: 'echo hi',
  shell: 'bash',
  args: [],
  allowUntrustedWorkspaces: false,
};

describe('readHookConfig', () => {
  it('applies defaults for an unconfigured workspace', () => {
    expect(readHookConfig(reader({}))).toEqual({
      enabled: true,
      script: '',
      shell: 'bash',
      args: [],
      allowUntrustedWorkspaces: false,
    });
  });

  it('reads the configured values', () => {
    const config = readHookConfig(
      reader({ enabled: false, script: 'ls -la', shell: 'zsh', args: ['-x'] }),
    );
    expect(config).toMatchObject({ enabled: false, script: 'ls -la', shell: 'zsh', args: ['-x'] });
  });

  it('ignores a blank shell', () => {
    expect(readHookConfig(reader({ shell: '   ' })).shell).toBe('bash');
  });

  it('honors the untrusted-workspace override only from user settings', () => {
    expect(readHookConfig(reader({ runInUntrustedWorkspaces: true })).allowUntrustedWorkspaces).toBe(
      false,
    );
    expect(
      readHookConfig(reader({}, { runInUntrustedWorkspaces: true })).allowUntrustedWorkspaces,
    ).toBe(true);
  });
});

describe('decideSkip', () => {
  it('allows a configured hook in a trusted workspace', () => {
    expect(decideSkip(baseConfig, true)).toBeUndefined();
  });

  it('skips when disabled or empty', () => {
    expect(decideSkip({ ...baseConfig, enabled: false }, true)).toBe('disabled');
    expect(decideSkip({ ...baseConfig, script: '  \n ' }, true)).toBe('empty-script');
  });

  it('skips in an untrusted workspace unless the user opted in', () => {
    expect(decideSkip(baseConfig, false)).toBe('untrusted-workspace');
    expect(decideSkip({ ...baseConfig, allowUntrustedWorkspaces: true }, false)).toBeUndefined();
  });

  it('reports a reason for every skip', () => {
    expect(skipReasonMessage('disabled')).toContain('disabled');
    expect(skipReasonMessage('empty-script')).toContain('no operations');
    expect(skipReasonMessage('untrusted-workspace')).toContain('not trusted');
  });
});

describe('applyDefinitionOverrides', () => {
  it('lets a task definition override the settings', () => {
    const config = applyDefinitionOverrides(baseConfig, {
      type: 'worktree-shell-start',
      script: 'echo task',
      shell: 'zsh',
      args: ['one'],
    });
    expect(config).toMatchObject({ script: 'echo task', shell: 'zsh', args: ['one'] });
  });

  it('ignores unknown or wrongly typed definition values', () => {
    expect(applyDefinitionOverrides(baseConfig, undefined)).toEqual(baseConfig);
    expect(applyDefinitionOverrides(baseConfig, 'nope')).toEqual(baseConfig);
    expect(
      applyDefinitionOverrides(baseConfig, { script: 5, shell: '  ', args: ['ok', 7] }),
    ).toEqual({ ...baseConfig, args: ['ok'] });
  });
});
