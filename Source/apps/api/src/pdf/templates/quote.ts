import type { Quote } from '@vente-web/shared';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces.js';

import type { StoreLegal } from '../../services/store-legal.js';
import { QUOTE_PDF as text } from '../labels.js';
import { SAFFRON_SOFT } from '../style.js';
import { documentDefinition, totalsBlock } from './document.js';

export interface QuoteDocumentContext {
  legal: StoreLegal;
  /** The shop's day the quote was created, then its last day of validity (RG-DEV-02, H27). */
  issuedOn: string;
  validUntil: string;
}

/** RG-FAC-06: on saffron, as what is still in progress on the screens. */
function noticeBlock(validUntil: string): Content {
  return {
    margin: [0, 18, 0, 0],
    layout: 'noBorders',
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: text.notice(validUntil),
            bold: true,
            fillColor: SAFFRON_SOFT,
            margin: [8, 6, 8, 6],
          },
        ],
      ],
    },
  };
}

/** The quote in A4 (RG-DEV-05, RG-FAC-06, RG-FAC-07): the same table and totals as the screen. */
export function quoteDocument(quote: Quote, context: QuoteDocumentContext): TDocumentDefinitions {
  return documentDefinition({
    legal: context.legal,
    title: text.title,
    number: quote.number,
    meta: [
      [text.issuedOn, context.issuedOn],
      [text.validUntil, context.validUntil],
      [text.salesUser, quote.salesUser.fullName],
    ],
    customer: quote.customer,
    lines: quote.lines,
    after: [totalsBlock(quote), noticeBlock(context.validUntil)],
    page: (current, count) => text.page(quote.number, current, count),
  });
}
