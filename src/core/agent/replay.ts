import { emptyTwin } from "../twin/mutations";
import type { LabTwin } from "../twin/schema";
import type { DurationFit, EvidenceDoc } from "./evidence";
import type { AgentEvent } from "./events";
import { REPLAY_SCRIPT, type Fits, type ReplayStep } from "./replay-script";
import { executeTool, toolLabel, type AgentState } from "./tools";

export const EXAMPLE_LAB = { id: "aldermoor-bay-4", name: "Aldermoor Institute · Bay 4" };

const resolveInput = (step: ReplayStep, fits: Fits): unknown =>
  typeof step.input === "function" ? (step.input as (value: Fits) => unknown)(fits) : step.input;

/** Runs the authored decisions through the real tools. Any tool error here is a bug, so it surfaces. */
export const replayEvents = (docs: readonly EvidenceDoc[], script: readonly ReplayStep[] = REPLAY_SCRIPT): AgentEvent[] => {
  let state: AgentState = { twin: emptyTwin(EXAMPLE_LAB.id, EXAMPLE_LAB.name), docs, finishedSummary: null };
  let fits: Fits = {};
  const events: AgentEvent[] = [];

  script.forEach((step, index) => {
    if (step.thought !== undefined) events.push({ type: "thought", text: step.thought });
    const input = resolveInput(step, fits);
    const id = `replay-${index}`;
    events.push({ type: "tool", id, name: step.tool, label: toolLabel(step.tool, input) });
    const outcome = executeTool(state, step.tool, input);
    state = outcome.state;
    if (step.tool === "fit_durations" && !outcome.isError) {
      const fit = JSON.parse(outcome.content) as DurationFit;
      fits = { ...fits, [fit.step]: fit };
    }
    events.push({
      type: "result",
      id,
      name: step.tool,
      isError: outcome.isError,
      content: outcome.content,
      twin: state.twin,
      touched: outcome.touched,
    });
  });

  events.push(
    state.finishedSummary === null
      ? { type: "error", message: "Replay ended before finish_mapping." }
      : { type: "done", summary: state.finishedSummary, twin: state.twin },
  );
  return events;
};

export const twinFromEvents = (events: readonly AgentEvent[]): LabTwin | null => {
  const last = events.at(-1);
  return last?.type === "done" ? last.twin : null;
};
