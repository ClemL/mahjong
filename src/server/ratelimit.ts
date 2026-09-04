import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { RoomError } from "./errors";

/**
 * Request throttling.
 *
 * The table password is one short shared secret and room codes are four
 * characters, so without a limiter both are guessable by brute force, and
 * `POST /api/rooms` is an open invitation to fill the room store. Limits are
 * keyed by client IP.
 *
 * With Upstash configured the counters are shared across serverless instances,
 * which is the only way this actually holds. Without it a per-process window is
 * used so local development and the tests behave the same way — that fallback
 * is weaker in production, exactly like the memory room store.
 */

export type LimitKind = "create" | "claim" | "act";

/** Windows chosen for a table of friends, not a public service. */
const LIMITS: Record<LimitKind, { tokens: number; window: `${number} ${"s" | "m" | "h"}` }> = {
  // Opening rooms is rare and each one costs storage.
  create: { tokens: 5, window: "10 m" },
  // The only endpoint that checks the password, so this is the brute-force gate.
  claim: { tokens: 10, window: "10 m" },
  // Generous: a fast player plus polling should never reach it.
  act: { tokens: 120, window: "1 m" },
};

function parseWindowMs(window: string): number {
  const [value, unit] = window.split(" ");
  const scale = unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : 1000;
  return Number(value) * scale;
}

/** Fixed window kept in the process, for local runs without Upstash. */
class MemoryLimiter {
  private hits = new Map<string, number[]>();

  check(key: string, tokens: number, windowMs: number, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= tokens) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

const memory = new MemoryLimiter();
const limiters = new Map<LimitKind, Ratelimit>();

function upstashLimiter(kind: LimitKind): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const existing = limiters.get(kind);
  if (existing) return existing;
  const limit = LIMITS[kind];
  const created = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit.tokens, limit.window),
    prefix: `mahjong:rl:${kind}`,
    analytics: false,
  });
  limiters.set(kind, created);
  return created;
}

/** Best-effort client address; proxies put the real one first. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Throws a 429 when the caller has spent their allowance. */
export async function enforceLimit(kind: LimitKind, request: Request): Promise<void> {
  const key = clientKey(request);
  const limiter = upstashLimiter(kind);
  if (limiter) {
    const { success, reset } = await limiter.limit(key);
    if (!success) {
      const seconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      throw new RoomError(`Too many attempts — try again in ${seconds}s`, 429);
    }
    return;
  }
  const limit = LIMITS[kind];
  if (!memory.check(`${kind}:${key}`, limit.tokens, parseWindowMs(limit.window), Date.now())) {
    throw new RoomError("Too many attempts — slow down", 429);
  }
}
