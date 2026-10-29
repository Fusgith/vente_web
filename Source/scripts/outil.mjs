// The distribution tool (T-102): builds a shop's package and makes its trial keys from a page in
// the browser, so that the vendor never types a command. Started by `Outil de distribution.cmd`.
// It listens on 127.0.0.1 only and every call carries this run's token (another site cannot
// drive it). What it keeps — the shops' parameters and logos — stays in Dist/.outil/ (never
// versioned: it holds secrets).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BACKUP_WARNING, hasVendorKey, licenceDir, licenseKey } from './licence.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const source = resolve(scripts, '..');
const distRoot = resolve(source, '..', 'Dist');
const toolDir = join(distRoot, '.outil');
const appLogoDir = join(toolDir, 'logo-application');
const clientsDir = join(toolDir, 'clients');
const token = randomBytes(16).toString('hex');
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const PNG = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/;
let building = false;

// The names follow the shared rules (RG-APP-01): build them once, as dist.mjs does.
const built = spawnSync('pnpm --filter @vente-web/shared build', { cwd: source, shell: true });
if (built.status !== 0) {
  console.error(built.stderr.toString() || 'Échec de la construction des règles partagées.');
  process.exit(1);
}
const { appNameSlug, checkAppNames } = await import(
  pathToFileURL(join(source, 'packages', 'shared', 'dist', 'brand.js')).href
);

function readEnv(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

const pngFile = (path) =>
  existsSync(path) ? `data:image/png;base64,${readFileSync(path).toString('base64')}` : null;

function savePng(dataUrl, path) {
  const match = PNG.exec(String(dataUrl));
  if (!match) return false;
  writeFileSync(path, Buffer.from(match[1], 'base64'));
  return true;
}

function clients() {
  if (!existsSync(clientsDir)) return [];
  return readdirSync(clientsDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(clientsDir, entry.name, 'client.json')),
    )
    .map((entry) => {
      const dir = join(clientsDir, entry.name);
      return {
        slug: entry.name,
        ...JSON.parse(readFileSync(join(dir, 'client.json'), 'utf8')),
        params: readEnv(join(dir, 'client.env')),
        logoClient: pngFile(join(dir, 'logo-client.png')),
        built: existsSync(join(distRoot, entry.name, 'app')),
      };
    });
}

function state() {
  return {
    clients: clients(),
    logoApp: pngFile(join(appLogoDir, 'icon-192.png')),
    vendorKey: hasVendorKey(),
    backupWarning: BACKUP_WARNING,
  };
}

/** Saves the shop (parameters, names, logo), then streams dist.mjs's output. */
function build(body, response) {
  const check = checkAppNames({
    name: String(body.nom ?? ''),
    shortName: String(body.nomCourt ?? ''),
  });
  const params = typeof body.params === 'object' && body.params !== null ? body.params : {};
  const problems = check.ok ? [] : [...check.problems];
  if (!IPV4.test(String(params.LAN_IP ?? '').trim()))
    problems.push('Adresse du serveur attendue, ex. 192.168.1.10.');
  if (building) problems.push('Une construction est déjà en cours.');
  if (problems.length > 0) return reply(response, 422, { problems });

  const { name, shortName } = check.names;
  const slug = appNameSlug(name);
  const dir = join(clientsDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'client.json'),
    `${JSON.stringify({ nom: name, nomCourt: shortName }, null, 2)}\n`,
  );
  const lines = Object.entries(params)
    .filter(([key]) => /^[A-Z0-9_]+$/.test(key))
    .map(
      ([key, value]) =>
        `${key}=${String(value ?? '')
          .replace(/[\r\n]/g, '')
          .trim()}`,
    );
  writeFileSync(join(dir, 'client.env'), `${lines.join('\n')}\n`);
  if (body.logoClient) savePng(body.logoClient, join(dir, 'logo-client.png'));

  const args = [join(scripts, 'dist.mjs'), '--nom', name, '--nom-court', shortName];
  args.push('--client', join(dir, 'client.env'));
  if (existsSync(join(appLogoDir, 'icon-512.png'))) args.push('--logo-app', appLogoDir);
  if (existsSync(join(dir, 'logo-client.png')))
    args.push('--logo-client', join(dir, 'logo-client.png'));

  building = true;
  response.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  const child = spawn(process.execPath, args, {
    cwd: source,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  child.stdout.on('data', (chunk) => response.write(chunk));
  child.stderr.on('data', (chunk) => response.write(chunk));
  child.on('close', (code) => {
    building = false;
    response.end(`\n##FIN ${code === 0 ? 'OK' : 'ECHEC'} ${slug}\n`);
  });
}

function reply(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 10_000_000) request.destroy(new Error('trop gros'));
      else chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        fail(error);
      }
    });
    request.on('error', fail);
  });
}

function openFolder(path) {
  if (existsSync(path)) spawn('explorer.exe', [path], { detached: true, stdio: 'ignore' }).unref();
}

const page = readFileSync(join(scripts, 'outil.html'), 'utf8').replace('__JETON__', token);

const server = createServer(async (request, response) => {
  const { port } = server.address();
  // Only this PC's browser, by this address: no other site, no DNS trick.
  if (request.headers.host !== `127.0.0.1:${port}`) return reply(response, 403, {});
  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    return response.end(page);
  }
  if (request.headers['x-outil'] !== token) return reply(response, 403, {});
  try {
    if (request.method === 'GET' && request.url === '/etat') return reply(response, 200, state());
    if (request.method !== 'POST') return reply(response, 404, {});
    const body = await readBody(request);
    switch (request.url) {
      case '/construire':
        return build(body, response);
      case '/logo-application': {
        mkdirSync(appLogoDir, { recursive: true });
        const saved = [192, 512].every((size) =>
          savePng(body[size], join(appLogoDir, `icon-${size}.png`)),
        );
        return reply(response, saved ? 200 : 422, state());
      }
      case '/licence': {
        const result = licenseKey({
          client: body.client,
          machine: body.machine,
          lastDay: body.fin ? body.fin : null,
        });
        return reply(response, result.problems ? 422 : 200, result);
      }
      case '/ouvrir': {
        const target =
          body.dossier === '.licence' ? licenceDir : resolve(distRoot, String(body.dossier ?? ''));
        if (target.startsWith(distRoot + sep)) openFolder(target);
        return reply(response, 200, {});
      }
      default:
        return reply(response, 404, {});
    }
  } catch (error) {
    return reply(response, 500, { problems: [String(error?.message ?? error)] });
  }
});

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`Outil de distribution ouvert dans le navigateur : ${url}`);
  console.log('Laissez cette fenêtre ouverte pendant le travail ; la fermer arrête l’outil.');
  // start's first quoted argument is a window title: an empty one, verbatim.
  spawn('cmd.exe', ['/c', 'start', '""', url], {
    detached: true,
    stdio: 'ignore',
    windowsVerbatimArguments: true,
  }).unref();
});
