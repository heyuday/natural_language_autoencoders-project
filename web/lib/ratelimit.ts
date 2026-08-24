import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Vercel functions are stateless, so the limit lives in Upstash. If the
 * credentials are absent (local dev) limiting is skipped rather than failing —
 * but the Modal endpoints still require the shared secret, so an unlimited
 * local dev server cannot be pointed at production GPUs by a third party.
 */
const configured =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = configured ? Redis.fromEnv() : null;

function make(tokens: number, window: `${number} ${"s" | "m" | "h"}`, prefix: string) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix,
    analytics: false,
  });
}

// Writing a pair is cheap; occupying the GPU is not.
const writeLimit = make(10, "10 m", "nla:write");
const gpuLimit = make(20, "10 m", "nla:gpu");

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function limit(
  req: Request,
  kind: "write" | "gpu",
): Promise<{ ok: boolean; retryAfter?: number }> {
  const rl = kind === "write" ? writeLimit : gpuLimit;
  if (!rl) return { ok: true };
  const { success, reset } = await rl.limit(clientIp(req));
  if (success) return { ok: true };
  return { ok: false, retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
}

export function tooMany(retryAfter?: number) {
  return new Response(
    JSON.stringify({
      error: "Rate limit reached. This demo runs on a single rented GPU — try again shortly.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    },
  );
}
