// The shop's backups (T-081, CDC technique §2.3). Every 15 minutes the scheduled task
// "VenteWeb-Sauvegarde" (installer.ps1) dumps the base and keeps the newest dump of each of the
// last 48 hours, 30 days and 12 months; then copies them and the issued files to the external
// disk and, encrypted by rclone crypt, to the shop's OVH bucket, whose lifecycle rules expire
// them. A disk or Internet outage only delays the copies: what is missing goes at the next run
// (§2.4). Also used by restaurer.ps1; from the data folder's .env:
//   node --env-file=<données>\.env sauvegarde.mjs                        a backup now
//   node --env-file=<données>\.env sauvegarde.mjs ovh-dernier <dossier>  newest OVH dump, path printed
//   node --env-file=<données>\.env sauvegarde.mjs fichiers               issued files missing here
// Messages are in French: the shop's log and the restore script show them.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = process.env.VW_DATA ?? join(process.env.ProgramData ?? 'C:\\ProgramData', 'VenteWeb');
const saves = join(data, 'sauvegardes');
const files = join(data, 'fichiers');
const logFile = join(data, 'journaux', 'sauvegarde.log');
/** Read by the API's /healthz, watched from the OVH relay (BACKUP_STATUS_FILE, T-082). */
const statusFile = join(data, 'derniere-sauvegarde.txt');
// Copied there by the installer when the shop has a vault: an update without it keeps it.
const rclone = join(data, 'rclone.exe');
const env = process.env;

const DUMP = /^vente_web-(\d{8}-\d{4})\.dump$/;
/** The newest dump of each period is kept: 48 hours, 30 days, 12 months (CDC technique §2.3). */
const KEEP = [
  { dir: 'heures', period: (stamp) => stamp.slice(0, 11), count: 48 },
  { dir: 'jours', period: (stamp) => stamp.slice(0, 8), count: 30 },
  { dir: 'mois', period: (stamp) => stamp.slice(0, 6), count: 12 },
];
const VAULT_KEYS = [
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY',
  'BACKUP_S3_SECRET_KEY',
  'BACKUP_PASSPHRASE',
];

function log(line) {
  const text = `${new Date().toLocaleString('sv-SE')} ${line}`;
  console.log(text);
  mkdirSync(dirname(logFile), { recursive: true });
  if (existsSync(logFile) && statSync(logFile).size > 5_000_000) {
    renameSync(logFile, `${logFile}.ancien`);
  }
  appendFileSync(logFile, `${text}\n`);
}

function run(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.status !== 0) {
    const reason = result.stderr?.trim() || result.error?.message || `code ${result.status}`;
    throw new Error(`${basename(program)} ${args[0]} : ${reason}`);
  }
  return result.stdout;
}

const pad = (n) => String(n).padStart(2, '0');
const stampOf = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const dumpsIn = (folder) =>
  (existsSync(folder) ? readdirSync(folder) : []).filter((f) => DUMP.test(f));
const stampOfFile = (file) => DUMP.exec(file)[1];

/** pg_dump as the superuser, like the installer's dump before an update; PG* variables win (tests). */
function dump() {
  const name = `vente_web-${stampOf(new Date())}.dump`;
  const hours = join(saves, 'heures');
  mkdirSync(hours, { recursive: true });
  const partial = join(hours, `${name}.partial`);
  try {
    run(join(app, 'pgsql', 'bin', 'pg_dump.exe'), ['-Fc', '-f', partial, 'vente_web'], {
      env: { PGHOST: '127.0.0.1', PGUSER: 'postgres', PGPASSWORD: env.POSTGRES_PASSWORD, ...env },
    });
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
  renameSync(partial, join(hours, name));
  // The first dump of a day (of a month) is that day's (month's) one.
  for (const { dir, period } of KEEP.slice(1)) {
    const folder = join(saves, dir);
    const current = period(stampOfFile(name));
    if (!dumpsIn(folder).some((file) => period(stampOfFile(file)) === current)) {
      mkdirSync(folder, { recursive: true });
      copyFileSync(join(hours, name), join(folder, name));
    }
  }
  return name;
}

/** Leaves the newest dump of each kept period; the dumps before an update are never touched. */
function prune(root) {
  for (const { dir, period, count } of KEEP) {
    const kept = new Set();
    for (const file of dumpsIn(join(root, dir)).sort().reverse()) {
      const key = period(stampOfFile(file));
      if (!kept.has(key) && kept.size < count) kept.add(key);
      else rmSync(join(root, dir, file), { force: true });
    }
  }
}

const copyMissing = (from, to) =>
  cpSync(from, to, {
    recursive: true,
    force: false,
    preserveTimestamps: true,
    filter: (path) => !path.endsWith('.partial'),
  });

function toDisk() {
  const disk = env.BACKUP_DISK;
  if (!disk) return;
  if (!existsSync(parse(resolve(disk)).root)) {
    log(`Disque externe absent (${disk}) : la copie se fera quand il sera branché.`);
    return;
  }
  copyMissing(saves, join(disk, 'sauvegardes'));
  prune(join(disk, 'sauvegardes'));
  if (existsSync(files)) copyMissing(files, join(disk, 'fichiers'));
  log(`Disque externe à jour (${disk}).`);
}

/** rclone's configuration, in its environment only: the crypt remote "coffre" over the bucket. */
function vault() {
  if (!env.BACKUP_S3_BUCKET) return undefined;
  const missing = VAULT_KEYS.filter((key) => !env[key]);
  if (missing.length > 0)
    throw new Error(`Paramètres manquants dans le .env : ${missing.join(', ')}`);
  if (!existsSync(rclone)) throw new Error(`rclone.exe manque : ${rclone}`);
  return {
    ...env,
    RCLONE_CONFIG_OVH_TYPE: 's3',
    RCLONE_CONFIG_OVH_PROVIDER: 'Other',
    RCLONE_CONFIG_OVH_ENDPOINT: env.BACKUP_S3_ENDPOINT,
    RCLONE_CONFIG_OVH_REGION: env.BACKUP_S3_REGION,
    RCLONE_CONFIG_OVH_ACCESS_KEY_ID: env.BACKUP_S3_ACCESS_KEY,
    RCLONE_CONFIG_OVH_SECRET_ACCESS_KEY: env.BACKUP_S3_SECRET_KEY,
    RCLONE_CONFIG_OVH_NO_CHECK_BUCKET: 'true',
    RCLONE_CONFIG_COFFRE_TYPE: 'crypt',
    RCLONE_CONFIG_COFFRE_REMOTE: `ovh:${env.BACKUP_S3_BUCKET}`,
    RCLONE_CONFIG_COFFRE_PASSWORD: run(rclone, ['obscure', '-'], {
      input: env.BACKUP_PASSPHRASE,
    }).trim(),
    // Clear folder names: the bucket's lifecycle rules expire by prefix (sauvegardes/heures/…).
    RCLONE_CONFIG_COFFRE_DIRECTORY_NAME_ENCRYPTION: 'false',
  };
}

function toVault() {
  const config = vault();
  if (!config) return;
  // Copy, never sync: nothing is ever deleted from here; the files never change once written.
  const copy = ['copy', '--ignore-existing', '--retries', '1', '--exclude', '*.partial'];
  run(rclone, [...copy, saves, 'coffre:sauvegardes'], { env: config });
  if (existsSync(files)) run(rclone, [...copy, files, 'coffre:fichiers'], { env: config });
  log('Coffre OVH à jour.');
}

function backup() {
  log(`Sauvegarde : ${dump()}`);
  prune(saves);
  for (const [what, copy] of [
    ['la copie sur le disque externe', toDisk],
    ["l'envoi au coffre OVH", toVault],
  ]) {
    try {
      copy();
    } catch (error) {
      log(`Échec de ${what} : ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (process.exitCode !== 1) writeFileSync(statusFile, `${new Date().toISOString()}\n`);
}

/** The newest dump of the vault, into `folder`; its path is the last line printed. */
function newestFromVault(folder) {
  const config = vault();
  if (!config) throw new Error('Coffre OVH non configuré (BACKUP_S3_* dans le .env).');
  const listing = run(rclone, ['lsf', '-R', '--files-only', 'coffre:sauvegardes'], { env: config });
  const [newest] = listing
    .split(/\r?\n/)
    .filter((path) => DUMP.test(basename(path)))
    .sort((a, b) => basename(b).localeCompare(basename(a)));
  if (!newest)
    throw new Error('Aucune sauvegarde lisible dans le coffre : mot de passe de l’enveloppe ?');
  const target = join(resolve(folder), basename(newest));
  run(rclone, ['copyto', `coffre:sauvegardes/${newest}`, target], { env: config });
  console.log(target);
}

/** After a restore: the issued files missing here, from the external disk then the vault. */
function restoreFiles() {
  const disk = env.BACKUP_DISK && join(env.BACKUP_DISK, 'fichiers');
  if (disk && existsSync(disk)) copyMissing(disk, files);
  const config = vault();
  if (config) run(rclone, ['copy', '--ignore-existing', 'coffre:fichiers', files], { env: config });
  console.log('Fichiers émis : récupérés.');
}

const [command, folder] = process.argv.slice(2);
try {
  if (command === 'ovh-dernier') newestFromVault(folder ?? '.');
  else if (command === 'fichiers') restoreFiles();
  else backup();
} catch (error) {
  if (command) console.error(error.message);
  else log(`Échec de la sauvegarde : ${error.message}`);
  process.exitCode = 1;
}
