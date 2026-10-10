import * as vscode from 'vscode';
import { insertHookTask, hasHookTaskText, type InsertResult } from './tasksJson';

function tasksFileUri(folder: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(folder, '.vscode', 'tasks.json');
}

export async function readTasksFile(folder: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(tasksFileUri(folder));
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return undefined;
  }
}

export async function hasHookTaskEntry(folder: vscode.Uri): Promise<boolean> {
  const text = await readTasksFile(folder);
  return text === undefined ? false : hasHookTaskText(text);
}

export async function addHookTaskEntry(folder: vscode.Uri): Promise<InsertResult> {
  const text = (await readTasksFile(folder)) ?? '';
  const result = insertHookTask(text);

  if (result.error !== undefined || result.alreadyPresent) {
    return result;
  }

  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder, '.vscode'));
  await vscode.workspace.fs.writeFile(tasksFileUri(folder), Buffer.from(result.text, 'utf8'));
  return result;
}
