// Shared (global) rate limiting. Pure: no framework imports and fetch is injectable, so
// tests/rate-limit.test.mjs runs it under Node. lib/rate-limit.ts is the server-only entry point.
import { createHash } from "node:crypto";
import { RateLimiter } from "./security.ts";

/** Same contract as the in-memory RateLimiter, but async: hit() → ms to wait (0 = allowed); clear() forgets a key. */
export interface Limiter {
  hit(key: string): Promise<number>;
  clear(key: string): Promise<void>;
}

/** SHA-256 hex, so raw emails and IPs are never used as storage keys or written to Redis. */
export const hashKey = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
/** Lower-cased, trimmed email → hashed key. */
export const emailKey = (email: string) => hashKey(email.trim().toLowerCase());

/** In-process limiter (one count per server instance). Used when Upstash isn't configured. */
export class MemoryLimiter implements Limiter {
  private rl: RateLimiter;
  private now: () => number;
  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.rl = new RateLimiter(limit, windowMs);
    this.now = now;
  }
  async hit(key: string) { return this.rl.hit(key, this.now()); }
  async clear(key: string) { this.rl.clear(key); }
}

/**
 * Sliding-window log in one Redis sorted set per key, done atomically in a Lua script: drop entries older than the
 * window, refuse (returning the wait) if `limit` remain, otherwise record this attempt. Refused attempts are not
 * recorded, so hammering doesn't extend the lock-out forever.
 */
export const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
if redis.call('ZCARD', key) >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local wait = tonumber(oldest[2]) + window - now
  if wait < 1 then wait = 1 end
  return wait
end
redis.call('ZADD', key, now, ARGV[4])
redis.call('PEXPIRE', key, window)
return 0`;

export type UpstashConfig = { url: string; token: string };

/** Upstash Redis over its REST API (no client library). Falls back to `fallback` for a hit if Redis can't be reached. */
export class UpstashLimiter implements Limiter {
  private cfg: UpstashConfig;
  private name: string;
  private limit: number;
  private windowMs: number;
  private fallback: Limiter;
  private fetchImpl: typeof fetch;
  private now: () => number;
  private onError: (name: string) => void;
  constructor(
    cfg: UpstashConfig, name: string, limit: number, windowMs: number, fallback: Limiter,
    fetchImpl: typeof fetch = fetch, now: () => number = Date.now, onError: (name: string) => void = () => {},
  ) {
    this.cfg = cfg; this.name = name; this.limit = limit; this.windowMs = windowMs;
    this.fallback = fallback; this.fetchImpl = fetchImpl; this.now = now; this.onError = onError;
  }

  private key(k: string) { return `mrrmr:rl:${this.name}:${k}`; }

  private async command(args: (string | number)[]): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    try {
      const res = await this.fetchImpl(this.cfg.url.replace(/\/+$/, ""), {
        method: "POST",
        headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args.map(String)),
        signal: ctrl.signal,
        cache: "no-store",
      });
      const data = (await res.json()) as { result?: unknown; error?: string };
      if (!res.ok || data.error !== undefined) throw new Error("upstash");
      return data.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async hit(k: string): Promise<number> {
    try {
      const now = this.now();
      const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
      const wait = Number(await this.command(["EVAL", SLIDING_WINDOW_LUA, 1, this.key(k), now, this.windowMs, this.limit, member]));
      if (!Number.isFinite(wait) || wait < 0) throw new Error("upstash");
      return wait;
    } catch {
      this.onError(this.name);
      return this.fallback.hit(k);
    }
  }

  async clear(k: string): Promise<void> {
    await this.fallback.clear(k);
    try { await this.command(["DEL", this.key(k)]); } catch { this.onError(this.name); }
  }
}

/** Upstash settings from env, or null (→ in-memory fallback). Both must be present and the URL must be https. */
export function upstashConfig(env: Record<string, string | undefined>): UpstashConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? "", token = env.UPSTASH_REDIS_REST_TOKEN ?? "";
  if (!url || !token) return null;
  try { if (new URL(url).protocol !== "https:") return null; } catch { return null; }
  return { url, token };
}

/** The limits (count per window). Login and reset are keyed by IP AND by hashed email. */
export const LIMITS = {
  loginIp: { limit: 5, windowMs: 15 * 60_000 },
  loginEmail: { limit: 10, windowMs: 60 * 60_000 },
  resetIp: { limit: 3, windowMs: 60 * 60_000 },
  resetEmail: { limit: 3, windowMs: 60 * 60_000 },
  resetForm: { limit: 10, windowMs: 15 * 60_000 },
  viewIp: { limit: 8, windowMs: 15 * 60_000 },
  mfa: { limit: 5, windowMs: 15 * 60_000 },
  exportUser: { limit: 30, windowMs: 10 * 60_000 },
} as const;
export type LimitName = keyof typeof LIMITS;

/**
 * The caller's IP, from headers the host sets and a client can't forge.
 * On Vercel: `x-real-ip` (what @vercel/functions' ipAddress() reads) or `x-vercel-forwarded-for`; Vercel overwrites
 * both at its edge. A client-sent `x-forwarded-for` chain is NEVER used there. Off Vercel (local dev / self-hosting
 * without a trusted proxy) every caller shares one key, which is the safe direction.
 */
export function trustedClientIp(get: (name: string) => string | null, onVercel: boolean): string {
  if (!onVercel) return "local";
  const real = get("x-real-ip")?.trim();
  if (real) return real;
  const vff = get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  return vff || "unknown";
}
