/**
 * The optional public display (T-041, RG-DSP-01 à 03): a station without an account, opened by
 * its key, showing the last tickets called per queue. Tickets and stations only: no customer
 * name on a public screen.
 */
import { z } from 'zod';

/** Socket.IO handshake field the display sends its key in, instead of a session cookie. */
export const DISPLAY_KEY_AUTH = 'displayKey';

export const displayCallSchema = z.object({
  ticket: z.string(),
  /** Register or counter it was called to; null when not known (before T-015). */
  station: z.string().nullable(),
  calledAt: z.iso.datetime({ offset: true }),
});
export type DisplayCall = z.infer<typeof displayCallSchema>;

export const displayBoardSchema = z.object({
  /** Signal on each new call (RG-DSP-02, `display.sound`). */
  sound: z.boolean(),
  /** Most recent first, `display.last_calls` at most, of the shop's day (RG-DSP-01). */
  register: z.array(displayCallSchema),
  delivery: z.array(displayCallSchema),
});
export type DisplayBoard = z.infer<typeof displayBoardSchema>;
