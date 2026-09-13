import type { Request, Response, NextFunction } from 'express';

/**
 * Idempotency-Key middleware for non-idempotent POST endpoints (currently
 * `POST /instances` and `POST /walls`).
 *
 * Problem: `editorStore.ts`'s auto-sync retries POSTs on network errors / 5xx / 408 / 429
 * (`fetchWithRetry`). If the server actually committed the insert but the client never saw
 * the response (connection reset, a proxy timing out mid-response, ...), a retry creates a
 * duplicate row. This middleware lets the client attach a stable `Idempotency-Key` header so
 * the same logical write, retried any number of times, is only ever applied once — the first
 * successful (2xx) response is cached and replayed byte-for-byte to every later request that
 * repeats the same key.
 *
 * LIMITATION: the cache below is an in-memory `Map`, local to this Node process. That is
 * correct for the current deployment (a single Docker container / single process). It would
 * NOT dedupe correctly across multiple server instances behind a load balancer — a
 * multi-instance deployment needs a shared store (Redis, or a DB table keyed the same way)
 * with the same in-flight/replay semantics implemented here.
 */

const MAX_ENTRIES = 5000;
const TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_KEY_LENGTH = 200;
const PURGE_INTERVAL_MS = 5 * 60 * 1000; // periodic sweep, in addition to the lazy purge below

interface StoredResult {
  statusCode: number;
  body: unknown;
}

interface PendingEntry {
  kind: 'pending';
  createdAt: number;
  // Resolves to the captured 2xx result, or null if the first attempt did not end 2xx
  // (in which case a waiter should fall through and run the handler itself).
  promise: Promise<StoredResult | null>;
}

interface DoneEntry {
  kind: 'done';
  createdAt: number;
  statusCode: number;
  body: unknown;
}

type CacheEntry = PendingEntry | DoneEntry;

const cache = new Map<string, CacheEntry>();

function purgeExpired(now: number = Date.now()): void {
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > TTL_MS) {
      cache.delete(key);
    }
  }
}

// Periodic sweep so idle keys don't linger indefinitely between requests. unref() so this
// timer never by itself keeps the process alive (relevant for tests / graceful shutdown).
const purgeTimer = setInterval(() => purgeExpired(), PURGE_INTERVAL_MS);
purgeTimer.unref?.();

function enforceCapacity(): void {
  // Map iteration order is insertion order, so the first key is the oldest entry.
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

/**
 * Must be mounted AFTER `authenticate` — it scopes the cache key by `req.user.userId` and is
 * a no-op (via a defensive fallback) if `req.user` is not populated.
 *
 * Behavior:
 * - No `Idempotency-Key` header → calls `next()` unchanged (fully backwards compatible).
 * - Header longer than `MAX_KEY_LENGTH` → 400.
 * - New key → runs the handler normally, but wraps `res.json` to capture the outcome. A 2xx
 *   result is cached and replayed verbatim to any repeat of the same key within the TTL. A
 *   non-2xx result (or the response ending without ever calling `res.json`, e.g. a thrown
 *   error handled elsewhere) deletes the cache entry immediately so a later retry re-executes
 *   the handler from scratch.
 * - Same key while the first request is still in flight → awaits that request's outcome; if
 *   it ends 2xx, replays it; otherwise falls through to `next()` so this request runs the
 *   handler itself.
 */
export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('Idempotency-Key');
  if (!key) {
    next();
    return;
  }
  if (key.length > MAX_KEY_LENGTH) {
    res.status(400).json({ error: `Idempotency-Key darf höchstens ${MAX_KEY_LENGTH} Zeichen lang sein` });
    return;
  }
  if (!req.user) {
    // authenticate() should already have rejected unauthenticated requests before this
    // middleware ever runs; this is a defensive fallback only.
    next();
    return;
  }

  purgeExpired();

  const cacheKey = `${req.user.userId}:${req.method}:${req.baseUrl}${req.path}:${key}`;
  const existing = cache.get(cacheKey);

  if (existing) {
    if (existing.kind === 'done') {
      res.status(existing.statusCode).json(existing.body);
      return;
    }
    // Concurrent duplicate of an in-flight request: wait for it to settle instead of racing
    // a second write.
    existing.promise.then((result) => {
      if (result) {
        res.status(result.statusCode).json(result.body);
      } else {
        next();
      }
    });
    return;
  }

  let resolveInFlight!: (result: StoredResult | null) => void;
  const inFlight = new Promise<StoredResult | null>((resolve) => {
    resolveInFlight = resolve;
  });
  cache.set(cacheKey, { kind: 'pending', createdAt: Date.now(), promise: inFlight });
  enforceCapacity();

  let settled = false;
  const originalJson = res.json.bind(res);
  res.json = ((body?: unknown) => {
    if (!settled) {
      settled = true;
      const statusCode = res.statusCode;
      if (statusCode >= 200 && statusCode < 300) {
        cache.set(cacheKey, { kind: 'done', createdAt: Date.now(), statusCode, body });
        resolveInFlight({ statusCode, body });
      } else {
        cache.delete(cacheKey);
        resolveInFlight(null);
      }
    }
    return originalJson(body);
  }) as typeof res.json;

  // Safety net: if the response ends without ever calling res.json (e.g. res.end() directly,
  // or the connection dropped), treat it the same as a non-2xx outcome so a retry re-executes.
  const settleWithoutResult = () => {
    if (!settled) {
      settled = true;
      cache.delete(cacheKey);
      resolveInFlight(null);
    }
  };
  res.once('finish', settleWithoutResult);
  res.once('close', settleWithoutResult);

  next();
}
