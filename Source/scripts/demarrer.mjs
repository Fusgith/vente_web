// Starts the whole development environment in one go: Docker, the dev database, its tables and
// demo data, then the API and the PWA, and opens the browser.
// From Source/: pnpm demarrer — or a double-click on « Lancer Vente Web.cmd » at the repository root.
// Messages are in French: the shop's owner runs it, not only developers.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(source, '.env');
const webUrl = 'http://localhost:5173';
const compose = 'docker compose -f infra/docker-compose.yml';
const dockerDesktop = join(
  process.env.ProgramFiles ?? 'C:\\Program Files',
  'Docker',
  'Docker',
  'Docker Desktop.exe',
);

function stop(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

/** True when the command succeeds; its output is not shown. */
function succeeds(command) {
  return spawnSync(command, { cwd: source, stdio: 'ignore', shell: true }).status === 0;
}

function run(step, command, hint) {
  // One command line through the shell: pnpm is a .cmd shim on Windows. No argument holds a
  // space or a user value, so nothing needs quoting.
  console.log(`\n▶ ${step}…`);
  const result = spawnSync(command, { cwd: source, stdio: 'inherit', shell: true });
  if (result.status !== 0) stop([`\n✖ Échec : ${step}.`, ...(hint ? [hint] : [])]);
}

async function waitFor(check, seconds) {
  for (let left = seconds; left > 0; left -= 2) {
    if (await check()) return true;
    await sleep(2000);
  }
  return check();
}

// 1. Docker: Docker Desktop is started when it is installed but not running.
if (!succeeds('docker info')) {
  if (!existsSync(dockerDesktop)) {
    stop([
      '✖ Docker est introuvable.',
      'Installez Docker Desktop (https://www.docker.com/products/docker-desktop/), puis relancez.',
    ]);
  }
  console.log('▶ Démarrage de Docker Desktop (jusqu’à 3 minutes)…');
  spawn(dockerDesktop, [], { detached: true, stdio: 'ignore' }).unref();
  if (!(await waitFor(() => succeeds('docker info'), 180))) {
    stop(['✖ Docker ne répond pas.', 'Ouvrez Docker Desktop, attendez qu’il soit prêt, relancez.']);
  }
}

// 2. Settings: the template is the first .env; the script never shows its values.
if (!existsSync(envFile)) {
  copyFileSync(join(source, '.env.example'), envFile);
  console.log('▶ Fichier de réglages .env créé à partir de .env.example.');
}
// Earlier templates shipped a bare `VAPID_SUBJECT=mailto:` without keys, which the API refuses
// (all three VAPID variables or none): blank it so push is simply off.
const settings = readFileSync(envFile, 'utf8');
const repaired = settings.replace(/^VAPID_SUBJECT=mailto:[ \t]*$/m, 'VAPID_SUBJECT=');
if (repaired !== settings) writeFileSync(envFile, repaired);
process.loadEnvFile(envFile);

// The launcher always targets the dev database it starts, so the URL is built from the same
// variables and defaults as infra/docker-compose.yml: a stale DATABASE_URL in .env (the old
// port 5432, taken by a native PostgreSQL on this machine) cannot send it elsewhere.
const db = {
  user: process.env.POSTGRES_USER || 'vente',
  password: process.env.POSTGRES_PASSWORD || 'vente',
  name: process.env.POSTGRES_DB || 'vente_web',
  port: process.env.POSTGRES_PORT || '5433',
};
process.env.DATABASE_URL = `postgresql://${encodeURIComponent(db.user)}:${encodeURIComponent(
  db.password,
)}@localhost:${db.port}/${encodeURIComponent(db.name)}`;

// 3. Dependencies, then the Prisma client (it follows the schema after a pull).
if (!existsSync(join(source, 'node_modules'))) run('Installation des dépendances', 'pnpm install');
run('Préparation de l’accès à la base', 'pnpm --filter @vente-web/api db:generate');

// 4. The database: started, ready, its tables up to date, the demo data in place. The seed
// keeps whatever is already stored (it only adds what is missing).
run('Démarrage de la base de données', 'pnpm db:up');
if (!(await waitFor(() => succeeds(`${compose} exec -T postgres pg_isready -q`), 60))) {
  stop(['✖ La base de données ne répond pas.', 'Voir son journal : pnpm db:logs']);
}
const dbHint = `Vérifiez POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB et POSTGRES_PORT dans ${envFile}.`;
run('Mise à jour des tables', 'pnpm --filter @vente-web/api db:deploy', dbHint);
run('Données de démonstration', 'pnpm --filter @vente-web/api db:seed', dbHint);

// 5. The API and the PWA; the browser opens once the PWA answers. Closing this window stops them.
console.log(`\n▶ Démarrage de l’application (${webUrl})… Fermez cette fenêtre pour tout arrêter.`);
const dev = spawn('pnpm dev', { cwd: source, stdio: 'inherit', shell: true });
dev.on('exit', (code) => process.exit(code ?? 0));

const answers = async () => {
  try {
    return (await fetch(webUrl)).ok;
  } catch {
    return false;
  }
};
const opener = { win32: 'start ""', darwin: 'open' }[process.platform] ?? 'xdg-open';
if (await waitFor(answers, 90)) {
  console.log(`\n✔ Vente Web est prêt : ${webUrl}`);
  spawn(`${opener} ${webUrl}`, { shell: true, stdio: 'ignore', detached: true }).unref();
} else {
  console.log(`\n⚠ L’application tarde à répondre : ouvrez ${webUrl} dans le navigateur.`);
}
