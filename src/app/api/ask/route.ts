import Anthropic from "@anthropic-ai/sdk";
import { askClaude, AskRequestSchema } from "@/core/agent/ask";
import { createRateLimiter } from "@/core/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const ASKS_PER_WINDOW = 20;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const allow = createRateLimiter(ASKS_PER_WINDOW, WINDOW_MS);

const fail = (status: number, error: string): Response => Response.json({ success: false, data: null, error }, { status });

const hasKey = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

const clientAddress = (request: Request): string =>
  request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "local";

export function GET(): Response {
  return Response.json({ success: true, data: { available: hasKey() }, error: null });
}

export async function POST(request: Request): Promise<Response> {
  if (!hasKey()) return fail(503, "Not configured on this server.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return fail(413, "Request is too large.");
  if (!allow(clientAddress(request))) return fail(429, "Too many questions. Wait a few minutes.");
  const parsed = AskRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  try {
    const answer = await askClaude(new Anthropic().messages, parsed.data, process.env.SDL_AGENT_MODEL || undefined, request.signal);
    return Response.json({ success: true, data: { answer }, error: null });
  } catch (error) {
    console.error("Ask failed", error);
    return fail(502, "The model could not answer.");
  }
}
