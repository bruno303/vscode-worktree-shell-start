import { basename } from 'node:path';
import type { WorktreeEntry } from './git';

/** Every environment variable exported to the hook script. */
export const HOOK_ENV_KEYS = [
  'VSCODE_REPOSITORY_DIR',
  'VSCODE_WORKTREE_DIR',
  'VSCODE_WORKTREE_NAME',
  'VSCODE_WORKTREE_BRANCH',
  'VSCODE_WORKTREE_REF',
  'VSCODE_GIT_COMMON_DIR',
] as const;

export type HookEnv = Record<(typeof HOOK_ENV_KEYS)[number], string>;

export function buildHookEnv(options: {
  entry: WorktreeEntry;
  repositoryDir: string;
  commonDir: string;
}): HookEnv {
  const { entry, repositoryDir, commonDir } = options;

  const branch = entry.detached ? '' : (entry.branch ?? '').replace(/^refs\/heads\//, '');
  const head = entry.head ?? '';
  const unborn = head === '' || /^0+$/.test(head);

  return {
    VSCODE_REPOSITORY_DIR: repositoryDir,
    VSCODE_WORKTREE_DIR: entry.path,
    VSCODE_WORKTREE_NAME: basename(entry.path),
    VSCODE_WORKTREE_BRANCH: branch,
    VSCODE_WORKTREE_REF: unborn ? '' : head,
    VSCODE_GIT_COMMON_DIR: commonDir,
  };
}
