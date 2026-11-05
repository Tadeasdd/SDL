import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DEFAULT_MODEL } from "./claude";

export const AskRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  facts: z.record(z.string(), z.unknown()),
});

export type AskRequest = z.infer<typeof AskRequestSchema>;

const MAX_OUTPUT_TOKENS = 2000;

const SYSTEM_PROMPT = `You answer questions about one simulated run of a laboratory digital twin.
Use only the JSON facts supplied with each question. They are simulation output, not measurements.
If the facts do not settle the question, say what is missing. Never invent a figure.
Answer in plain language in at most four sentences, naming the figures you relied on.
Assay readouts in the facts are synthetic. Say so whenever you use them.`;

type Client = Pick<Anthropic["messages"], "create">;

export const askClaude = async (client: Client, { question, facts }: AskRequest, model = DEFAULT_MODEL, signal?: AbortSignal): Promise<string> => {
  const message = await client.create(
    {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `<facts>\n${JSON.stringify(facts)}\n</facts>\n\nQuestion: ${question}` }],
    },
    { signal },
  );
  if (message.stop_reason === "refusal") throw new Error("The model declined to answer.");
  const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n").trim();
  if (text.length === 0) throw new Error("The model returned no answer.");
  return text;
};
