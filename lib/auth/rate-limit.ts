/**
 * In-memory sliding window rate limiter for sensitive routes (e.g. login).
 *
 * Keeps track of request timestamps per IP address. Automatically purges stale
 * entries to prevent memory growth.
 *
 * Note: Designed for single-instance PM2 deployments. If scaling horizontally or
 * using PM2 cluster mode in the future, migrate rate limiting to Redis/KeyDB
 * or Nginx `limit_req_zone`.
 */

interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Purge cleanup interval (every 10 minutes)
const CLEANUP_INTERVAL = 10 * 60 * 1000;
let lastCleanup = Date.now();

function purgeStale(windowMs: number) {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;

    for (const [key, entry] of store.entries()) {
        const valid = entry.timestamps.filter((t) => now - t < windowMs);
        if (valid.length === 0) store.delete(key);
        else entry.timestamps = valid;
    }
}

export interface RateLimitResult {
    success: boolean;
    limit: number;
    remaining: number;
    resetMs: number;
}

/**
 * Checks rate limit for a key (e.g. client IP).
 * @param key Unique identifier (IP address)
 * @param limit Max requests allowed per window
 * @param windowMs Time window in milliseconds
 */
export function checkRateLimit(key: string, limit = 10, windowMs = 15 * 60 * 1000): RateLimitResult {
    purgeStale(windowMs);

    const now = Date.now();
    const entry = store.get(key) ?? { timestamps: [] };

    // Filter out timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= limit) {
        const oldestInWindow = entry.timestamps[0];
        const resetMs = Math.max(0, windowMs - (now - oldestInWindow));
        return {
            success: false,
            limit,
            remaining: 0,
            resetMs,
        };
    }

    entry.timestamps.push(now);
    store.set(key, entry);

    return {
        success: true,
        limit,
        remaining: limit - entry.timestamps.length,
        resetMs: windowMs,
    };
}
