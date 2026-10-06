// The local pre-commit check (T-010b): the staged files under Source/ go through Prettier and
// ESLint, as the CI would, before the commit is made. Run by `.githooks/pre-commit` at the git
// root, which is the folder above Source/ — hence a hook path rather than Husky.
// Typecheck and tests stay with the CI: too slow for each commit.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prettier = join(source, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
const eslint = join(source, 'node_modules', 'eslint', 'bin', 'eslint.js');

const staged = execFileSync(
  'git',
  ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
  {
    cwd: source,
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter((file) => file.startsWith('Source/'))
  .map((file) => file.slice('Source/'.length));
if (staged.length === 0) process.exit(0);
if (!existsSync(prettier) || !existsSync(eslint)) {
  console.log('pre-commit : dépendances absentes (pnpm install), vérification sautée.');
  process.exit(0);
}

const run = (tool, args) =>
  spawnSync(process.execPath, [tool, ...args], { cwd: source, stdio: 'inherit' }).status === 0;
const code = staged.filter((file) => /\.[cm]?[jt]sx?$/.test(file));
const formatted = run(prettier, ['--check', '--ignore-unknown', ...staged]);
const linted = code.length === 0 || run(eslint, ['--no-warn-ignored', ...code]);
if (!formatted || !linted) {
  console.error(
    'pre-commit : commit refusé. Depuis Source/ : pnpm format puis pnpm lint:fix, et recommencer.',
  );
  process.exit(1);
}
