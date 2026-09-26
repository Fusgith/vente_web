// Builds a distributable version under a chosen application name (RG-APP-01, ADR-0006, ⚠️ H25).
// From Source/: pnpm dist --nom "Épicerie Rasoa" --nom-court "Rasoa"
// Messages are in French: this command is run by the shop's integrator, not only by developers.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(source, '..', 'Dist');
const usage = 'Usage : pnpm dist --nom "Épicerie Rasoa" --nom-court "Rasoa"';

function stop(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function run(args, env = {}) {
  const result = spawnSync('pnpm', args, {
    cwd: source,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    // pnpm is a .cmd shim on Windows; no argument here contains a space or a user value.
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) stop([`Échec de : pnpm ${args.join(' ')}`]);
}

let options;
try {
  options = parseArgs({
    options: { nom: { type: 'string' }, 'nom-court': { type: 'string' } },
    strict: true,
  }).values;
} catch (error) {
  stop([error.message, usage]);
}

// The rules live in @vente-web/shared (tested there): build it first, then load its output.
run(['--filter', '@vente-web/shared', 'build']);
const { appNameSlug, checkAppNames } = await import(
  pathToFileURL(join(source, 'packages', 'shared', 'dist', 'brand.js')).href
);

const check = checkAppNames({
  ...(options.nom === undefined ? {} : { name: options.nom }),
  ...(options['nom-court'] === undefined ? {} : { shortName: options['nom-court'] }),
});
if (!check.ok) stop([...check.problems, usage]);
const { name, shortName } = check.names;

const target = join(distRoot, appNameSlug(name));
if (!target.startsWith(distRoot + sep)) stop([`Dossier de sortie inattendu : ${target}`]);

console.log(`Construction de « ${name} » (sous l'icône : « ${shortName} »)…`);
run(['--filter', '@vente-web/web...', 'build'], {
  VITE_APP_NAME: name,
  VITE_APP_SHORT_NAME: shortName,
});

// Dist/<slug>/ is generated output only (never versioned, never edited by hand).
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(source, 'apps', 'web', 'dist'), join(target, 'web'), { recursive: true });
// The server reads the same name as APP_NAME (TOTP issuer); Docker wiring comes with T-080.
writeFileSync(join(target, 'nom.json'), `${JSON.stringify({ name, shortName }, null, 2)}\n`);

console.log(`Prêt : ${relative(resolve(source, '..'), target)}${sep}`);
console.log(`  web${sep}      application à servir aux tablettes`);
console.log(`  nom.json  nom à donner au serveur (APP_NAME)`);
