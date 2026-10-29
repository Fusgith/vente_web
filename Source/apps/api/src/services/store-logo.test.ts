import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readStoreLogo } from './store-logo.js';

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('shop logo on the documents (RG-FAC-07, H80)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'store-logo-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('reads the PNG copied by the installer as a data URL', async () => {
    await writeFile(path.join(dir, 'logo-client.png'), Buffer.from(ONE_PIXEL_PNG, 'base64'));
    expect(await readStoreLogo(dir)).toBe(`data:image/png;base64,${ONE_PIXEL_PNG}`);
  });

  it('prints nothing without a logo or with a file that is not a PNG', async () => {
    expect(await readStoreLogo(dir)).toBeNull();
    await writeFile(path.join(dir, 'logo-client.png'), 'not an image');
    expect(await readStoreLogo(dir)).toBeNull();
  });
});
