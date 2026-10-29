// The vendor's trial-license keys (ADR-0010, T-101, T-102). The Ed25519 pair lives in
// Dist/.licence/ on the vendor's PC: never versioned, never shipped; a package only carries the
// public half, which dist.mjs writes into the built API.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const licenceDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'Dist',
  '.licence',
);
const privatePath = join(licenceDir, 'cle-vendeur-privee.pem');
const issuedPath = join(licenceDir, 'cles-emises.txt');

/** Same rule as the server (packages/shared/src/license.ts). */
const MACHINE_CODE = /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const BACKUP_WARNING =
  'Sauvegardez le dossier Dist\\.licence (clé du vendeur) hors de ce PC : sans elle, plus aucune clé pour les magasins déjà livrés.';

/** The vendor's private key, created on first use. `created` tells the caller to warn. */
function vendorKey() {
  if (existsSync(privatePath))
    return { key: createPrivateKey(readFileSync(privatePath)), created: false };
  mkdirSync(licenceDir, { recursive: true });
  const { privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx' });
  return { key: privateKey, created: true };
}

export const hasVendorKey = () => existsSync(privatePath);

/** Base64 SPKI DER, the form the server reads (apps/api/src/license-key.ts). */
export function vendorPublicKey() {
  const { key, created } = vendorKey();
  const publicKey = createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64');
  return { publicKey, created };
}

/**
 * A key for one server: `client`, its machine code, and `lastDay` (YYYY-MM-DD, the trial runs to
 * the end of that day in Madagascar) or null for no end. Returns the key or the problems.
 */
export function licenseKey({ client, machine, lastDay }) {
  const name = String(client ?? '').trim();
  const code = String(machine ?? '')
    .trim()
    .toUpperCase();
  const problems = [];
  if (name === '') problems.push('Nom du client manquant.');
  if (!MACHINE_CODE.test(code))
    problems.push('Code du serveur attendu : 4 groupes de 4 caractères, ex. 3F2C-0A91-77B4-C2D0.');
  if (lastDay !== null && !DAY.test(String(lastDay))) problems.push('Date de fin invalide.');
  if (problems.length > 0) return { problems };

  const expires = lastDay === null ? null : `${lastDay}T23:59:59+03:00`;
  const payload = Buffer.from(JSON.stringify({ client: name, machine: code, expires })).toString(
    'base64url',
  );
  const key = `${payload}.${sign(null, Buffer.from(payload), vendorKey().key).toString('base64url')}`;
  appendFileSync(
    issuedPath,
    `${new Date().toISOString()}\t${name}\t${code}\t${lastDay ?? 'sans fin'}\n`,
  );
  return { key };
}
