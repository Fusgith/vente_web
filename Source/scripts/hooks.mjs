// Points git at the repository's own hooks (T-010b), on each `pnpm install` (`prepare`). The git
// root is the folder above Source/; outside a git checkout (a Dist/ folder), nothing to do.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const inside = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
if (inside.status === 0 && resolve(inside.stdout.trim()) === root) {
  spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' });
}
