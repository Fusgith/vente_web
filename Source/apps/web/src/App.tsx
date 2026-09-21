import { formatMga } from '@vente-web/shared';

import { labels } from './labels.js';

export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-3xl font-bold text-teal-700">{labels.appName}</h1>
      <p className="text-lg text-gray-700">{labels.tagline}</p>
      <p className="rounded-lg bg-gray-100 p-4 text-gray-800">{labels.scaffoldNotice}</p>
      <p data-testid="sample-amount" className="text-xl">
        {labels.sampleAmount}{' '}
        <strong data-testid="sample-amount-value">{formatMga('1250000')}</strong>
      </p>
    </main>
  );
}
