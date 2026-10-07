/**
 * Tiny in-memory rate limiter for public endpoints (slot lookup, signup, invites...).
 * Per server instance only: good enough to blunt abuse in the MVP. On Vercel each
 * lambda keeps its own counters, so for strict limits swap this for a shared store
 * (e.g. Upstash Redis) behind the same function signature.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup so the map cannot grow forever
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > windowMs) hits.delete(k);
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
