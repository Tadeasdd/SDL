"use client";

import type { EvidenceDoc } from "@/core/agent/evidence";
import type { AgentEvent } from "@/core/agent/events";

let controller: AbortController | null = null;

export const stopLive = (): void => controller?.abort();

export const isLiveAvailable = async (): Promise<boolean> => {
  const response = await fetch("/api/agent");
  if (!response.ok) return false;
  const body = (await response.json()) as { data?: { available?: boolean } };
  return body.data?.available === true;
};

const parseLines = (text: string, receive: (event: AgentEvent) => void): void => {
  for (const line of text.split("\n")) {
    if (line.trim() !== "") receive(JSON.parse(line) as AgentEvent);
  }
};

/** Streams newline-delimited agent events from the server into `receive`. */
export const runLive = async (docs: EvidenceDoc[], receive: (event: AgentEvent) => void): Promise<void> => {
  controller = new AbortController();
  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ docs }),
      signal: controller.signal,
    });
    if (!response.ok || response.body === null) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      receive({ type: "error", message: body?.error ?? `Request failed (${response.status}).` });
      return;
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const end = buffer.lastIndexOf("\n");
      if (end >= 0) {
        parseLines(buffer.slice(0, end), receive);
        buffer = buffer.slice(end + 1);
      }
    }
  } catch (error) {
    const stopped = error instanceof DOMException && error.name === "AbortError";
    receive({ type: "error", message: stopped ? "Stopped by operator." : "Lost the connection to the agent." });
  }
};
