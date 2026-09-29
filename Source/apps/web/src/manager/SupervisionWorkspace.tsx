import { labels } from '../labels.js';
import { useNow } from '../register/useQueue.js';
import { DayIndicators } from './DayIndicators.js';
import { NoShowNotices } from './NoShowNotices.js';
import { QueueBoard } from './QueueBoard.js';

/** Every half-minute, as at the register: the waits shown keep running (RG-FIL-05). */
const TICK = 30_000;

/**
 * The manager's supervision (T-042, RG-DSP-04): the day's figures, then both queues live, each
 * reordered by hand (RG-FIL-02). The delivery issues and the registers follow in the shell.
 */
export function SupervisionWorkspace() {
  const now = useNow(TICK);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-6">
      <NoShowNotices />
      <h1 className="type-title">{labels.workspaces.manager.title}</h1>
      <DayIndicators />
      <QueueBoard queue="register" now={now} />
      <QueueBoard queue="delivery" now={now} />
    </div>
  );
}
