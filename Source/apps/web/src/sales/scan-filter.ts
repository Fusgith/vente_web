/**
 * Burst scanning (RG-DEV-06 §3): the camera sees the same barcode on many frames in a row.
 * A code counts once while it stays in view; it counts again once it has been out of view for
 * `gapMs` — the salesperson scanned the same article a second time. Several codes may be in
 * view together, so each keeps its own last sighting.
 */
export function createScanFilter(gapMs: number) {
  const lastSeen = new Map<string, number>();
  return (code: string, now: number): boolean => {
    for (const [seen, at] of lastSeen) {
      if (now - at >= gapMs) lastSeen.delete(seen);
    }
    const repeated = lastSeen.has(code);
    lastSeen.set(code, now);
    return !repeated;
  };
}
