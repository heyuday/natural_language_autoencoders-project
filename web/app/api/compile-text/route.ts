import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EXEMPLARS } from "@/lib/exemplars";
import { limit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const PairSchema = z.object({
  concept_label: z
    .string()
    .describe("A two-to-four word name for the behaviour, in title case."),
  pos_text: z
    .string()
    .describe("Verbalizer-register description of a passage that SHOWS the behaviour."),
  neg_text: z
    .string()
    .describe(
      "Verbalizer-register description of a passage in the SAME situation that shows the opposite behaviour.",
    ),
});

const SYSTEM = `You write training-shaped text for a Natural Language Autoencoder's Activation Reconstructor.

The Reconstructor maps a description of a passage to the residual-stream activation that reading such a passage would produce. It was trained on Activation Verbalizer output, which has a specific register. Text in that register compiles to a usable vector; a plain instruction does not. Measured against reference vectors built from labelled activations, register-shaped text scores +0.406 cosine and a paraphrased instruction scores +0.080. The register is the job.

Given a user's plain-English description of how a model should behave, write TWO descriptions.

THE REGISTER — each text is three short paragraphs of plain prose:
1. A genre or voice label, then what kind of passage this is. Third person, describing a passage — never an instruction, never second person, never addressed to a model.
2. What the passage is doing, with three or four short quoted fragments taken from it.
3. Two to four more quoted fragments, then an explicit guess at what token comes next, phrased like: The final word "X" likely " ..." or " ...".

HARD REQUIREMENTS:
- The two texts must describe the SAME situation and differ ONLY in the behaviour. A gushing reply and a blunt corrective reply to the same question — not a trait and its negation, and not two different topics. Both texts then sit in the same background region, so subtracting them cancels it and leaves the behaviour.
- Quoted fragments carry most of the signal. Ablating them costs 53% of the alignment. Pack each text with concrete, behaviour-saturated quotes. Do not write abstract description without quotes.
- The final-token guess carries 41%. Never omit it.
- Never write an instruction. "Be sycophantic" is the failure mode. Write "Effusive validation pattern: an assistant reply that agrees enthusiastically with a user's mistaken claim instead of correcting it."
- No markdown, no headings, no bullet points, no second person. Plain prose paragraphs separated by blank lines.
- Roughly 90 to 150 words per text.

The behaviour the user describes goes in pos_text. Its natural opposite, in the same situation, goes in neg_text.`;

function userTurn(request: string) {
  return `Behaviour to describe: ${request}`;
}

export async function POST(req: Request) {
  const gate = await limit(req, "write");
  if (!gate.ok) return tooMany(gate.retryAfter);

  let request = "";
  try {
    request = String(((await req.json()) as { request?: string }).request ?? "").trim();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!request) return Response.json({ error: "request is required" }, { status: 400 });
  if (request.length > 300) {
    return Response.json({ error: "request must be under 300 characters" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "server is missing ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const client = new Anthropic();

  // Few-shot with the exact texts the notebooks compile, so the register the
  // model imitates is the one that actually measured +0.406.
  const messages: Anthropic.MessageParam[] = [];
  for (const ex of EXEMPLARS) {
    messages.push({ role: "user", content: userTurn(ex.request) });
    messages.push({
      role: "assistant",
      content: JSON.stringify({
        concept_label: ex.request.split(" ").slice(0, 3).join(" "),
        pos_text: ex.pos_text,
        neg_text: ex.neg_text,
      }),
    });
  }
  messages.push({ role: "user", content: userTurn(request) });

  try {
    const response = await client.messages.parse({
      model: process.env.COMPILE_MODEL ?? "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(PairSchema),
      },
      messages,
    });

    if (response.stop_reason === "refusal") {
      return Response.json(
        { error: "The writing model declined this request. Try describing a different behaviour." },
        { status: 422 },
      );
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      return Response.json({ error: "could not parse a text pair" }, { status: 502 });
    }
    return Response.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("compile-text failed:", message);
    return Response.json({ error: `writing the pair failed: ${message}` }, { status: 502 });
  }
}
