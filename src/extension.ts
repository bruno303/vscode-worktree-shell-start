import * as vscode from 'vscode';
import { enableInWorkspace, runHookForCurrentFolder, showDiagnostics } from './commands';
import { decideSkip, readHookConfig, SECTION, TASK_TYPE } from './hookConfig';
import { hasHookTaskEntry } from './tasksFile';
import { describeScope, HookTaskProvider, RUNNER_RELATIVE_PATH } from './taskProvider';

const HINT_DISMISSED_KEY = 'worktreeShellStart.missingTaskHintDismissed';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Worktree Shell Start');
  const log = (message: string): void => {
    output.appendLine(`[${new Date().toISOString()}] ${message}`);
  };
  context.subscriptions.push(output);
  log(`Activated (runner: ${vscode.Uri.joinPath(context.extensionUri, RUNNER_RELATIVE_PATH).fsPath}).`);

  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(TASK_TYPE, new HookTaskProvider(context.extensionUri, log)),
    vscode.commands.registerCommand('worktreeShellStart.run', () =>
      runHookForCurrentFolder(context.extensionUri, log),
    ),
    vscode.commands.registerCommand('worktreeShellStart.enable', () => enableInWorkspace(log)),
    vscode.commands.registerCommand('worktreeShellStart.diagnostics', async () => {
      output.show(true);
      await showDiagnostics(context, log);
    }),
    vscode.tasks.onDidEndTaskProcess((event) => {
      const definition = event.execution.task.definition as { type?: unknown } | undefined;
      if (definition?.type !== TASK_TYPE) {
        return;
      }
      const target = describeScope(event.execution.task);
      if (event.exitCode === 0) {
        log(`Hook finished successfully for ${target}.`);
        return;
      }
      log(`Hook failed with exit code ${String(event.exitCode)} for ${target}.`);
      void vscode.window.showErrorMessage(
        `Worktree Shell Start: the hook failed with exit code ${String(event.exitCode)} for ${target}. ` +
          'See the task terminal for details.',
      );
    }),
  );

  void maybeHintMissingTask(context, log);
}

export function deactivate(): void {
  // Everything is registered on the extension context.
}

/**
 * Warns once when operations are configured but the tasks.json entry that makes
 * the Git extension run them is missing.
 */
async function maybeHintMissingTask(
  context: vscode.ExtensionContext,
  log: (message: string) => void,
): Promise<void> {
  try {
    if (!vscode.workspace.isTrusted || context.globalState.get<boolean>(HINT_DISMISSED_KEY) === true) {
      return;
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) {
      return;
    }

    const config = readHookConfig(vscode.workspace.getConfiguration(SECTION, folder.uri));
    if (decideSkip(config, true) !== undefined) {
      return;
    }
    if (!(await isGitRepository(folder.uri)) || (await hasHookTaskEntry(folder.uri))) {
      return;
    }

    const addTask = 'Add Task';
    const never = "Don't Show Again";
    const choice = await vscode.window.showInformationMessage(
      'Worktree Shell Start: operations are configured, but this workspace has no `worktree-shell-start` task, ' +
        'so the hook will not run when a worktree is created. Add it to .vscode/tasks.json?',
      addTask,
      never,
    );

    if (choice === addTask) {
      await vscode.commands.executeCommand('worktreeShellStart.enable');
    } else if (choice === never) {
      await context.globalState.update(HINT_DISMISSED_KEY, true);
    }
  } catch (error) {
    log(`Configuration hint failed: ${String(error)}`);
  }
}

async function isGitRepository(folder: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder, '.git'));
    return true;
  } catch {
    return false;
  }
}
