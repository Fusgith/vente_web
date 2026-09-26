import { describe, expect, it } from 'vitest';

import {
  DEFAULT_APP_NAME,
  DEFAULT_APP_SHORT_NAME,
  appNameProblem,
  appNameSlug,
  checkAppNames,
  tidyAppName,
} from './brand.js';

describe('application name (RG-APP-01)', () => {
  it('falls back to the defaults when no name is given', () => {
    expect(DEFAULT_APP_NAME).toBe('Vente Web');
    expect(checkAppNames({})).toEqual({
      ok: true,
      names: { name: DEFAULT_APP_NAME, shortName: DEFAULT_APP_SHORT_NAME },
    });
  });

  it('tidies spaces and accents before checking', () => {
    expect(tidyAppName('  Épicerie \t  Rasoa ')).toBe('Épicerie Rasoa');
    expect(tidyAppName('Épicerie')).toBe('Épicerie');
    expect(checkAppNames({ name: ' Épicerie   Rasoa ', shortName: ' Rasoa ' })).toEqual({
      ok: true,
      names: { name: 'Épicerie Rasoa', shortName: 'Rasoa' },
    });
  });

  it('puts the name under the icon when it is short enough', () => {
    expect(checkAppNames({ name: 'Chez Rasoa' })).toEqual({
      ok: true,
      names: { name: 'Chez Rasoa', shortName: 'Chez Rasoa' },
    });
  });

  it('requires a short name when the name does not fit under the icon', () => {
    const check = checkAppNames({ name: 'Épicerie Rasoa' });
    expect(check.ok).toBe(false);
    expect(!check.ok && check.problems.join()).toMatch(/nom court de 12 caractères au plus/);
  });

  it('refuses empty, too long or unsafe names', () => {
    expect(appNameProblem('')).toMatch(/vide/);
    expect(appNameProblem('x'.repeat(40))).toBeNull();
    expect(appNameProblem('x'.repeat(41))).toMatch(/41 caractères : 40 au plus/);
    expect(appNameProblem('<script>')).toMatch(/interdit/);
    expect(appNameProblem('Le "Bazar"')).toMatch(/interdit/);
    expect(appNameProblem("L'Épicerie d'Ivato")).toBeNull();
    const check = checkAppNames({ name: 'Épicerie Rasoa', shortName: 'Épicerie Ras.' });
    expect(!check.ok && check.problems).toEqual([
      'Nom court : « Épicerie Ras. » compte 13 caractères : 12 au plus.',
    ]);
  });

  it('turns the name into a folder name', () => {
    expect(appNameSlug('Épicerie Rasoa')).toBe('epicerie-rasoa');
    expect(appNameSlug("  L'Étoile d'Ivato & fils ")).toBe('l-etoile-d-ivato-fils');
    expect(appNameSlug('★')).toBe('application');
  });
});
