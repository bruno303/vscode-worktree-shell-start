import { describe, expect, it } from 'vitest';
import { hasHookTaskText, insertHookTask, parseTaskFile } from '../src/tasksJson';

interface ParsedTasks {
  version?: string;
  tasks?: unknown[];
}

function parse(text: string): ParsedTasks {
  return parseTaskFile(text).value as ParsedTasks;
}

describe('insertHookTask', () => {
  it('creates a document when the file is empty', () => {
    const result = insertHookTask('');

    expect(result.error).toBeUndefined();
    expect(result.alreadyPresent).toBe(false);
    expect(parse(result.text)).toEqual({
      version: '2.0.0',
      tasks: [
        {
          type: 'worktree-shell-start',
          label: 'Worktree hook',
          runOptions: { runOn: 'worktreeCreated' },
        },
      ],
    });
  });

  it('appends to an existing task list and preserves comments', () => {
    const text = [
      '{',
      '  // keep this comment',
      '  "version": "2.0.0",',
      '  "tasks": [',
      '    { "type": "shell", "command": "echo hi" }',
      '  ]',
      '}',
      '',
    ].join('\n');

    const result = insertHookTask(text);

    expect(result.error).toBeUndefined();
    expect(result.text).toContain('// keep this comment');
    expect(result.text).toContain('"command": "echo hi"');
    const tasks = parse(result.text).tasks ?? [];
    expect(tasks).toHaveLength(2);
    expect(tasks[1]).toMatchObject({
      type: 'worktree-shell-start',
      runOptions: { runOn: 'worktreeCreated' },
    });
  });

  it('adds a tasks array when the document has none', () => {
    const result = insertHookTask('{\n  "version": "2.0.0"\n}\n');

    expect(result.error).toBeUndefined();
    expect(parse(result.text).tasks).toHaveLength(1);
  });

  it('is idempotent', () => {
    const first = insertHookTask('');
    const second = insertHookTask(first.text);

    expect(second.alreadyPresent).toBe(true);
    expect(second.text).toBe(first.text);
  });

  it('leaves a broken file untouched and reports the problem', () => {
    const broken = '{ "tasks": [';
    const result = insertHookTask(broken);

    expect(result.error).toBeDefined();
    expect(result.text).toBe(broken);
  });
});

describe('hasHookTaskText', () => {
  it('detects the hook task and ignores other tasks', () => {
    expect(hasHookTaskText('{"tasks":[{"type":"shell"}]}')).toBe(false);
    expect(hasHookTaskText('{"tasks":[{"type":"worktree-shell-start"}]}')).toBe(true);
    expect(hasHookTaskText('{"tasks":"not-an-array"}')).toBe(false);
    expect(hasHookTaskText('{"tasks":[]}')).toBe(false);
  });

  it('returns false for invalid JSON', () => {
    expect(hasHookTaskText('{ "tasks": [')).toBe(false);
  });
});
