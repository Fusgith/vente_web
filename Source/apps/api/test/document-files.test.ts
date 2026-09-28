import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storedPdf, type IssuedDocument } from '../src/services/document-files.js';

describe('storedPdf (RG-FAC-04)', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'vente-files-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const invoice: IssuedDocument = {
    folder: 'invoices',
    year: 2026,
    number: 'F-2026-000001',
    pdfPath: null,
  };

  it('writes one file when two reprints ask for it at once, and leaves nothing aside', async () => {
    const record = vi.fn((_file: string) => Promise.resolve());
    const render = () => Promise.resolve(Buffer.from('%PDF-1.7 facture'));
    const both = await Promise.all([
      storedPdf(dir, invoice, render, record),
      storedPdf(dir, invoice, render, record),
    ]);
    expect(both.map(String)).toEqual(['%PDF-1.7 facture', '%PDF-1.7 facture']);
    const folder = path.join(dir, 'invoices', '2026');
    expect(await readdir(folder)).toEqual(['F-2026-000001.pdf']);
    expect(String(await readFile(path.join(folder, 'F-2026-000001.pdf')))).toBe('%PDF-1.7 facture');
    expect(record).toHaveBeenCalledWith(path.join('invoices', '2026', 'F-2026-000001.pdf'));
  });

  it('sends the recorded file as it is, without making it again', async () => {
    const record = vi.fn((_file: string) => Promise.resolve());
    await storedPdf(dir, invoice, () => Promise.resolve(Buffer.from('premier')), record);
    const file = record.mock.calls[0]?.[0] ?? '';
    const render = vi.fn(() => Promise.resolve(Buffer.from('second')));
    const again = await storedPdf(dir, { ...invoice, pdfPath: file }, render, record);
    expect(String(again)).toBe('premier');
    expect(render).not.toHaveBeenCalled();
  });
});
