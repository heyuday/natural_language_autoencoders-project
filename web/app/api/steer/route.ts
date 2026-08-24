import { limit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Server-side proxy to the Modal GPU endpoints.
 *
 * The demo key never reaches the browser, so the Modal URLs cannot be called
 * directly from client JS to bypass the rate limit above. Both actions go
 * through here; ?action=steer streams the response body straight back.
 */

const COLD_START_MS = 240_000;

function missingConfig() {
  return Response.json(
    { error: "The GPU backend is not configured. The gallery below is fully browsable." },
    { status: 503 },
  );
}

async function forward(url: string, body: unknown, stream: boolean) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COLD_START_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-demo-key": process.env.DEMO_KEY ?? "",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      let message = `GPU backend returned ${res.status}`;
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.detail) message = String(parsed.detail);
      } catch {
        /* not JSON */
      }
      return Response.json({ error: message }, { status: res.status === 401 ? 500 : 502 });
    }

    if (!stream) {
      return Response.json(await res.json());
    }
    return new Response(res.body, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return Response.json(
      {
        error: aborted
          ? "The GPU did not respond in time. It may still be starting up — try once more."
          : "Could not reach the GPU backend. The gallery below is fully browsable.",
      },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  const action = new URL(req.url).searchParams.get("action");
  if (action !== "compile" && action !== "steer") {
    return Response.json({ error: "action must be compile or steer" }, { status: 400 });
  }

  const gate = await limit(req, "gpu");
  if (!gate.ok) return tooMany(gate.retryAfter);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (action === "compile") {
    const url = process.env.MODAL_COMPILE_URL;
    if (!url) return missingConfig();
    const pos = String(body.pos_text ?? "");
    const neg = String(body.neg_text ?? "");
    if (!pos || !neg) {
      return Response.json({ error: "pos_text and neg_text are required" }, { status: 400 });
    }
    if (pos.length > 4000 || neg.length > 4000) {
      return Response.json({ error: "texts must be under 4000 characters" }, { status: 400 });
    }
    return forward(url, { pos_text: pos, neg_text: neg }, false);
  }

  const url = process.env.MODAL_STEER_URL;
  if (!url) return missingConfig();

  const vectorId = String(body.vector_id ?? "");
  const prompt = String(body.prompt ?? "").trim();
  const alpha = Number(body.alpha ?? 0.75);
  const maxNewTokens = Number(body.max_new_tokens ?? 150);

  if (!/^[a-f0-9]{8,64}$/.test(vectorId)) {
    return Response.json({ error: "bad vector_id" }, { status: 400 });
  }
  if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });
  if (prompt.length > 500) {
    return Response.json({ error: "prompt must be under 500 characters" }, { status: 400 });
  }
  if (!Number.isFinite(alpha)) {
    return Response.json({ error: "alpha must be a number" }, { status: 400 });
  }

  return forward(
    url,
    {
      vector_id: vectorId,
      prompt,
      alpha: Math.max(-1.5, Math.min(1.5, alpha)),
      max_new_tokens: Math.max(16, Math.min(150, Math.round(maxNewTokens) || 150)),
    },
    true,
  );
}
