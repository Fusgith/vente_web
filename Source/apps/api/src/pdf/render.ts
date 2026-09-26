import { createRequire } from 'node:module';

import pdfmake from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces.js';

import { PDF_FONT } from './style.js';

const require = createRequire(import.meta.url);

/** Asap, the app's own text face, embedded in every document: nothing depends on the system. */
const asap = (weight: number) =>
  require.resolve(`@fontsource/asap/files/asap-latin-${weight}-normal.woff`);
const FONT_FILES = {
  normal: asap(400),
  bold: asap(700),
  italics: asap(400),
  bolditalics: asap(700),
};

pdfmake.setFonts({ [PDF_FONT]: FONT_FILES });
// Documents are built from the database alone: no file is read, nor any address fetched,
// beyond the fonts above.
pdfmake.setUrlAccessPolicy(() => false);
const allowedFiles = new Set(Object.values(FONT_FILES));
pdfmake.setLocalAccessPolicy((path) => allowedFiles.has(path));

export function renderPdf(doc: TDocumentDefinitions): Promise<Buffer> {
  return pdfmake.createPdf(doc).getBuffer();
}
