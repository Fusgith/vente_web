import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The shop's logo (RG-FAC-07, H80): `logo-client.png` copied by the installer into the files
 * folder. Missing or not a PNG, the documents are printed without it: a logo never stops a sale.
 */
export async function readStoreLogo(filesDir: string): Promise<string | null> {
  const file = await readFile(path.resolve(filesDir, 'logo-client.png')).catch(() => null);
  if (!file || !file.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return `data:image/png;base64,${file.toString('base64')}`;
}
