import type { ExportKind, ExportQuery } from '@vente-web/shared';

import { API_BASE } from './client.js';

/** Excel exports (T-071, RG-EXP-01 à 03): a download link, the session cookie goes with it. */
export const exportUrl = (kind: ExportKind, { from, to }: ExportQuery) =>
  `${API_BASE}/exports/${kind}?${new URLSearchParams({ from, to }).toString()}`;
