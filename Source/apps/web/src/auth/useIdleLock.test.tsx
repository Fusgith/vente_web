import { act, fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useIdleLock } from './useIdleLock.js';

const FIVE_MINUTES = 5 * 60_000;

/** Moves the clock without running timers, as while a tablet sleeps. */
function sleep(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

describe('useIdleLock (RG-USR-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('locks once after the delay without activity', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLock(FIVE_MINUTES, onIdle));

    act(() => vi.advanceTimersByTime(FIVE_MINUTES - 5_000));
    expect(onIdle).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(5_000));
    expect(onIdle).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(FIVE_MINUTES));
    fireEvent.keyDown(window, { key: 'a' });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('restarts the delay on every activity and reports it', () => {
    const onIdle = vi.fn();
    const onActivity = vi.fn();
    renderHook(() => useIdleLock(FIVE_MINUTES, onIdle, onActivity));

    act(() => vi.advanceTimersByTime(4 * 60_000));
    fireEvent.pointerDown(document.body);
    act(() => vi.advanceTimersByTime(4 * 60_000));
    fireEvent.wheel(document.body);

    expect(onActivity).toHaveBeenCalledTimes(2);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('locks a tablet that wakes up after the delay instead of counting the tap', () => {
    const onIdle = vi.fn();
    const onActivity = vi.fn();
    renderHook(() => useIdleLock(FIVE_MINUTES, onIdle, onActivity));

    sleep(FIVE_MINUTES + 60_000);
    fireEvent.pointerDown(document.body);

    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onActivity).not.toHaveBeenCalled();
  });

  it('checks as soon as the page is visible again', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLock(FIVE_MINUTES, onIdle));

    sleep(FIVE_MINUTES);
    fireEvent(document, new Event('visibilitychange'));

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('stops listening once unmounted', () => {
    const onIdle = vi.fn();
    const { unmount } = renderHook(() => useIdleLock(FIVE_MINUTES, onIdle));
    unmount();

    act(() => vi.advanceTimersByTime(2 * FIVE_MINUTES));
    expect(onIdle).not.toHaveBeenCalled();
  });
});
