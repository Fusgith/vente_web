// Creates the shop's first admin account (T-016c), once:
//   pnpm --filter @vente-web/api admin:bootstrap --identifiant admin --nom "Hery Rakoto"
// In production: node --env-file-if-exists=.env dist/cli/admin-bootstrap.js --identifiant … --nom …
// The provisional password is printed once; the admin replaces it at the first login (H20).
import { parseArgs } from 'node:util';

import { createUserBodySchema, ERROR_LABELS } from '@vente-web/shared';

import { createDb } from '../db.js';
import { AppError } from '../errors.js';
import { bootstrapAdmin } from '../services/admin-bootstrap.js';

const USAGE =
  'Usage : admin:bootstrap --identifiant <identifiant sans espace> --nom "<nom complet>"';

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { identifiant: { type: 'string' }, nom: { type: 'string' } },
  });
  const input = createUserBodySchema
    .pick({ username: true, fullName: true })
    .safeParse({ username: values.identifiant, fullName: values.nom });
  if (!input.success) {
    console.error(USAGE);
    return 1;
  }
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL manquant : renseignez-le dans le fichier .env.');
    return 1;
  }

  const db = createDb(url);
  try {
    const result = await bootstrapAdmin(db, input.data);
    if (!result.created) {
      print(
        'Un admin actif existe déjà : rien n’a été créé. Les comptes se gèrent dans l’application.',
      );
      return 0;
    }
    print(`Compte admin « ${input.data.username} » créé.`);
    print(`Mot de passe provisoire (affiché une seule fois) : ${result.password}`);
    print('À la première connexion, l’admin choisit son propre mot de passe.');
    return 0;
  } catch (error) {
    if (error instanceof AppError) {
      console.error(ERROR_LABELS[error.code]);
      return 1;
    }
    throw error;
  } finally {
    await db.$disconnect();
  }
}

process.exitCode = await main();
