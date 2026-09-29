import { describe, expect, it } from 'vitest';

import { dropBefore, rankAfter, stepBefore } from './queue-moves.js';

const IDS = ['a', 'b', 'c', 'd'];

describe('moving an order in its queue (RG-FIL-02)', () => {
  it('drops it before the row under the line, or last', () => {
    expect(dropBefore(IDS, 'c', 0)).toBe('a');
    expect(dropBefore(IDS, 'a', 3)).toBe('d');
    expect(dropBefore(IDS, 'b', 4)).toBeNull();
  });

  it('does not move it when dropped where it stands', () => {
    expect(dropBefore(IDS, 'b', 1)).toBeUndefined();
    expect(dropBefore(IDS, 'b', 2)).toBeUndefined();
    expect(dropBefore(IDS, 'z', 0)).toBeUndefined();
  });

  it('steps it one place up or down, never past the ends', () => {
    expect(stepBefore(IDS, 'c', -1)).toBe('b');
    expect(stepBefore(IDS, 'b', 1)).toBe('d');
    expect(stepBefore(IDS, 'c', 1)).toBeNull();
    expect(stepBefore(IDS, 'a', -1)).toBeUndefined();
    expect(stepBefore(IDS, 'd', 1)).toBeUndefined();
  });

  it('tells the rank it takes', () => {
    expect(rankAfter(IDS, 'c', 'a')).toBe(1);
    expect(rankAfter(IDS, 'a', 'd')).toBe(3);
    expect(rankAfter(IDS, 'a', null)).toBe(4);
  });
});
