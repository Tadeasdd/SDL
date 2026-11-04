import type { AgentEvent } from "@/core/agent/events";
import { emptyTwin } from "@/core/twin/mutations";
import type { LabTwin } from "@/core/twin/schema";

export type FeedItem =
  | { kind: "thought"; key: number; text: string }
  | { kind: "tool"; key: number; id: string; name: string; label: string; status: "running" | "ok" | "error"; note?: string };

export type AgentView = {
  status: "idle" | "running" | "done" | "error";
  twin: LabTwin;
  feed: FeedItem[];
  docsRead: string[];
  touched: string | null;
  summary: string | null;
  error: string | null;
};

export const initialAgentView = (id: string, name: string): AgentView => ({
  status: "idle",
  twin: emptyTwin(id, name),
  feed: [],
  docsRead: [],
  touched: null,
  summary: null,
  error: null,
});

const settleTool = (feed: FeedItem[], id: string, isError: boolean, content: string): FeedItem[] =>
  feed.map((item) =>
    item.kind === "tool" && item.id === id
      ? { ...item, status: isError ? "error" : "ok", ...(isError ? { note: content } : {}) }
      : item,
  );

/** Pure reducer shared by replay and Live mode, so both drive the UI identically. */
export const reduceAgent = (view: AgentView, event: AgentEvent): AgentView => {
  const key = view.feed.length;
  switch (event.type) {
    case "thought":
      return { ...view, feed: [...view.feed, { kind: "thought", key, text: event.text }] };
    case "tool": {
      const { id, name, label } = event;
      const docsRead = name === "read_evidence" && !view.docsRead.includes(label) ? [...view.docsRead, label] : view.docsRead;
      return { ...view, docsRead, feed: [...view.feed, { kind: "tool", key, id, name, label, status: "running" }] };
    }
    case "result":
      return {
        ...view,
        twin: event.twin,
        touched: event.touched ?? view.touched,
        feed: settleTool(view.feed, event.id, event.isError, event.content),
      };
    case "done":
      return { ...view, status: "done", twin: event.twin, summary: event.summary, touched: null };
    case "error":
      return { ...view, status: "error", error: event.message };
  }
};
