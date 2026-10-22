// Builds the shop's all-in-one Windows folder under a chosen application name (RG-APP-01,
// ADR-0006, ADR-0007, T-080). From Source/:
//   pnpm dist --nom "Épicerie Rasoa" --nom-court "Rasoa" [--client <paramètres du magasin>]
// Without --client the folder updates an installed server; with it, it also installs a new one.
// Messages are in French: this command is run by the shop's integrator, not only by developers.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(source, '..', 'Dist');
const cache = join(distRoot, '.telechargements');
const windows = join(source, 'infra', 'windows');
const usage =
  'Usage : pnpm dist --nom "Épicerie Rasoa" --nom-court "Rasoa" [--client <fichier de paramètres>]';

// Third-party programs of the bundle, pinned by SHA-256 (journal, T-080). Caddy needs the OVH
// DNS module, which no official release carries: it is built once with xcaddy (Go from go.dev)
// and its hash pinned here; caddyserver.com's build service did not answer (23/10/2026).
const DOWNLOADS = {
  node: {
    file: 'node-v24.15.0-win-x64.zip',
    url: 'https://nodejs.org/dist/v24.15.0/node-v24.15.0-win-x64.zip',
    sha256: 'cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62',
  },
  postgresql: {
    file: 'postgresql-16.15-1-windows-x64-binaries.zip',
    url: 'https://get.enterprisedb.com/postgresql/postgresql-16.15-1-windows-x64-binaries.zip',
    sha256: '25e6fcdfb8caec38691bf461125e7564508760666f7b8e5dc6a5f0818f58f81e',
  },
  caddy: {
    file: 'caddy-2.11.7-ovh-1.1.0.exe',
    build:
      'GOOS=windows GOARCH=amd64 go run github.com/caddyserver/xcaddy/cmd/xcaddy@v0.4.7 build v2.11.7 --with github.com/caddy-dns/ovh@v1.1.0 --output caddy-2.11.7-ovh-1.1.0.exe',
    sha256: '1124cca5ad67d6832e9e74ca935b72c08ddf042cfbf06db6d4a1d86f81d61fdf',
  },
  winsw: {
    file: 'WinSW-x64-2.12.0.exe',
    url: 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe',
    sha256: '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da',
  },
  wireguard: {
    file: 'wireguard-amd64-1.1.1.msi',
    url: 'https://download.wireguard.com/windows-client/wireguard-amd64-1.1.1.msi',
    sha256: '7bfed60ad61b785c914b38b61555a975488e1d3ec472dbfb2fcdf498fca75242',
  },
};

/** Shop parameters the installer cannot do without (client.env.example). */
const REQUIRED = [
  'APP_DOMAIN',
  'LAN_IP',
  'OVH_APPLICATION_KEY',
  'OVH_APPLICATION_SECRET',
  'OVH_CONSUMER_KEY',
];

function stop(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function run(args, env = {}) {
  // One command line through the shell: pnpm is a .cmd shim on Windows. No argument holds a
  // user value (the names travel in the environment); paths are quoted.
  const result = spawnSync(`pnpm ${args.join(' ')}`, {
    cwd: source,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: true,
  });
  if (result.status !== 0) stop([`Échec de : pnpm ${args.join(' ')}`]);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** The cached download, fetched once, always checked against its pinned hash. */
async function fetchPinned({ file, url, build, sha256: expected }) {
  const path = join(cache, file);
  if (!existsSync(path) && build !== undefined) {
    stop([
      `${file} manque dans ${cache}.`,
      `Le construire avec Go (go.dev), Go 1.27.3 : ${build}`,
      'Une autre version de Go donne une autre empreinte : la vérifier avant de la changer ici.',
    ]);
  }
  if (!existsSync(path)) {
    console.log(`Téléchargement de ${file}…`);
    mkdirSync(cache, { recursive: true });
    const response = await fetch(url);
    if (!response.ok || !response.body)
      stop([`Téléchargement impossible : ${url} (${response.status})`]);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(`${path}.part`));
    renameSync(`${path}.part`, path);
  }
  const actual = sha256(path);
  if (actual !== expected) {
    stop([
      `Empreinte inattendue pour ${file} : ${actual}`,
      'Supprimez-le de ce dossier puis relancez ; ne changez l’empreinte qu’après vérification.',
    ]);
  }
  return path;
}

/** Windows' own tar (bsdtar) reads zip archives; Git's GNU tar does not. */
function unzip(archive, into, members) {
  mkdirSync(into, { recursive: true });
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  const result = spawnSync(tar, ['-xf', archive, '-C', into, ...members], { stdio: 'inherit' });
  if (result.status !== 0) stop([`Extraction impossible : ${archive}`]);
}

function readEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

if (process.platform !== 'win32')
  stop(['Le dossier du magasin se construit sous Windows (ADR-0007).']);

let options;
try {
  options = parseArgs({
    options: {
      nom: { type: 'string' },
      'nom-court': { type: 'string' },
      client: { type: 'string' },
    },
    strict: true,
  }).values;
} catch (error) {
  stop([error.message, usage]);
}

const client = options.client === undefined ? undefined : resolve(process.cwd(), options.client);
if (client !== undefined) {
  if (!existsSync(client)) stop([`Fichier de paramètres introuvable : ${client}`, usage]);
  const values = readEnvFile(client);
  const missing = REQUIRED.filter((key) => !values[key]);
  if (missing.length > 0) stop([`Paramètres manquants dans ${client} : ${missing.join(', ')}`]);
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
const app = join(target, 'app');

const files = {};
for (const [key, download] of Object.entries(DOWNLOADS)) files[key] = await fetchPinned(download);

console.log(`Construction de « ${name} » (sous l'icône : « ${shortName} »)…`);
run(['--filter', '@vente-web/web...', 'build'], {
  VITE_APP_NAME: name,
  VITE_APP_SHORT_NAME: shortName,
});
run(['--filter', '@vente-web/api...', 'build']);

// Dist/<slug>/ is generated output only (never versioned, never edited by hand).
rmSync(target, { recursive: true, force: true });
mkdirSync(app, { recursive: true });

// A flat node_modules (no links): the folder survives a zip or a USB stick.
run([
  '--filter',
  '@vente-web/api',
  'deploy',
  '--prod',
  '--config.node-linker=hoisted',
  `"${join(app, 'api')}"`,
]);
cpSync(join(source, 'apps', 'web', 'dist'), join(app, 'web'), { recursive: true });

const unpacked = join(cache, 'extrait');
rmSync(unpacked, { recursive: true, force: true });
unzip(files.node, unpacked, ['node-v24.15.0-win-x64/node.exe']);
mkdirSync(join(app, 'node'));
renameSync(join(unpacked, 'node-v24.15.0-win-x64', 'node.exe'), join(app, 'node', 'node.exe'));
// The server only needs PostgreSQL's programs and libraries, not pgAdmin, StackBuilder or docs.
unzip(files.postgresql, app, ['pgsql/bin', 'pgsql/lib', 'pgsql/share']);
rmSync(unpacked, { recursive: true, force: true });

cpSync(join(windows, 'caddy'), join(app, 'caddy'), { recursive: true });
copyFileSync(files.caddy, join(app, 'caddy', 'caddy.exe'));
copyFileSync(files.winsw, join(app, 'winsw.exe'));
copyFileSync(files.wireguard, join(app, 'wireguard.msi'));

mkdirSync(join(app, 'scripts'));
for (const script of ['secrets.mjs', 'dns-local.mjs']) {
  copyFileSync(join(windows, script), join(app, 'scripts', script));
}
// Windows PowerShell 5.1 reads a script without BOM as ANSI: the French messages need one.
const installer = readFileSync(join(windows, 'installer.ps1'), 'utf8').replace(/\r?\n/g, '\r\n');
writeFileSync(join(app, 'scripts', 'installer.ps1'), `\uFEFF${installer}`);
copyFileSync(
  join(windows, 'Installer ou mettre a jour.cmd'),
  join(target, 'Installer ou mettre a jour.cmd'),
);
copyFileSync(join(windows, 'LISEZ-MOI.txt'), join(target, 'LISEZ-MOI.txt'));

// The server reads the same name as APP_NAME (TOTP issuer).
writeFileSync(join(app, 'nom.json'), `${JSON.stringify({ name, shortName }, null, 2)}\n`);
const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: source,
  encoding: 'utf8',
});
const version = `${JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version}+${commit.stdout.trim()}`;
writeFileSync(join(app, 'version.txt'), `${version}\n`);
if (client !== undefined) copyFileSync(client, join(app, 'installation.env'));

console.log(`Prêt : ${relative(resolve(source, '..'), target)}${sep} (version ${version})`);
console.log(
  client === undefined
    ? '  Mise à jour d’un serveur installé : copier le dossier, double-clic sur « Installer ou mettre a jour.cmd ».'
    : '  Contient les secrets du magasin : à transporter tel quel, jamais à partager.',
);
