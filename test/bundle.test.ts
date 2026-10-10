import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Loads the *built* bundle (dist/extension.js) in a sandbox that provides a
 * stubbed `vscode` module, then exercises the extension through it.
 *
 * Unit tests import the TypeScript sources, where node_modules is available;
 * only this test can catch artifacts that fail outside the repository, such as
 * a dependency that esbuild could not follow (jsonc-parser's UMD build used to
 * emit `require('./impl/format')`, which broke activation).
 */
const BUNDLE = resolve(process.cwd(), 'dist/extension.js');
const STUB = resolve(process.cwd(), 'test/helpers/vscodeStub.cjs');
const REPO = '/ws/repo';

type AnyFunction = (...args: any[]) => any;

interface StubUri {
  fsPath: string;
}

interface StubState {
  commands: Map<string, AnyFunction>;
  files: Map<string, string>;
  messages: string[];
  executed: { id: string; args: unknown[] }[];
  provider?: { resolveTask(task: unknown): unknown; provideTasks(): unknown };
  providerType?: string;
  trusted: boolean;
  folders: unknown[];
  configuration: Record<string, unknown>;
  classes: {
    Uri: { file(path: string): StubUri };
    Task: new (
      definition: unknown,
      scope: unknown,
      name: string,
      source: string,
      execution: unknown,
    ) => unknown;
    ProcessExecution: new (command: string, args: string[], options: unknown) => unknown;
  };
}

interface BundleModule {
  activate(context: unknown): void;
  deactivate(): void;
}

let sandbox: string;
let bundle: BundleModule;
let stub: StubState;

function repoFolder(): { uri: StubUri; name: string; index: number } {
  return { uri: stub.classes.Uri.file(REPO), name: 'repo', index: 0 };
}

function extensionContext(): unknown {
  return {
    extensionUri: stub.classes.Uri.file('/extensions/worktree-shell-start'),
    subscriptions: [],
    extension: {
      id: 'bruno-oliveira-812.vscode-worktree-shell-start',
      packageJSON: { version: '0.0.1' },
    },
    globalState: { get: () => undefined, update: () => Promise.resolve() },
  };
}

beforeAll(() => {
  if (!existsSync(BUNDLE)) {
    throw new Error(`${BUNDLE} is missing - run "npm run build" before the tests`);
  }

  sandbox = mkdtempSync(join(tmpdir(), 'wss-bundle-'));
  const vscodeModule = join(sandbox, 'node_modules', 'vscode');
  mkdirSync(vscodeModule, { recursive: true });
  writeFileSync(
    join(vscodeModule, 'package.json'),
    JSON.stringify({ name: 'vscode', version: '0.0.0', main: 'index.js' }),
  );
  copyFileSync(STUB, join(vscodeModule, 'index.js'));

  mkdirSync(join(sandbox, 'dist'), { recursive: true });
  copyFileSync(BUNDLE, join(sandbox, 'dist', 'extension.js'));

  const requireFromSandbox = createRequire(join(sandbox, 'entry.js'));
  bundle = requireFromSandbox(join(sandbox, 'dist', 'extension.js')) as BundleModule;
  stub = (globalThis as unknown as { __vscodeStub: StubState }).__vscodeStub;
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  stub.trusted = true;
  stub.folders = [repoFolder()];
  stub.configuration = {};
  stub.files.clear();
  stub.messages.length = 0;
  stub.executed.length = 0;
});

describe('built extension bundle', () => {
  it('loads and activates, registering the provider and every command', () => {
    expect(typeof bundle.activate).toBe('function');

    expect(() => {
      bundle.activate(extensionContext());
    }).not.toThrow();

    expect(stub.providerType).toBe('worktree-shell-start');
    expect([...stub.commands.keys()].sort()).toEqual([
      'worktreeShellStart.diagnostics',
      'worktreeShellStart.enable',
      'worktreeShellStart.run',
    ]);
  });

  it('adds the trigger to an existing tasks.json, preserving comments', async () => {
    const tasksJson = `${REPO}/.vscode/tasks.json`;
    stub.files.set(
      tasksJson,
      '{\n  // keep me\n  "version": "2.0.0",\n  "tasks": [\n    { "type": "shell", "command": "echo hi" }\n  ]\n}\n',
    );

    await stub.commands.get('worktreeShellStart.enable')?.();

    const written = stub.files.get(tasksJson) ?? '';
    expect(written).toContain('// keep me');
    expect(written).toContain('"echo hi"');
    expect(written).toContain('worktree-shell-start');
    expect(written).toContain('worktreeCreated');
  });

  it('resolves the configured task into a runner execution', () => {
    stub.configuration = {
      enabled: true,
      script: 'echo "hook $VSCODE_WORKTREE_NAME"',
      shell: 'bash',
      args: ['one'],
    };

    const input = new stub.classes.Task(
      { type: 'worktree-shell-start' },
      repoFolder(),
      'Worktree hook',
      'Workspace',
      undefined,
    );
    const resolved = stub.provider?.resolveTask(input) as
      | { execution: { process: string; args: string[]; options: { cwd?: string; env: Record<string, string> } } }
      | undefined;

    expect(resolved).toBeDefined();
    expect(resolved?.execution.process).toBe(process.execPath);
    expect(resolved?.execution.args[0]).toMatch(/dist[\\/]runner\.js$/);
    expect(resolved?.execution.args[1]).toBe('--config');
    expect(JSON.parse(resolved?.execution.args[2] ?? '{}')).toEqual({
      script: 'echo "hook $VSCODE_WORKTREE_NAME"',
      shell: 'bash',
      args: ['one'],
    });
    expect(resolved?.execution.options.cwd).toBe(REPO);
    expect(resolved?.execution.options.env.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('contributes a notice task instead of the hook in an untrusted workspace', () => {
    stub.trusted = false;
    stub.configuration = { enabled: true, script: 'echo nope', shell: 'bash' };

    const input = new stub.classes.Task(
      { type: 'worktree-shell-start' },
      repoFolder(),
      'Worktree hook',
      'Workspace',
      undefined,
    );
    const resolved = stub.provider?.resolveTask(input) as
      | { execution: { args: string[] } }
      | undefined;

    // Returning undefined here is what made VS Code log
    // "didn't contribute a task ... will be ignored" in restricted windows.
    expect(resolved).toBeDefined();
    expect(resolved?.execution.args).toContain('--notice');
    expect(resolved?.execution.args.join(' ')).toContain('not trusted');
  });

  it('runs the hook for the current folder on demand', async () => {
    stub.configuration = { enabled: true, script: 'echo hi', shell: 'bash' };

    await stub.commands.get('worktreeShellStart.run')?.();

    const started = stub.executed.filter((entry) => entry.id === 'workbench.action.tasks.runTask');
    expect(started).toHaveLength(1);
  });

  it('refuses to run on demand when no operations are configured', async () => {
    stub.configuration = { enabled: true, script: '  ', shell: 'bash' };

    await stub.commands.get('worktreeShellStart.run')?.();

    expect(stub.executed.filter((entry) => entry.id === 'workbench.action.tasks.runTask')).toHaveLength(0);
    expect(stub.messages.some((message) => message.includes('no operations are configured'))).toBe(true);
  });
});
