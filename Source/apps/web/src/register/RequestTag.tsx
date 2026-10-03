import { labels } from '../labels.js';
import { tagClass } from '../ui/button.js';

/**
 * « Remise demandée » on an order of the register queue whose request awaits the owner (H52,
 * RG-DSP-04): skipped by « Appeler le suivant », its payment waits for the answer.
 */
export function RequestTag({ className = '' }: { className?: string }) {
  return (
    <span className={`${tagClass} border-indigo bg-indigo-soft text-ink ${className}`}>
      {labels.requests.tag}
    </span>
  );
}
