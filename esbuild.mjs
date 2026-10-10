import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  alias: {
    // jsonc-parser's UMD build (the package `main`) hands `require` to its
    // factory as a parameter, which esbuild cannot follow: the emitted bundle
    // keeps `require('./impl/format')` calls and dies at load time with
    // "Cannot find module './impl/format'". The ESM build uses static imports
    // that esbuild bundles correctly, and its types live in the same folder.
    'jsonc-parser': 'jsonc-parser/lib/esm/main.js',
  },
};

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
  },
  {
    ...shared,
    entryPoints: ['src/runner/cli.ts'],
    outfile: 'dist/runner.js',
  },
];

if (watch) {
  const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('[esbuild] watching src/extension.ts and src/runner/cli.ts');
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
