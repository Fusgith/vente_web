// Prints the secrets of a new shop server, one KEY=value per line (T-080): the PostgreSQL
// passwords and the VAPID key pair of push notifications (T-033e). Run once by the installer;
// the values go straight into the data folder's .env, never on screen.
import { createECDH, randomBytes } from 'node:crypto';

const password = () => randomBytes(24).toString('base64url');
const vapid = createECDH('prime256v1');
vapid.generateKeys();

const lines = {
  POSTGRES_PASSWORD: password(),
  OWNER_PASSWORD: password(),
  API_PASSWORD: password(),
  VAPID_PUBLIC_KEY: vapid.getPublicKey().toString('base64url'),
  VAPID_PRIVATE_KEY: vapid.getPrivateKey().toString('base64url'),
};
for (const [key, value] of Object.entries(lines)) process.stdout.write(`${key}=${value}\n`);
