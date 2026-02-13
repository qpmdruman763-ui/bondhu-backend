/**
 * In-memory per-socket rate limiter.
 * Same limits on every instance; for Redis-backed limits at scale, add later.
 */
const WINDOW_MS = 60 * 1000; // 1 minute

export const limits = {
  message: { max: 60, window: WINDOW_MS },
  typing: { max: 30, window: WINDOW_MS },
  call_user: { max: 10, window: WINDOW_MS },
  private_message: { max: 120, window: WINDOW_MS },
  message_reaction: { max: 60, window: WINDOW_MS },
  live_script_data: { max: 120, window: WINDOW_MS },
};

const buckets = new Map(); // socketId -> { eventName: { count, resetAt } }

function getBucket(socketId, eventName) {
  if (!buckets.has(socketId)) buckets.set(socketId, {});
  const b = buckets.get(socketId);
  const limit = limits[eventName];
  if (!b[eventName]) b[eventName] = { count: 0, resetAt: Date.now() + (limit?.window ?? WINDOW_MS) };
  return b[eventName];
}

export function cleanup(socketId) {
  buckets.delete(socketId);
}

export function isAllowed(socketId, eventName) {
  const limit = limits[eventName];
  if (!limit) return true;
  const bucket = getBucket(socketId, eventName);
  const now = Date.now();
  if (now >= bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + limit.window;
  }
  if (bucket.count >= limit.max) return false;
  bucket.count++;
  return true;
}
