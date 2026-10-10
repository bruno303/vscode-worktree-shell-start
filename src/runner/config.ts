/**
 * Configuration handed from the extension to the runner.
 *
 * The extension passes this as a single `--config <json>` argument, so the
 * script text never goes through a shell and needs no quoting or escaping.
 */
export interface RunnerConfig {
  /** Raw shell operations, without a shebang. */
  script: string;
  /** Shell used to execute the operations. */
  shell: string;
  /** Extra arguments passed to the script ($1, $2, ...). */
  args: string[];
}

export const DEFAULT_SHELL = 'bash';
export const FALLBACK_SHELL = 'sh';

export function parseRunnerConfig(json: string | undefined): RunnerConfig {
  if (json === undefined || json.trim() === '') {
    throw new Error('missing --config argument');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`--config is not valid JSON: ${(error as Error).message}`, { cause: error });
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--config must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;

  if (typeof record.script !== 'string') {
    throw new Error('--config.script must be a string');
  }

  const shell =
    typeof record.shell === 'string' && record.shell.trim() !== '' ? record.shell.trim() : DEFAULT_SHELL;

  const args = Array.isArray(record.args)
    ? record.args.filter((value): value is string => typeof value === 'string')
    : [];

  return { script: record.script, shell, args };
}
