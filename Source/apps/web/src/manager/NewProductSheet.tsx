import { type CategorySummary, type ProductDetail } from '@vente-web/shared';
import { useEffect, useId, useState, type FormEvent } from 'react';

import { catalogApi } from '../api/catalog.js';
import { errorMessage } from '../api/error-message.js';
import { productsApi } from '../api/products.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Sheet } from '../ui/Sheet.js';
import { orNull } from './product-input.js';

const text = labels.products;
const FIELD =
  'h-12 w-full min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';

/** A labelled field of the sheets. */
export function Field({
  label,
  value,
  onChange,
  numeric = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        value={value}
        required={required}
        autoComplete="off"
        inputMode={numeric ? 'decimal' : 'text'}
        onChange={(event) => onChange(event.target.value)}
        className={`${FIELD} ${numeric ? 'figures' : ''}`}
      />
    </div>
  );
}

/** Category picker, « Sans catégorie » first. */
export function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    catalogApi.categories(controller.signal).then(setCategories, () => undefined);
    return () => controller.abort();
  }, []);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {text.category}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD}
      >
        <option value="">{text.noCategory}</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A new product with its base unit and, if known, its first price (RG-ART-01, RG-ART-06). */
export function NewProductSheet({
  onDone,
  onClose,
}: {
  onDone: (product: ProductDetail) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [baseUnit, setBaseUnit] = useState('pièce');
  const [threshold, setThreshold] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    productsApi
      .create({
        sku,
        name,
        categoryId: categoryId || null,
        baseUnit,
        alertThreshold: orNull(threshold),
        barcode: barcode.trim() || null,
        price: orNull(price),
      })
      .then(onDone, (error: unknown) => {
        setFailure(errorMessage(error));
        setBusy(false);
      });
  };

  return (
    <Sheet
      title={text.newTitle}
      closeLabel={text.close}
      onClose={onClose}
      width="md"
      footer={
        <button
          type="submit"
          form={formId}
          disabled={busy}
          className={buttonClass('primary', 'lg', 'w-full')}
        >
          {text.save}
        </button>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
        <Field label={text.sku} value={sku} onChange={setSku} required />
        <Field label={text.name} value={name} onChange={setName} required />
        <CategorySelect value={categoryId} onChange={setCategoryId} />
        <Field label={text.baseUnit} value={baseUnit} onChange={setBaseUnit} required />
        <Field label={text.firstPrice} value={price} onChange={setPrice} numeric />
        <Field label={text.threshold} value={threshold} onChange={setThreshold} numeric />
        <Field label={text.barcode} value={barcode} onChange={setBarcode} />
        {failure && (
          <p role="alert" className="font-semibold text-madder">
            {failure}
          </p>
        )}
      </form>
    </Sheet>
  );
}
