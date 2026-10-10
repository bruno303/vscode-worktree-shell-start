import * as vscode from 'vscode';
import { applyDefinitionOverrides, decideSkip, readHookConfig, SECTION, type RawHookConfig } from './hookConfig';
import type { RunnerConfig } from './runner/config';

export const TASK_SOURCE = 'Worktree Shell Start';
export const RUNNER_RELATIVE_PATH = 'dist/runner.js';

/**
 * Provides the `worktree-shell-start` task type.
 *
 * The trigger lives in the user's `tasks.json`
 * (`"runOptions": { "runOn": "worktreeCreated" }`), which is the only stable way
 * to be notified about a VS Code initiated worktree creation: the programmatic
 * `Task.runOptions` API is still a proposed API.
 *
 * `provideTasks` deliberately returns nothing. `resolveTask` is what the task
 * service calls when it picks the tasks.json entry up, and returning a task with
 * the same definition keeps the task identity (`_id`) intact.
 */
export class HookTaskProvider implements vscode.TaskProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly log: (message: string) => void,
  ) {}

  provideTasks(): vscode.Task[] {
    return [];
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const settings = readHookConfig(vscode.workspace.getConfiguration(SECTION));
    const config = applyDefinitionOverrides(settings, task.definition);

    const skip = decideSkip(config, vscode.workspace.isTrusted);
    if (skip) {
      this.log(`Skipping worktree hook task (${skip}).`);
      return undefined;
    }

    const execution = createExecution(this.extensionUri, config, scopeFolderPath(task));
    return new vscode.Task(
      task.definition,
      task.scope ?? vscode.TaskScope.Workspace,
      task.name,
      task.source,
      execution,
    );
  }
}

export function createExecution(
  extensionUri: vscode.Uri,
  config: RawHookConfig,
  cwd: string | undefined,
): vscode.ProcessExecution {
  const runnerPath = vscode.Uri.joinPath(extensionUri, RUNNER_RELATIVE_PATH).fsPath;
  const payload: RunnerConfig = { script: config.script, shell: config.shell, args: config.args };

  const options: vscode.ProcessExecutionOptions = {
    // `process.execPath` is the bundled node of the extension host. On a local
    // (non-remote) install it is the Electron binary, which behaves as node
    // when ELECTRON_RUN_AS_NODE is set.
    env: { ...processEnv(), ELECTRON_RUN_AS_NODE: '1' },
  };
  if (cwd !== undefined) {
    options.cwd = cwd;
  }

  return new vscode.ProcessExecution(process.execPath, [runnerPath, '--config', JSON.stringify(payload)], options);
}

function scopeFolderPath(task: vscode.Task): string | undefined {
  const scope = task.scope;
  if (scope !== undefined && typeof scope === 'object' && 'uri' in scope) {
    return (scope as vscode.WorkspaceFolder).uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function processEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  return env;
}
