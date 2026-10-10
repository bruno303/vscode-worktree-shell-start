import { DEFAULT_SHELL } from './runner/config';

export const SECTION = 'worktreeShellStart';
export const TASK_TYPE = 'worktree-shell-start';

export interface RawHookConfig {
  enabled: boolean;
  script: string;
  shell: string;
  args: string[];
  /** True only when the user settings enable untrusted execution. */
  allowUntrustedWorkspaces: boolean;
}

export type SkipReason = 'disabled' | 'empty-script' | 'untrusted-workspace';

/**
 * The subset of `vscode.WorkspaceConfiguration` this module needs, so the
 * decision logic stays testable without an extension host.
 */
export interface ConfigReader {
  get<T>(section: string): T | undefined;
  inspect<T>(section: string): { globalValue?: T } | undefined;
}

export function readHookConfig(config: ConfigReader): RawHookConfig {
  const inspected = config.inspect<boolean>('runInUntrustedWorkspaces');
  const shell = (config.get<string>('shell') ?? '').trim();
  return {
    enabled: config.get<boolean>('enabled') ?? true,
    script: config.get<string>('script') ?? '',
    shell: shell === '' ? DEFAULT_SHELL : shell,
    args: config.get<string[]>('args') ?? [],
    // Deliberately reads the *user* value only: a workspace setting must not be
    // able to authorize running its own hook in an untrusted workspace.
    allowUntrustedWorkspaces: inspected?.globalValue === true,
  };
}

/** Per-task definition values from tasks.json override the settings. */
export function applyDefinitionOverrides(config: RawHookConfig, definition: unknown): RawHookConfig {
  if (typeof definition !== 'object' || definition === null) {
    return config;
  }

  const record = definition as Record<string, unknown>;
  const script = typeof record.script === 'string' ? record.script : config.script;
  const shell =
    typeof record.shell === 'string' && record.shell.trim() !== '' ? record.shell.trim() : config.shell;
  const args = Array.isArray(record.args)
    ? record.args.filter((value): value is string => typeof value === 'string')
    : config.args;

  return { ...config, script, shell, args };
}

export function decideSkip(config: RawHookConfig, isTrusted: boolean): SkipReason | undefined {
  if (!config.enabled) {
    return 'disabled';
  }
  if (config.script.trim() === '') {
    return 'empty-script';
  }
  if (!isTrusted && !config.allowUntrustedWorkspaces) {
    return 'untrusted-workspace';
  }
  return undefined;
}

export function skipReasonMessage(reason: SkipReason): string {
  switch (reason) {
    case 'disabled':
      return 'the hook is disabled (`worktreeShellStart.enabled` is false)';
    case 'empty-script':
      return 'no operations are configured (`worktreeShellStart.script` is empty)';
    case 'untrusted-workspace':
      return 'the workspace is not trusted, so the hook is skipped';
  }
}
