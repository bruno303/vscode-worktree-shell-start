import { parseRunnerConfig } from './config';
import { buildHookEnv } from './env';
import {
  findEntryForDir,
  parseWorktreePorcelain,
  resolveGitCommonDir,
  resolveRepositoryDir,
  resolveTopLevel,
  runGit,
  type WorktreeEntry,
} from './git';
import { executeScript } from './script';

export interface RunnerIo {
  log: (message: string) => void;
  error: (message: string) => void;
}

const USAGE = "Usage: node runner.js --config '<json>'";

function toEnvRecord(env: Record<string, string | undefined>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      record[key] = value;
    }
  }
  return record;
}

/**
 * Runs the hook for the worktree containing `cwd`.
 *
 * The worktree path is discovered from git rather than assumed to be `cwd`, so
 * the same entry point works for the task (whose cwd git rewrites to the new
 * worktree) and for a manual run in any checkout.
 */
export function runHook(argv: string[], env: Record<string, string | undefined>, cwd: string, io: RunnerIo): number {
  const configIndex = argv.indexOf('--config');
  const configArg = configIndex === -1 ? undefined : argv[configIndex + 1];

  let config;
  try {
    config = parseRunnerConfig(configArg);
  } catch (error) {
    io.error(`Error: ${(error as Error).message}`);
    io.error(USAGE);
    return 2;
  }

  const list = runGit(['worktree', 'list', '--porcelain'], cwd);
  if (list.code !== 0) {
    const detail = list.stderr.trim();
    io.error(`Error: 'git worktree list' failed in ${cwd}${detail === '' ? '' : `: ${detail}`}`);
    return 3;
  }

  const entries = parseWorktreePorcelain(list.stdout);
  const topLevel = resolveTopLevel(cwd) ?? cwd;
  const matched = findEntryForDir(entries, topLevel);
  if (!matched) {
    io.log(`Warning: ${topLevel} is not listed by 'git worktree list'; treating it as the worktree path.`);
  }
  const entry: WorktreeEntry = matched ?? { path: topLevel };

  const repositoryDir = resolveRepositoryDir(entries) ?? entry.path;
  const commonDir = resolveGitCommonDir(topLevel) ?? resolveGitCommonDir(cwd) ?? '';

  const hookEnv = buildHookEnv({ entry, repositoryDir, commonDir });
  io.log(`[worktree-shell-start] repository=${hookEnv.VSCODE_REPOSITORY_DIR}`);
  io.log(`[worktree-shell-start] worktree=${hookEnv.VSCODE_WORKTREE_DIR}`);
  io.log(
    `[worktree-shell-start] name=${hookEnv.VSCODE_WORKTREE_NAME} ` +
      `branch=${hookEnv.VSCODE_WORKTREE_BRANCH === '' ? '(detached)' : hookEnv.VSCODE_WORKTREE_BRANCH} ` +
      `ref=${hookEnv.VSCODE_WORKTREE_REF === '' ? '(unborn)' : hookEnv.VSCODE_WORKTREE_REF}`,
  );

  return executeScript({
    script: config.script,
    shell: config.shell,
    args: config.args,
    cwd: entry.path,
    env: { ...toEnvRecord(env), ...hookEnv },
    log: io.log,
  });
}
