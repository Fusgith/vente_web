import type { Role } from '@vente-web/shared';

/**
 * Each role wears the colour of its workspace frame: the initials disc of a user (first role)
 * and the small role swatches of the login directory repeat the cloth they will work in.
 */
export const ROLE_FILL: Record<Role, string> = {
  sales: 'bg-frame-sales',
  cashier: 'bg-frame-cashier',
  warehouse: 'bg-frame-warehouse',
  manager: 'bg-frame-manager',
  owner: 'bg-frame-owner',
  admin: 'bg-frame-admin',
};

/** « Rakoto Responsable » → « RR »: the first letters of the first two words. */
export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** A text link that is still a 48 px target, flush with the text column (password / PIN switch). */
export const textLinkClass =
  '-mx-1 inline-flex min-h-12 items-center self-start rounded-tag px-1 font-semibold text-ink underline decoration-2 underline-offset-4 active:bg-indigo-soft';

/**
 * The directory scales with the staff: a few people get big tiles on two columns, a dozen
 * medium ones, beyond that 80 px tiles (about 18 fit a landscape tablet without scrolling).
 */
export function directoryLayout(count: number): { grid: string; tile: 'md' | 'lg' } {
  if (count <= 6) return { grid: 'grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]', tile: 'lg' };
  if (count <= 12)
    return {
      grid: 'grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] auto-rows-[minmax(6rem,auto)]',
      tile: 'md',
    };
  return {
    grid: 'grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] auto-rows-[minmax(5.5rem,auto)]',
    tile: 'md',
  };
}
