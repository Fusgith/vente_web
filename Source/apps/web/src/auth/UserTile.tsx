import { ROLE_LABELS, type Role } from '@vente-web/shared';
import { Fragment } from 'react';

import { Icon } from '../ui/Icon.js';
import { initials, ROLE_FILL } from './user-look.js';

export type TileSize = 'md' | 'lg';

/** `tile-lg`: the big directory tile keeps the medium disc on a phone (one column). */
type DiscSize = TileSize | 'tile-lg';

const DISC_SIZE: Record<DiscSize, string> = {
  md: 'size-12 text-18',
  lg: 'size-16 text-21',
  'tile-lg': 'size-12 text-18 sm:size-16 sm:text-21',
};

interface UserDiscProps {
  fullName: string;
  roles: readonly Role[];
  size?: DiscSize;
}

/** The initials disc, in the frame colour of the user's first role. Decorative: the name is written. */
export function UserDisc({ fullName, roles, size = 'md' }: UserDiscProps) {
  const fill = ROLE_FILL[roles[0] ?? 'sales'];
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-display leading-none font-bold text-white [font-stretch:112%] ${fill} ${DISC_SIZE[size]}`}
    >
      {initials(fullName)}
    </span>
  );
}

/** A small square in the role's frame colour, before its name (never colour alone). */
export function RoleSwatch({ role }: { role: Role }) {
  return (
    <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-[3px] ${ROLE_FILL[role]}`} />
  );
}

/** Role names, each after its swatch; the separators are commas for screen readers only. */
export function RoleList({ roles }: { roles: readonly Role[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-14 text-ink-2">
      {roles.map((role, index) => (
        <Fragment key={role}>
          {index > 0 && <span className="sr-only">, </span>}
          <span className="inline-flex items-center gap-1.5">
            <RoleSwatch role={role} />
            {ROLE_LABELS[role]}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

const TILE_SIZE: Record<TileSize, { tile: string; name: string }> = {
  md: { tile: 'min-h-20 gap-3', name: 'text-16' },
  lg: { tile: 'min-h-20 gap-3 sm:min-h-28 sm:gap-4', name: 'text-16 sm:text-18' },
};

interface UserTileProps {
  fullName: string;
  roles: readonly Role[];
  chosen: boolean;
  onChoose(): void;
  size?: TileSize;
}

/**
 * One person of the directory: disc, name, roles. The chosen one is « in progress »: saffron-soft
 * ground, saffron bar, ink border and a check on the disc (nothing reflows).
 */
export function UserTile({ fullName, roles, chosen, onChoose, size = 'md' }: UserTileProps) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onChoose}
      className={`relative flex h-full w-full items-center overflow-hidden rounded-key text-left transition-colors duration-100 ${TILE_SIZE[size].tile} ${
        chosen
          ? 'border-2 border-ink bg-saffron-soft py-2 pr-3 pl-4'
          : 'border border-rule-strong bg-white py-[9px] pr-[13px] pl-[17px] active:bg-indigo-soft'
      }`}
    >
      {chosen && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-saffron" />}
      <span className="relative shrink-0">
        <UserDisc fullName={fullName} roles={roles} size={size === 'lg' ? 'tile-lg' : 'md'} />
        {chosen && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-ink text-white ring-2 ring-saffron-soft"
          >
            <Icon name="check" className="size-4" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`line-clamp-2 font-bold text-ink ${TILE_SIZE[size].name}`}>
          {fullName}
        </span>
        <span className="sr-only">, </span>
        <RoleList roles={roles} />
      </span>
    </button>
  );
}
