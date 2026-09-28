import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** A document issued once and kept (RG-FAC-04): an invoice, a credit note. */
export interface IssuedDocument {
  /** `invoices`, `credit-notes`: its folder under the files volume. */
  folder: string;
  year: number;
  number: string;
  /** The file it recorded, null until written. */
  pdfPath: string | null;
}

/**
 * The document's PDF as issued (RG-FAC-04): the file it recorded when there is one; otherwise
 * made once from its frozen content, written under `<folder>/<year>/<number>.pdf`, recorded, and
 * kept — every later reprint sends that file. Only a file the document recorded is its own: one
 * left there by a database reset is replaced.
 */
export async function storedPdf(
  filesDir: string,
  document: IssuedDocument,
  render: () => Promise<Buffer>,
  record: (file: string) => Promise<unknown>,
): Promise<Buffer> {
  const file =
    document.pdfPath ?? path.join(document.folder, String(document.year), `${document.number}.pdf`);
  const absolute = path.resolve(filesDir, file);
  if (document.pdfPath !== null) {
    const stored = await readFile(absolute).catch(() => null);
    if (stored) return stored;
  }
  const pdf = await render();
  await mkdir(path.dirname(absolute), { recursive: true });
  // Written aside then renamed: a reader never gets half a file. Two reprints at once each write
  // their own; one that cannot rename (the file held open by a reader) leaves the other's.
  const partial = `${absolute}.${randomUUID()}.partial`;
  await writeFile(partial, pdf);
  try {
    await rename(partial, absolute);
  } catch (error) {
    await rm(partial, { force: true });
    if (
      !(await access(absolute).then(
        () => true,
        () => false,
      ))
    )
      throw error;
  }
  if (document.pdfPath === null) await record(file);
  return pdf;
}
