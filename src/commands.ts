import * as vscode from 'vscode';
import { readHookConfig, decideSkip, skipReasonMessage, SECTION, TASK_TYPE } from './hookConfig';
import { createExecution, TASK_SOURCE } from './taskProvider';
import { addHookTaskEntry, hasHookTaskEntry } from './tasksFile';

export async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length <= 1) {
    return folders[0];
  }

  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { placeHolder: 'Folder to run the worktree hook for' },
  );
  return picked?.folder;
}

/** Re-runs the configured operations against the current checkout. */
export async function runHookForCurrentFolder(
  extensionUri: vscode.Uri,
  log: (message: string) => void,
): Promise<void> {
  const folder = await pickWorkspaceFolder();
  if (folder === undefined) {
    void vscode.window.showWarningMessage('Worktree Shell Start: no workspace folder is open.');
    return;
  }

  const config = readHookConfig(vscode.workspace.getConfiguration(SECTION, folder.uri));
  const skip = decideSkip(config, vscode.workspace.isTrusted);
  if (skip !== undefined) {
    log(`Manual run skipped: ${skip}.`);
    void vscode.window.showWarningMessage(`Worktree Shell Start: ${skipReasonMessage(skip)}.`);
    return;
  }

  log(`Running hook manually for ${folder.uri.fsPath}.`);
  const task = new vscode.Task(
    { type: TASK_TYPE },
    folder,
    'Worktree Shell Start: Run Hook',
    TASK_SOURCE,
    createExecution(extensionUri, config, folder.uri.fsPath),
  );
  await vscode.tasks.executeTask(task);
}

/** Adds the `runOn: worktreeCreated` entry to the workspace tasks.json. */
export async function enableInWorkspace(log: (message: string) => void): Promise<void> {
  const folder = await pickWorkspaceFolder();
  if (folder === undefined) {
    void vscode.window.showWarningMessage('Worktree Shell Start: no workspace folder is open.');
    return;
  }

  const tasksUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'tasks.json');

  if (await hasHookTaskEntry(folder.uri)) {
    void vscode.window.showInformationMessage(
      'Worktree Shell Start: this workspace already has a worktree hook task.',
    );
    return;
  }

  const result = await addHookTaskEntry(folder.uri);
  if (result.error !== undefined) {
    log(`Could not update ${tasksUri.fsPath}: ${result.error}.`);
    void vscode.window.showErrorMessage(
      `Worktree Shell Start: could not update .vscode/tasks.json (${result.error}).`,
    );
    return;
  }

  log(`Added worktree hook task to ${tasksUri.fsPath}.`);
  const choice = await vscode.window.showInformationMessage(
    'Worktree Shell Start: the hook now runs when you create a worktree with "Git: Create Worktree…".',
    'Open tasks.json',
  );
  if (choice === 'Open tasks.json') {
    await vscode.window.showTextDocument(tasksUri);
  }
}
