import { useEffect, useRef } from 'react';

/** How often idleness is checked; a sleeping tablet is also checked as soon as it wakes. */
export const IDLE_CHECK_INTERVAL_MS = 5_000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Calls `onIdle` once after `idleMs` without user activity (RG-USR-03: 5 min on a tablet,
 * 15 min at the register — the server gives the value) and `onActivity` on every activity.
 * Elapsed time is measured, not scheduled: timers stall while a tablet sleeps.
 */
export function useIdleLock(idleMs: number, onIdle: () => void, onActivity?: () => void): void {
  const onIdleRef = useRef(onIdle);
  const onActivityRef = useRef(onActivity);
  useEffect(() => {
    onIdleRef.current = onIdle;
    onActivityRef.current = onActivity;
  });

  useEffect(() => {
    let lastActivity = Date.now();
    let fired = false;
    const check = () => {
      if (fired || Date.now() - lastActivity < idleMs) return;
      fired = true;
      onIdleRef.current();
    };
    const markActive = () => {
      if (fired) return;
      // A tablet waking after the delay must lock, not count the wake-up tap as activity.
      check();
      if (fired) return;
      lastActivity = Date.now();
      onActivityRef.current?.();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true, capture: true });
    }
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(check, IDLE_CHECK_INTERVAL_MS);
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive, { capture: true });
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [idleMs]);
}
