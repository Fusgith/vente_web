import { ROLE_LABELS, type Role } from '@vente-web/shared';

import { labels } from '../labels.js';

interface RoleChoiceProps<R extends Role> {
  roles: readonly R[];
  value: R | null;
  onChange(role: R): void;
}

/** Big touch targets for the active role chosen at login (RG-USR-02). */
export function RoleChoice<R extends Role>({ roles, value, onChange }: RoleChoiceProps<R>) {
  return (
    <div role="radiogroup" aria-label={labels.login.chooseRole} className="flex flex-wrap gap-2">
      {roles.map((role) => {
        const checked = value === role;
        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(role)}
            className={
              checked
                ? 'min-h-12 rounded-full border-2 border-teal-700 bg-teal-700 px-5 text-lg font-semibold text-white'
                : 'min-h-12 rounded-full border-2 border-slate-300 bg-white px-5 text-lg text-slate-800 hover:border-teal-600'
            }
          >
            {ROLE_LABELS[role]}
          </button>
        );
      })}
    </div>
  );
}
