import * as vscode from 'vscode';
import {
  applyDefinitionOverrides,
  decideSkip,
  readHookConfig,
  skipReasonMessage,
  SECTION,
  type RawHookConfig,
} from './hookConfig';
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
    try {
      const settings = readHookConfig(vscode.workspace.getConfiguration(SECTION));
      const config = applyDefinitionOverrides(settings, task.definition);
      const isTrusted = vscode.workspace.isTrusted;
      const skip = decideSkip(config, isTrusted);

      this.log(
        `resolveTask: trusted=${isTrusted} enabled=${config.enabled} ` +
          `script=${scriptLineCount(config.script)} line(s) shell=${config.shell} ` +
          `decision=${skip ?? 'run'} scope=${describeScope(task)}`,
      );

      if (skip === 'untrusted-workspace') {
        // VS Code asks for configured tasks even in restricted windows - through
        // getKnownTasks(), which is not trust gated - and logs
        // "didn't contribute a task ... will be ignored" when a provider returns
        // nothing. An explanatory notice task keeps that quiet. It is safe:
        // the Git extension is disabled in untrusted workspaces, so it is never
        // started automatically, and it only prints why nothing happened.
        return new vscode.Task(
          task.definition,
          task.scope ?? vscode.TaskScope.Workspace,
          task.name,
          task.source,
          createNoticeExecution(this.extensionUri, skipReasonMessage(skip)),
        );
      }

      if (skip !== undefined) {
        this.log(`Not contributing a hook task (${skip}).`);
        return undefined;
      }

      return new vscode.Task(
        task.definition,
        task.scope ?? vscode.TaskScope.Workspace,
        task.name,
        task.source,
        createExecution(this.extensionUri, config, scopeFolderPath(task)),
      );
    } catch (error) {
      // Never let VS Code swallow the reason silently again.
      this.log(`resolveTask failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      return undefined;
    }
  }
}

export function createExecution(
  extensionUri: vscode.Uri,
  config: RawHookConfig,
  cwd: string | undefined,
): vscode.ProcessExecution {
  const payload: RunnerConfig = { script: config.script, shell: config.shell, args: config.args };
  return new vscode.ProcessExecution(
    process.execPath,
    [runnerPath(extensionUri), '--config', JSON.stringify(payload)],
    executionOptions(cwd),
  );
}

function createNoticeExecution(extensionUri: vscode.Uri, reason: string): vscode.ProcessExecution {
  return new vscode.ProcessExecution(
    process.execPath,
    [runnerPath(extensionUri), '--notice', reason],
    executionOptions(undefined),
  );
}

function runnerPath(extensionUri: vscode.Uri): string {
  return vscode.Uri.joinPath(extensionUri, RUNNER_RELATIVE_PATH).fsPath;
}

function executionOptions(cwd: string | undefined): vscode.ProcessExecutionOptions {
  const options: vscode.ProcessExecutionOptions = {
    // `process.execPath` is the node binary of the extension host. On a local
    // (non-remote) install it is the Electron binary, which behaves as node when
    // ELECTRON_RUN_AS_NODE is set.
    env: { ...processEnv(), ELECTRON_RUN_AS_NODE: '1' },
  };
  if (cwd !== undefined) {
    options.cwd = cwd;
  }
  return options;
}

function scopeFolderPath(task: vscode.Task): string | undefined {
  const scope = task.scope;
  if (scope !== undefined && typeof scope === 'object' && 'uri' in scope) {
    return (scope as vscode.WorkspaceFolder).uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** Human readable location of a task, used in logs and notifications. */
export function describeScope(task: vscode.Task): string {
  const scope = task.scope;
  if (scope !== undefined && typeof scope === 'object' && 'uri' in scope) {
    return (scope as vscode.WorkspaceFolder).uri.fsPath;
  }
  return scope === vscode.TaskScope.Global ? 'global scope' : 'workspace scope';
}

function scriptLineCount(script: string): number {
  const trimmed = script.trim();
  return trimmed === '' ? 0 : trimmed.split('\n').length;
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
