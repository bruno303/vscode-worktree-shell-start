/**
 * Minimal CommonJS stub of the `vscode` module.
 *
 * `test/bundle.test.ts` copies this file into a temporary sandbox as
 * `node_modules/vscode/index.js` so the *built* bundle can be loaded and
 * exercised outside an extension host. Loading the artifact is what catches
 * unresolved requires that the TypeScript sources hide.
 *
 * Shared state is exposed on `globalThis.__vscodeStub` for assertions.
 */
'use strict';

const state = {
  commands: new Map(),
  files: new Map(),
  messages: [],
  provider: undefined,
  providerType: undefined,
  trusted: true,
  folders: [],
  configuration: {},
  executed: [],
};

globalThis.__vscodeStub = state;

class Uri {
  constructor(fsPath) {
    this.fsPath = fsPath;
    this.scheme = 'file';
  }

  static file(fsPath) {
    return new Uri(fsPath);
  }

  static joinPath(base, ...parts) {
    return new Uri([String(base.fsPath).replace(/\/+$/, ''), ...parts].join('/'));
  }

  toString() {
    return `file://${this.fsPath}`;
  }
}

class ProcessExecution {
  constructor(process, args, options) {
    this.process = process;
    this.args = args;
    this.options = options;
  }
}

class Task {
  constructor(definition, scope, name, source, execution, problemMatchers) {
    this.definition = definition;
    this.scope = scope;
    this.name = name;
    this.source = source;
    this.execution = execution;
    this.problemMatchers = problemMatchers ?? [];
  }
}

const disposable = { dispose() {} };

state.classes = { Uri, Task, ProcessExecution };

module.exports = {
  Uri,
  Task,
  ProcessExecution,
  TaskScope: { Global: 1, Workspace: 2 },
  TaskRevealKind: { Always: 1, Silent: 2, Never: 3 },
  TaskPanelKind: { Shared: 1, Dedicated: 2, New: 3 },
  workspace: {
    get isTrusted() {
      return state.trusted;
    },
    get workspaceFolders() {
      return state.folders;
    },
    getConfiguration() {
      return {
        get(key) {
          return state.configuration[key];
        },
        inspect(key) {
          return { globalValue: state.configuration[`global.${key}`] };
        },
      };
    },
    fs: {
      async readFile(uri) {
        const content = state.files.get(uri.fsPath);
        if (content === undefined) {
          throw new Error(`ENOENT: no such file or directory, open '${uri.fsPath}'`);
        }
        return Buffer.from(content, 'utf8');
      },
      async writeFile(uri, content) {
        state.files.set(uri.fsPath, Buffer.from(content).toString('utf8'));
      },
      async createDirectory() {
        return undefined;
      },
      async stat() {
        throw new Error('ENOENT: not found');
      },
    },
  },
  window: {
    createOutputChannel() {
      return {
        appendLine(message) {
          state.messages.push(message);
        },
        show() {},
        dispose() {},
      };
    },
    async showInformationMessage(message) {
      state.messages.push(message);
      return undefined;
    },
    async showWarningMessage(message) {
      state.messages.push(message);
      return undefined;
    },
    async showErrorMessage(message) {
      state.messages.push(message);
      return undefined;
    },
    async showQuickPick() {
      return undefined;
    },
    async showTextDocument() {
      return undefined;
    },
  },
  commands: {
    registerCommand(id, handler) {
      state.commands.set(id, handler);
      return disposable;
    },
    async executeCommand(id, ...args) {
      state.executed.push({ id, args });
      const handler = state.commands.get(id);
      if (handler) {
        await handler(...args);
      }
      return undefined;
    },
  },
  tasks: {
    registerTaskProvider(type, provider) {
      state.providerType = type;
      state.provider = provider;
      return disposable;
    },
    onDidEndTaskProcess() {
      return disposable;
    },
    async executeTask(task) {
      state.executed.push({ id: 'workbench.action.tasks.runTask', args: [task] });
    },
    async fetchTasks() {
      return [];
    },
  },
  extensions: {
    getExtension() {
      return undefined;
    },
  },
};
