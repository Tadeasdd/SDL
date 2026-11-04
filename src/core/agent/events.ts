import type { LabTwin } from "../twin/schema";

export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "tool"; id: string; name: string; label: string }
  | { type: "result"; id: string; name: string; isError: boolean; content: string; twin: LabTwin; touched: string | null }
  | { type: "done"; summary: string; twin: LabTwin }
  | { type: "error"; message: string };
