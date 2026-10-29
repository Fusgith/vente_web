// Builds the shop's all-in-one Windows folder under a chosen application name (RG-APP-01,
// ADR-0006, ADR-0007, T-080). From Source/:
//   pnpm dist --nom "Épicerie Rasoa" --nom-court "Rasoa" [--client <paramètres du magasin>]
//     [--logo-app <dossier avec icon-192.png et icon-512.png>] [--logo-client <fichier PNG>]
// Without --client the folder updates an installed server; with it, it also installs a new one.
// The distribution tool (`Outil de distribution.cmd`, scripts/outil.mjs, T-102) fills these in.
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

import { BACKUP_WARNING, vendorPublicKey } from './licence.mjs';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(source, '..', 'Dist');
const cache = join(distRoot, '.telechargements');
const windows = join(source, 'infra', 'windows');
const usage =
  'Usage : pnpm dist --nom "Épicerie Rasoa" --nom-court "Rasoa" [--client <fichier de paramètres>] [--logo-app <dossier>] [--logo-client <fichier PNG>]';

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
  // Hash from the release's PGP-signed SHA256SUMS (T-081).
  rclone: {
    file: 'rclone-v1.75.2-windows-amd64.zip',
    url: 'https://downloads.rclone.org/v1.75.2/rclone-v1.75.2-windows-amd64.zip',
    sha256: '8a9db2bad1dc79a65b3348fd857069598e2aab7cf4d118b77b1df23055aff818',
  },
};

/** Shop parameters the installer cannot do without (client.env.example): the OVH keys only
 * with a domain; without one the shop is served on its LAN only (ADR-0009). */
function missingParameters(values) {
  const required = values.APP_DOMAIN
    ? ['LAN_IP', 'OVH_APPLICATION_KEY', 'OVH_APPLICATION_SECRET', 'OVH_CONSUMER_KEY']
    : ['LAN_IP'];
  return required.filter((key) => !values[key]);
}

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
      'logo-app': { type: 'string' },
      'logo-client': { type: 'string' },
    },
    strict: true,
  }).values;
} catch (error) {
  stop([error.message, usage]);
}

// The application's logo (T-010c) as PWA icons, and the shop's logo for its documents (T-099).
const appIcons =
  options['logo-app'] === undefined ? undefined : resolve(process.cwd(), options['logo-app']);
for (const size of [192, 512]) {
  if (appIcons !== undefined && !existsSync(join(appIcons, `icon-${size}.png`)))
    stop([`icon-${size}.png manque dans ${appIcons}`, usage]);
}
const clientLogo =
  options['logo-client'] === undefined ? undefined : resolve(process.cwd(), options['logo-client']);
if (clientLogo !== undefined && !existsSync(clientLogo))
  stop([`Logo du client introuvable : ${clientLogo}`, usage]);

const client = options.client === undefined ? undefined : resolve(process.cwd(), options.client);
if (client !== undefined) {
  if (!existsSync(client)) stop([`Fichier de paramètres introuvable : ${client}`, usage]);
  const missing = missingParameters(readEnvFile(client));
  if (missing.length > 0) stop([`Paramètres manquants dans ${client} : ${missing.join(', ')}`]);
}
// rclone only serves the off-site vault (T-081): bundled for a shop that has one; an update
// keeps the copy the installer left in the data folder.
const withRclone = client !== undefined && Boolean(readEnvFile(client).BACKUP_S3_BUCKET);

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
for (const [key, download] of Object.entries(DOWNLOADS)) {
  if (key !== 'rclone' || withRclone) files[key] = await fetchPinned(download);
}

console.log(`Construction de « ${name} » (sous l'icône : « ${shortName} »)…`);
run(['--filter', '@vente-web/web...', 'build'], {
  VITE_APP_NAME: name,
  VITE_APP_SHORT_NAME: shortName,
  ...(appIcons === undefined ? {} : { VITE_APP_ICONS: appIcons }),
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

// Every package is a trial bound to one server (ADR-0010): the vendor's public key goes into
// the built API only, so a copy of the source or of another package does not unlock it.
const { publicKey, created } = vendorPublicKey();
const licenseModule = join(app, 'api', 'dist', 'license-key.js');
const unlocked = readFileSync(licenseModule, 'utf8');
const locked = unlocked.replace(
  'LICENSE_PUBLIC_KEY = null;',
  `LICENSE_PUBLIC_KEY = ${JSON.stringify(publicKey)};`,
);
if (locked === unlocked) stop([`Clé publique non écrite : ${licenseModule} a changé de forme.`]);
writeFileSync(licenseModule, locked);
if (created) console.log(`Clé du vendeur créée. ${BACKUP_WARNING}`);
if (clientLogo !== undefined) copyFileSync(clientLogo, join(app, 'logo-client.png'));

const unpacked = join(cache, 'extrait');
rmSync(unpacked, { recursive: true, force: true });
unzip(files.node, unpacked, ['node-v24.15.0-win-x64/node.exe']);
mkdirSync(join(app, 'node'));
renameSync(join(unpacked, 'node-v24.15.0-win-x64', 'node.exe'), join(app, 'node', 'node.exe'));
if (withRclone) {
  unzip(files.rclone, unpacked, ['rclone-v1.75.2-windows-amd64/rclone.exe']);
  renameSync(join(unpacked, 'rclone-v1.75.2-windows-amd64', 'rclone.exe'), join(app, 'rclone.exe'));
}
// The server only needs PostgreSQL's programs and libraries, not pgAdmin, StackBuilder or docs.
unzip(files.postgresql, app, ['pgsql/bin', 'pgsql/lib', 'pgsql/share']);
rmSync(unpacked, { recursive: true, force: true });

cpSync(join(windows, 'caddy'), join(app, 'caddy'), { recursive: true });
copyFileSync(files.caddy, join(app, 'caddy', 'caddy.exe'));
copyFileSync(files.winsw, join(app, 'winsw.exe'));
copyFileSync(files.wireguard, join(app, 'wireguard.msi'));

mkdirSync(join(app, 'scripts'));
for (const script of ['secrets.mjs', 'dns-local.mjs', 'sauvegarde.mjs']) {
  copyFileSync(join(windows, script), join(app, 'scripts', script));
}
// Windows PowerShell 5.1 reads a script without BOM as ANSI: the French messages need one.
for (const script of ['installer.ps1', 'sauvegarder.ps1', 'restaurer.ps1']) {
  const text = readFileSync(join(windows, script), 'utf8').replace(/\r?\n/g, '\r\n');
  writeFileSync(join(app, 'scripts', script), `\uFEFF${text}`);
}
for (const file of [
  'Installer ou mettre a jour.cmd',
  'Sauvegarder.cmd',
  'Restaurer.cmd',
  'LISEZ-MOI.txt',
]) {
  copyFileSync(join(windows, file), join(target, file));
}

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
