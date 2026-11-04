export type RateLimiter = (key: string, now?: number) => boolean;

/** Fixed window, in memory. Per process only: use a shared store if this runs on several instances. */
export const createRateLimiter = (limit: number, windowMs: number): RateLimiter => {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return (key, now = Date.now()) => {
    for (const [existing, entry] of windows) {
      if (now - entry.startedAt >= windowMs) windows.delete(existing);
    }
    const current = windows.get(key) ?? { startedAt: now, count: 0 };
    if (current.count >= limit) return false;
    windows.set(key, { ...current, count: current.count + 1 });
    return true;
  };
};
