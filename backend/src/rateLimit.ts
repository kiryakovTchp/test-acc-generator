import { ApiError } from './limits.js';

interface RateLimitOptions {
  limit: number;
  windowMs: number;
  code: string;
  message: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();
let lastCleanupAt = 0;

export function assertRateLimit(key: string, options: RateLimitOptions, now = Date.now()) {
  cleanup(now);

  const normalizedKey = key.slice(0, 240);
  const entry = buckets.get(normalizedKey);
  if (!entry || entry.resetAt <= now) {
    buckets.set(normalizedKey, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  entry.count += 1;
  if (entry.count > options.limit) {
    throw new ApiError(options.code, options.message, 429);
  }
}

export function resetRateLimitsForTest() {
  buckets.clear();
  lastCleanupAt = 0;
}

function cleanup(now: number) {
  if (now - lastCleanupAt < 60000) return;
  lastCleanupAt = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
