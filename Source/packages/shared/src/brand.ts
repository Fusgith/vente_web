import brand from './brand.json' with { type: 'json' };

/**
 * Application name, fixed when a build is made for distribution (RG-APP-01, ADR-0006, ⚠️ H25):
 * browser tab, label under the installed icon, frame of every screen, issuer in the
 * authenticator app. Never the legal name printed on invoices (RG-FAC-07).
 */
export const DEFAULT_APP_NAME: string = brand.name;
/** Label under the tablet icon, where longer names get cut. */
export const DEFAULT_APP_SHORT_NAME: string = brand.shortName;
export const APP_NAME_MAX_LENGTH = 40;
export const APP_SHORT_NAME_MAX_LENGTH = 12;

export interface AppNames {
  name: string;
  shortName: string;
}

export type AppNamesCheck = { ok: true; names: AppNames } | { ok: false; problems: string[] };

// The name is written as is into the page title and the manifest: no markup, no quote, no escape.
const UNSAFE_CHARACTERS = /[<>"\\\p{Cc}]/u;

/** One spelling everywhere: composed accents, trimmed, single spaces. */
export function tidyAppName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/** Why a tidied name cannot be used, in French for `pnpm dist`; null when it can. */
export function appNameProblem(name: string, maxLength = APP_NAME_MAX_LENGTH): string | null {
  const length = [...name].length;
  if (length === 0) return 'Le nom est vide.';
  if (length > maxLength) {
    return `« ${name} » compte ${length} caractères : ${maxLength} au plus.`;
  }
  if (UNSAFE_CHARACTERS.test(name)) {
    return `« ${name} » contient un caractère interdit : <, >, " ou \\.`;
  }
  return null;
}

/**
 * Names of a build. Without a name, the defaults. Without a short name, the name itself goes
 * under the icon when it fits; otherwise a short name is required (⚠️ H25).
 */
export function checkAppNames(input: { name?: string; shortName?: string }): AppNamesCheck {
  if (input.name === undefined && input.shortName === undefined) {
    return { ok: true, names: { name: DEFAULT_APP_NAME, shortName: DEFAULT_APP_SHORT_NAME } };
  }
  const name = tidyAppName(input.name ?? DEFAULT_APP_NAME);
  const problems: string[] = [];
  const nameProblem = appNameProblem(name);
  if (nameProblem) problems.push(nameProblem);

  let shortName = input.shortName === undefined ? undefined : tidyAppName(input.shortName);
  if (shortName === undefined && [...name].length <= APP_SHORT_NAME_MAX_LENGTH) shortName = name;
  if (shortName === undefined) {
    problems.push(
      `« ${name} » est trop long pour l'icône : il faut un nom court de ${APP_SHORT_NAME_MAX_LENGTH} caractères au plus.`,
    );
  } else {
    const shortProblem = appNameProblem(shortName, APP_SHORT_NAME_MAX_LENGTH);
    if (shortProblem) problems.push(`Nom court : ${shortProblem}`);
  }

  if (problems.length > 0 || shortName === undefined) return { ok: false, problems };
  return { ok: true, names: { name, shortName } };
}

/** Folder of a build under `Dist/`: « Épicerie Rasoa » → `epicerie-rasoa`. */
export function appNameSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'application' : slug;
}
