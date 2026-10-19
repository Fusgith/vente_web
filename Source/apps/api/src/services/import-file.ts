import { IMPORT_REQUIRED_COLUMNS } from '@vente-web/shared';
import ExcelJS from 'exceljs';

import { AppError } from '../errors.js';

/** One row of the sheet: its number as the spreadsheet shows it, its cells by column name. */
export interface RawRow {
  row: number;
  cells: Record<string, string>;
}

/** « Catégorie » → `categorie`, « Prix vente » → `prix_vente` (annexe A). */
function columnName(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** CSV as Excel saves it in French (`;`) or in English (`,`), quotes doubled inside quotes. */
function csvRows(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') >>> 0);
  const separator =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      rows.push([...row, cell.replace(/\r$/, '')]);
      row = [];
      cell = '';
    } else cell += char;
  }
  rows.push([...row, cell.replace(/\r$/, '')]);
  return rows;
}

async function sheetRows(content: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(content as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  // Row numbers kept as the sheet shows them: an empty row in between leaves a gap.
  sheet.eachRow({ includeEmpty: true }, (row, number) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cells[column - 1] = cell.text;
    });
    rows[number - 1] = Array.from(cells, (cell) => cell ?? '');
  });
  return Array.from(rows, (row) => row ?? []);
}

/**
 * The rows of an uploaded `.xlsx` (first sheet) or UTF-8 `.csv` (RG-IMP-01): the first non-empty
 * row names the columns, every following non-empty row is one product × sale unit.
 */
export async function readImportFile(fileName: string, content: Buffer): Promise<RawRow[]> {
  let table: string[][];
  try {
    table = /\.csv$/i.test(fileName)
      ? csvRows(content.toString('utf8').trimStart())
      : await sheetRows(content);
  } catch {
    throw new AppError(400, 'IMPORT_UNREADABLE');
  }
  const filled = (row: string[]) => row.some((cell) => cell.trim() !== '');
  const headerIndex = table.findIndex(filled);
  if (headerIndex < 0) throw new AppError(400, 'IMPORT_EMPTY');
  const columns = (table[headerIndex] ?? []).map(columnName);
  const missing = IMPORT_REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) throw new AppError(400, 'IMPORT_COLUMNS_MISSING', { missing });

  const rows: RawRow[] = [];
  table.forEach((row, index) => {
    if (index <= headerIndex || !filled(row)) return;
    const cells: Record<string, string> = {};
    columns.forEach((column, at) => {
      if (column) cells[column] = (row[at] ?? '').trim();
    });
    rows.push({ row: index + 1, cells });
  });
  if (rows.length === 0) throw new AppError(400, 'IMPORT_EMPTY');
  return rows;
}

const TEMPLATE_COLUMNS = [
  'code',
  'categorie',
  'designation',
  'unite',
  'facteur',
  'quantite',
  'prix_vente',
  'prix_grossiste',
  'prix_semi_grossiste',
  'prix_detaillant',
  'prix_particulier',
  'code_barres',
  'seuil_alerte',
  'actif',
];

/** The annexe A model with its example: a soap sold by the piece, the pack and the carton. */
export async function importTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Articles');
  sheet.addRow(TEMPLATE_COLUMNS).font = { bold: true };
  sheet.addRow(['SAV-001', 'Hygiène', 'Savon de Marseille 300 g', 'pièce', '', 20, 4500]);
  sheet.addRow(['SAV-001', '', '', 'paquet', 6, 0, 25000]);
  sheet.addRow(['SAV-001', '', '', 'carton', 72, 5, 280000]);
  sheet.columns.forEach((column) => {
    column.width = 18;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
