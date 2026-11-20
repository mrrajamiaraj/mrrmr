import "server-only";
import { headers } from "next/headers";
import {
  LIMITS, MemoryLimiter, UpstashLimiter, emailKey, hashKey, trustedClientIp, upstashConfig,
  type LimitName, type Limiter,
} from "@/lib/rate-limit-core";
import { logSecurityEvent } from "@/lib/security-log";

export { emailKey } from "@/lib/rate-limit-core";

// Global limits shared by every serverless instance when UPSTASH_REDIS_REST_URL/TOKEN are set (server-only env);
// otherwise the per-instance memory limiter, with one warning, so sign-in never breaks for lack of Redis.

const limiters = new Map<LimitName, Limiter>();
let warned = false;

export function limiter(name: LimitName): Limiter {
  let l = limiters.get(name);
  if (l) return l;
  const { limit, windowMs } = LIMITS[name];
  const memory = new MemoryLimiter(limit, windowMs);
  const cfg = upstashConfig(process.env);
  if (!cfg && !warned) {
    warned = true;
    console.warn(JSON.stringify({ event: "rate_limit_fallback", reason: "upstash-not-configured" }));
  }
  l = cfg
    ? new UpstashLimiter(cfg, name, limit, windowMs, memory, fetch, Date.now,
        (n) => console.warn(JSON.stringify({ event: "rate_limit_fallback", reason: "upstash-error", limiter: n })))
    : memory;
  limiters.set(name, l);
  return l;
}

/** The caller's IP from headers Vercel sets (never a client-supplied x-forwarded-for). */
export async function requestIp(): Promise<string> {
  const h = await headers();
  return trustedClientIp((n) => h.get(n), process.env.VERCEL === "1");
}

/** Hashed IP: the form used for rate-limit keys and security logs. */
export const ipKey = (ip: string) => hashKey(`ip:${ip}`);

/** Checks several limits; returns the longest wait (0 = allowed). Every limit is counted; each refusal is logged. */
export async function hitAll(checks: [LimitName, string][], ip?: string): Promise<number> {
  const waits = await Promise.all(checks.map(([n, k]) => limiter(n).hit(k)));
  waits.forEach((w, i) => { if (w) logSecurityEvent("rate_limit_hit", { limiter: checks[i][0], ip }); });
  return Math.max(0, ...waits);
}
