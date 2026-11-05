"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { assaySummary } from "@/core/sim/assay";
import { costOf, paybackYears } from "@/core/sim/economics";
import { answerLocally, factsOf, type AskContext } from "@/core/sim/explain";
import { applyPatches } from "@/core/sim/scenarios";
import type { MonteCarloResult } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { useConsole } from "./store";

type Turn = { id: number; question: string; answer: string; basis: string[]; source: "run data" | "Claude" };

const SUGGESTIONS = ["Why did the queue build up at hour 3?", "What is the bottleneck?", "How is assay quality?"];

const askModel = async (question: string, facts: Record<string, unknown>, signal: AbortSignal): Promise<string | null> => {
  try {
    const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, facts }), signal });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { answer?: string } };
    return body.data?.answer ?? null;
  } catch {
    return null;
  }
};

export function AskPanel({ twin, current }: { twin: LabTwin; current: MonteCarloResult }) {
  const sim = useConsole((state) => state.sim);
  const assumptions = useConsole((state) => state.assumptions);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [hasModel, setHasModel] = useState(false);
  const aborter = useRef<AbortController | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    let isMounted = true;
    void fetch("/api/ask").then((response) => response.json() as Promise<{ data?: { available?: boolean } }>)
      .then((body) => { if (isMounted) setHasModel(body.data?.available === true); })
      .catch(() => undefined);
    return () => {
      isMounted = false;
      aborter.current?.abort();
    };
  }, []);

  const context = useMemo((): AskContext => {
    const applied = sim.comparison ? sim.scenarios : [];
    const shown = applyPatches(twin, applied.flatMap((item) => item.patches));
    const cost = costOf(twin, applied);
    return {
      twin: shown,
      current,
      assay: assaySummary(shown, current.representative, sim.config.seed),
      capex: applied.length > 0 ? cost.capex : null,
      paybackYears: sim.comparison ? paybackYears(cost, sim.comparison.delta.mean, assumptions) : null,
    };
  }, [twin, current, sim, assumptions]);

  const ask = async (question: string): Promise<void> => {
    const text = question.trim();
    if (text.length === 0 || isBusy) return;
    setDraft("");
    const local = answerLocally(text, context);
    nextId.current += 1;
    const id = nextId.current;
    if (!hasModel) {
      setTurns((list) => [...list, { id, question: text, answer: local.text, basis: local.basis, source: "run data" }]);
      return;
    }
    setIsBusy(true);
    aborter.current = new AbortController();
    const answer = await askModel(text, factsOf(context), aborter.current.signal);
    setIsBusy(false);
    setTurns((list) => [...list, answer === null ? { id, question: text, answer: local.text, basis: local.basis, source: "run data" } : { id, question: text, answer, basis: ["Run facts sent to Claude"], source: "Claude" }]);
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void ask(draft);
  };

  return (
    <div className="ask" data-testid="ask">
      <p className="sim-flag mono">{hasModel ? "Answered by Claude from this run's data." : "Answered directly from this run's data. No model is involved."}</p>
      <ol className="ask-turns" aria-live="polite">
        {turns.map((turn) => (
          <li key={turn.id}>
            <p className="ask-q">{turn.question}</p>
            <p className="ask-a">{turn.answer}</p>
            {turn.basis.length > 0 ? <p className="chart-note mono">From {turn.source}: {turn.basis.join(", ")}</p> : null}
          </li>
        ))}
      </ol>
      {turns.length === 0 ? (
        <ul className="ask-suggest">
          {SUGGESTIONS.map((item) => <li key={item}><button className="btn btn-small" onClick={() => void ask(item)}>{item}</button></li>)}
        </ul>
      ) : null}
      <form className="ask-form" onSubmit={onSubmit}>
        <input aria-label="Ask about this run" value={draft} maxLength={500} placeholder="Ask about this run" onChange={(event) => setDraft(event.target.value)} />
        <button className="btn btn-solid" disabled={isBusy}>{isBusy ? "Asking" : "Ask"}</button>
      </form>
    </div>
  );
}
