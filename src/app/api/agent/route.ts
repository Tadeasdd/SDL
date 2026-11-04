import Anthropic from "@anthropic-ai/sdk";
import { createClaudeStreamer, DEFAULT_MODEL, runAgent } from "@/core/agent/claude";
import type { AgentEvent } from "@/core/agent/events";
import { LiveRequestSchema } from "@/core/agent/live-request";
import { createRateLimiter } from "@/core/rate-limit";
import { emptyTwin } from "@/core/twin/mutations";

export const runtime = "nodejs";
export const maxDuration = 300;

const RUNS_PER_WINDOW = 3;
const WINDOW_MS = 10 * 60 * 1000;
const allowRun = createRateLimiter(RUNS_PER_WINDOW, WINDOW_MS);

const fail = (status: number, error: string): Response =>
  Response.json({ success: false, data: null, error }, { status });

const hasKey = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

const clientAddress = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

const describeFailure = (error: unknown): string => {
  if (error instanceof Anthropic.AuthenticationError) return "The server's API key was rejected.";
  if (error instanceof Anthropic.RateLimitError) return "The model API is rate limiting this key. Try again shortly.";
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach the model API.";
  if (error instanceof Anthropic.APIError) return `The model API returned an error (${error.status ?? "unknown"}).`;
  return "The agent stopped unexpectedly.";
};

export function GET(): Response {
  return Response.json({ success: true, data: { available: hasKey() }, error: null });
}

export async function POST(request: Request): Promise<Response> {
  if (!hasKey()) return fail(503, "Live mode is not configured on this server.");
  if (!allowRun(clientAddress(request))) return fail(429, "Too many runs. Wait a few minutes and try again.");

  const body: unknown = await request.json().catch(() => null);
  const parsed = LiveRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");

  const { docs } = parsed.data;
  const model = process.env.SDL_AGENT_MODEL || DEFAULT_MODEL;
  const streamer = createClaudeStreamer(new Anthropic(), model);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        for await (const event of runAgent({ streamer, docs, twin: emptyTwin("live-lab", "Live mapping") })) {
          if (request.signal.aborted) break;
          send(event);
        }
      } catch (error) {
        console.error("Live agent run failed", error);
        send({ type: "error", message: describeFailure(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
