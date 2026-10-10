import { runHook } from './main';

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const error = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

process.exitCode = runHook(process.argv.slice(2), process.env, process.cwd(), { log, error });
