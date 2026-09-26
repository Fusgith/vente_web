import { ROLE_LABELS, type Role } from '@vente-web/shared';
import { useId } from 'react';

import { labels } from '../labels.js';
import { Icon } from '../ui/Icon.js';
import { RoleSwatch } from './UserTile.js';
import { ROLE_FILL } from './user-look.js';

interface RoleChoiceProps<R extends Role> {
  roles: readonly R[];
  value: R | null;
  onChange(role: R): void;
}

/**
 * The active role chosen at login (RG-USR-02): big segmented buttons. Each wears its workspace
 * colour — a swatch, then the full fill with a check once chosen.
 */
export function RoleChoice<R extends Role>({ roles, value, onChange }: RoleChoiceProps<R>) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="font-semibold">
        {labels.login.chooseRole}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2"
      >
        {roles.map((role) => {
          const checked = value === role;
          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(role)}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-control border px-3 transition-colors duration-100 ${
                checked
                  ? `border-transparent font-bold text-white ${ROLE_FILL[role]}`
                  : 'border-rule-strong bg-white font-semibold text-ink active:bg-indigo-soft'
              }`}
            >
              {checked ? <Icon name="check" className="size-5" /> : <RoleSwatch role={role} />}
              {ROLE_LABELS[role]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
