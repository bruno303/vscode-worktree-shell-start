import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import { TASK_TYPE } from './hookConfig';

/** The tasks.json entry that makes the Git extension run our hook. */
export interface HookTaskEntry {
  type: string;
  label: string;
  runOptions: { runOn: string };
}

export function createTaskEntry(): HookTaskEntry {
  return { type: TASK_TYPE, label: 'Worktree hook', runOptions: { runOn: 'worktreeCreated' } };
}

export function isHookTask(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && (value as { type?: unknown }).type === TASK_TYPE
  );
}

export function parseTaskFile(text: string): { value: unknown; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true });
  return { value, errors };
}

export function hasHookTaskText(text: string): boolean {
  const { value, errors } = parseTaskFile(text);
  if (errors.length > 0) {
    return false;
  }
  const tasks = (value as { tasks?: unknown } | undefined)?.tasks;
  return Array.isArray(tasks) && tasks.some(isHookTask);
}

export interface InsertResult {
  text: string;
  alreadyPresent: boolean;
  error?: string;
}

/**
 * Adds the `worktreeCreated` task to a tasks.json document, preserving comments
 * and formatting. Pure so it can be tested without an extension host.
 */
export function insertHookTask(text: string): InsertResult {
  const source = text.trim() === '' ? '{\n  "version": "2.0.0",\n  "tasks": []\n}\n' : text;
  const { value, errors } = parseTaskFile(source);

  if (errors.length > 0) {
    return { text: source, alreadyPresent: false, error: 'the file is not valid JSON with comments' };
  }

  const tasks = (value as { tasks?: unknown } | undefined)?.tasks;
  const list = Array.isArray(tasks) ? tasks : [];

  if (list.some(isHookTask)) {
    return { text: source, alreadyPresent: true };
  }

  const edits = modify(source, ['tasks', list.length], createTaskEntry(), {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' },
  });

  return { text: applyEdits(source, edits), alreadyPresent: false };
}
