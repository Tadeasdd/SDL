"use client";

import { useEffect, useRef, useState } from "react";
import { entityCount } from "@/core/twin/mutations";
import type { FeedItem } from "./agent-state";
import { LiveDialog } from "./LiveDialog";
import { stopLive } from "./live-client";
import { useConsole } from "./store";

const TOOL_VERBS: Record<string, string> = {
  list_evidence: "index",
  read_evidence: "read",
  fit_durations: "fit",
  upsert_zone: "zone",
  upsert_door: "door",
  upsert_instrument: "instrument",
  upsert_transport: "transport",
  upsert_workflow: "workflow",
  record_finding: "finding",
  validate_twin: "validate",
  run_simulation: "simulate",
  finish_mapping: "finish",
};

function EvidencePanel() {
  const docs = useConsole((state) => state.docs);
  const read = useConsole((state) => state.agent.docsRead);
  const open = useConsole((state) => state.openEvidence);
  return (
    <section className="panel panel-left" aria-label="Evidence">
      <h2 className="panel-title"><span>Evidence</span><span>{read.length}/{docs.length} read</span></h2>
      <ol className="doc-list">
        {docs.map((doc) => (
          <li key={doc.id}>
            <button className="doc" onClick={() => open({ docId: doc.id })}>
              <i className={read.includes(doc.id) ? "tick is-done" : "tick"} aria-hidden />
              <span className="doc-title">{doc.title}</span>
              <span className="label">{doc.kind}</span>
              <span className="sr-only">{read.includes(doc.id) ? "read by the agent" : "not read yet"}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === "thought") return <li className="feed-thought">{item.text}</li>;
  return (
    <li className={`feed-tool is-${item.status}`}>
      <span className="feed-verb">{TOOL_VERBS[item.name] ?? item.name}</span>
      <span className="feed-label">{item.label}</span>
      {item.note ? <span className="feed-note">{item.note}</span> : null}
    </li>
  );
}

function Feed() {
  const feed = useConsole((state) => state.agent.feed);
  const status = useConsole((state) => state.agent.status);
  const summary = useConsole((state) => state.agent.summary);
  const error = useConsole((state) => state.agent.error);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [feed.length, summary]);

  return (
    <section className="panel panel-right" aria-label="Agent activity">
      <h2 className="panel-title"><span>Agent</span><span>{feed.filter((item) => item.kind === "tool").length} tool calls</span></h2>
      <ol className="feed" ref={list} aria-live="polite" aria-relevant="additions">
        {feed.map((item) => <FeedRow key={item.key} item={item} />)}
        {summary ? <li className="feed-summary">{summary}</li> : null}
        {status === "error" ? <li className="feed-error" role="alert">{error}</li> : null}
      </ol>
    </section>
  );
}

function Controls() {
  const [isLiveOpen, setLiveOpen] = useState(false);
  const twin = useConsole((state) => state.agent.twin);
  const status = useConsole((state) => state.agent.status);
  const source = useConsole((state) => state.source);
  const speed = useConsole((state) => state.speed);
  const { setSpeed, skipReplay, startReplay, setView } = useConsole.getState();
  const counts: [string, number][] = [
    ["Zones", twin.zones.length],
    ["Doors", twin.doors.length],
    ["Instruments", twin.instruments.length],
    ["Transports", twin.transports.length],
    ["Workflows", twin.workflows.length],
    ["Findings", twin.findings.length],
  ];
  const isRunning = status === "running";
  return (
    <section className="dock dock-map" aria-label="Mapping progress">
      <dl className="counts" data-testid="counts" data-entities={entityCount(twin)}>
        {counts.map(([label, value]) => (
          <div key={label}><dd>{String(value).padStart(2, "0")}</dd><dt className="label">{label}</dt></div>
        ))}
      </dl>
      <div className="dock-actions">
        {isRunning && source === "replay" ? (
          <>
            <button className="btn" onClick={() => setSpeed(speed === 1 ? 4 : 1)}>{speed}× speed</button>
            <button className="btn btn-solid" onClick={skipReplay}>Skip to twin</button>
          </>
        ) : null}
        {isRunning && source === "live" ? <button className="btn" onClick={stopLive}>Stop agent</button> : null}
        {!isRunning ? (
          <>
            <button className="btn" onClick={startReplay}>Replay example</button>
            <button className="btn" onClick={() => setLiveOpen(true)}>Map your lab</button>
            {status === "done" ? <button className="btn btn-solid" onClick={() => setView("twin")}>Open twin</button> : null}
          </>
        ) : null}
      </div>
      {isLiveOpen ? <LiveDialog onClose={() => setLiveOpen(false)} /> : null}
    </section>
  );
}

export function MapView() {
  return (
    <>
      <EvidencePanel />
      <Feed />
      <Controls />
    </>
  );
}
