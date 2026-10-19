import type { ExportCell, ExportDefinition } from '@vente-web/shared';
import ExcelJS from 'exceljs';

import { shopWallClock } from './shop-time.js';

/** A cell as the export services hand it: amounts and quantities as decimal strings. */
export type Value = string | number | Date | null;
export type Rows = Value[][];

/** Excel's own codes; a French Excel shows `# ##0,00` (RG-FMT-02, CDC technique §9). */
const FORMATS: Partial<Record<ExportCell, string>> = {
  amount: '#,##0.00',
  pct: '0.00',
  count: '0',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
};
/** RG-ART-04: a whole quantity shows no decimals. */
const QTY_WHOLE = '#,##0';
const QTY_DECIMAL = '#,##0.00';

function cellValue(value: Value, cell: ExportCell): string | number | Date | null {
  if (value === null || value === '') return null;
  if (value instanceof Date) return shopWallClock(value);
  if (cell === 'text') return String(value);
  return Number(value);
}

/** One sheet per part of the export, the headers bold and frozen, numbers native (RG-EXP-02). */
export async function writeWorkbook(
  definition: ExportDefinition,
  sheets: readonly Rows[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  definition.sheets.forEach(({ name, columns }, index) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns.map(([header, cell]) => ({
      header,
      width: Math.max(header.length + 2, cell === 'text' ? 18 : 14),
      style: FORMATS[cell] ? { numFmt: FORMATS[cell] } : {},
    }));
    sheet.getRow(1).font = { bold: true };
    for (const values of sheets[index] ?? []) {
      const row = sheet.addRow(
        values.map((value, at) => cellValue(value, columns[at]?.[1] ?? 'text')),
      );
      columns.forEach(([, cell], at) => {
        const value = row.getCell(at + 1).value;
        if (cell === 'qty' && typeof value === 'number') {
          row.getCell(at + 1).numFmt = Number.isInteger(value) ? QTY_WHOLE : QTY_DECIMAL;
        }
      });
    }
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
