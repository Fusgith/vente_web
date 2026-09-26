import type { CategorySummary } from '@vente-web/shared';
import { useState } from 'react';

import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';

interface CategoryPickerProps {
  categories: readonly CategorySummary[];
  /** Undefined: every category. */
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}

/**
 * One trigger « Catégorie : Toutes » instead of a row of chips: the categories open in a sheet of
 * large tiles, the chosen one marked. Choosing closes the sheet and filters (RG-DEV-06 §5).
 */
export function CategoryPicker({ categories, value, onChange }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  // The filter is optional: without categories the search still works, and nothing shows.
  if (categories.length === 0) return null;

  const current = categories.find((category) => category.id === value);
  const tiles = [{ id: undefined, name: labels.sales.allCategoriesTile }, ...categories];
  const choose = (id: string | undefined) => {
    setOpen(false);
    onChange(id);
  };

  return (
    <>
      <button
        type="button"
        data-category-trigger
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={buttonClass('secondary', 'md', 'min-w-0 flex-1 justify-between px-3')}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="font-medium text-ink-2">{labels.sales.categoryTrigger}</span>{' '}
          {current ? (
            <span className="font-bold text-indigo">{current.name}</span>
          ) : (
            labels.sales.allCategories
          )}
        </span>
        <Icon name="chevron" className="size-5 text-ink-2" />
      </button>

      {open && (
        <Sheet
          title={labels.sales.categories}
          closeLabel={labels.sales.closeCategories}
          onClose={() => setOpen(false)}
          width="xl"
          bodyClassName="grid grid-cols-2 content-start gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {tiles.map((category) => {
            const chosen = category.id === value;
            return (
              <button
                key={category.id ?? 'all'}
                type="button"
                aria-pressed={chosen}
                onClick={() => choose(category.id)}
                className={`flex min-h-14 items-center gap-2 rounded-control border px-3 py-1.5 text-left text-16 leading-5 font-semibold transition-colors duration-100 ${
                  chosen
                    ? 'border-indigo bg-indigo text-white active:bg-indigo-deep'
                    : 'border-rule-strong bg-white text-ink active:bg-indigo-soft'
                }`}
              >
                <span className="line-clamp-2 min-w-0 flex-1">{category.name}</span>
                {chosen && <Icon name="check" className="size-5" />}
              </button>
            );
          })}
        </Sheet>
      )}
    </>
  );
}
