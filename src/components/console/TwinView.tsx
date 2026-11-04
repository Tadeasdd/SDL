"use client";

import { useMemo, useState } from "react";
import type { EvidenceRef, Finding, LabTwin, Provenance } from "@/core/twin/schema";
import { hasErrors, validateTwin } from "@/core/twin/validate";
import { useConsole } from "./store";

type Row = { id: string; name: string; status?: Provenance["status"]; state?: string };

const STATUS_LABEL: Record<Provenance["status"], string> = { confirmed: "Confirmed", inferred: "Inferred", conflict: "Conflict" };

function Group({ title, rows }: { title: string; rows: Row[] }) {
  const selectedId = useConsole((state) => state.selectedId);
  const select = useConsole((state) => state.select);
  if (rows.length === 0) return null;
  return (
    <li>
      <h3 className="tree-head label">{title}<span>{rows.length}</span></h3>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <button className={`tree-row${row.id === selectedId ? " is-selected" : ""}`} aria-pressed={row.id === selectedId} onClick={() => select(row.id)}>
              <span className="tree-id mono">{row.id}</span>
              <span className="tree-name">{row.name}</span>
              {row.state === "offline" ? <span className="flag flag-crit">Offline</span> : null}
              {row.state !== "offline" && row.status && row.status !== "confirmed" ? <span className="flag">{STATUS_LABEL[row.status]}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Tree({ twin }: { twin: LabTwin }) {
  const row = (entity: { id: string; name: string; provenance: Provenance; state?: string }): Row => ({
    id: entity.id,
    name: entity.name,
    status: entity.provenance.status,
    state: entity.state,
  });
  return (
    <section className="panel panel-left" aria-label="Twin entities">
      <h2 className="panel-title"><span>Entities</span></h2>
      <ul className="tree">
        <Group title="Instruments" rows={twin.instruments.map(row)} />
        <Group title="Transports" rows={twin.transports.map(row)} />
        <Group title="Workflows" rows={twin.workflows.map(row)} />
        <Group title="Zones" rows={twin.zones.map(row)} />
        <Group title="Doors" rows={twin.doors.map((door) => ({ id: door.id, name: `${door.widthMm} mm clear`, status: door.provenance.status }))} />
      </ul>
    </section>
  );
}

function Citation({ reference }: { reference: EvidenceRef }) {
  const open = useConsole((state) => state.openEvidence);
  return (
    <li>
      <button className="cite" onClick={() => open({ docId: reference.docId, quote: reference.quote })}>
        <span className="mono">{reference.docId} / {reference.locator}</span>
        {reference.quote ? <q>{reference.quote}</q> : null}
      </button>
    </li>
  );
}

function ProvenanceBlock({ provenance }: { provenance: Provenance }) {
  return (
    <div className="prov">
      <div className="prov-head">
        <span className={`flag flag-${provenance.status}`}>{STATUS_LABEL[provenance.status]}</span>
        <span className="mono">{Math.round(provenance.confidence * 100)}% confidence</span>
      </div>
      <div className="meter" aria-hidden><i style={{ width: `${provenance.confidence * 100}%` }} /></div>
      {provenance.note ? <p className="prov-note">{provenance.note}</p> : null}
      <ul className="cites">{provenance.evidence.map((reference, index) => <Citation key={index} reference={reference} />)}</ul>
    </div>
  );
}

const Spec = ({ rows }: { rows: [string, string | number][] }) => (
  <dl className="spec">
    {rows.map(([key, value]) => <div key={key}><dt className="label">{key}</dt><dd className="mono">{value}</dd></div>)}
  </dl>
);

type Described = { title: string; subtitle: string; rows: [string, string | number][]; provenance: Provenance; steps?: LabTwin["workflows"][number]["steps"] };

const describe = (twin: LabTwin, id: string): Described | null => {
  const instrument = twin.instruments.find((item) => item.id === id);
  if (instrument) {
    return {
      title: instrument.name,
      subtitle: `${instrument.id} · ${instrument.model}`,
      provenance: instrument.provenance,
      rows: [
        ["State", instrument.state],
        ["Capabilities", instrument.capabilities.join(", ")],
        ["Capacity", `${instrument.capacity} plates`],
        ["Interface", `${instrument.protocol}${instrument.address && instrument.address !== "none" ? ` ${instrument.address}` : ""}`],
        ["MTBF / MTTR", `${instrument.mtbfHours} h / ${instrument.mttrMinutes} min`],
        ["Position", `${instrument.x}, ${instrument.y} m`],
      ],
    };
  }
  const transport = twin.transports.find((item) => item.id === id);
  if (transport) {
    return {
      title: transport.name,
      subtitle: `${transport.id} · ${transport.kind}`,
      provenance: transport.provenance,
      rows: [
        ["Speed", `${transport.speedMps} m/s`],
        ["Hand-off", `${transport.handoffS} s`],
        ["Serves", transport.reach.length > 0 ? transport.reach.join(", ") : "Anywhere"],
        ...(transport.minDoorMm ? [["Min door", `${transport.minDoorMm} mm`] as [string, string]] : []),
      ],
    };
  }
  const zone = twin.zones.find((item) => item.id === id);
  if (zone) {
    return {
      title: zone.name,
      subtitle: `${zone.id} · ${zone.kind}`,
      provenance: zone.provenance,
      rows: [["Footprint", `${zone.bounds.w} × ${zone.bounds.h} m`], ["Instruments", twin.instruments.filter((item) => item.zoneId === id).length]],
    };
  }
  const door = twin.doors.find((item) => item.id === id);
  if (door) {
    return { title: `Door ${door.id}`, subtitle: `${door.zoneA} to ${door.zoneB}`, provenance: door.provenance, rows: [["Clear width", `${door.widthMm} mm`]] };
  }
  const workflow = twin.workflows.find((item) => item.id === id);
  if (workflow) {
    const totalS = workflow.steps.reduce((sum, step) => sum + step.duration.meanS, 0);
    return {
      title: workflow.name,
      subtitle: workflow.id,
      provenance: workflow.provenance,
      rows: [["Steps", workflow.steps.length], ["Touch time", `${(totalS / 60).toFixed(0)} min`]],
      steps: workflow.steps,
    };
  }
  return null;
};

function FindingCard({ finding }: { finding: Finding }) {
  const select = useConsole((state) => state.select);
  return (
    <li className={`finding is-${finding.severity}`}>
      <div className="finding-head"><span className={`flag flag-${finding.severity}`}>{finding.severity}</span><span className="label">{finding.kind}</span></div>
      <h3>{finding.title}</h3>
      <p>{finding.detail}</p>
      {finding.resolution ? <p className="finding-res">{finding.resolution}</p> : null}
      <ul className="cites">{finding.evidence.map((reference, index) => <Citation key={index} reference={reference} />)}</ul>
      <div className="chips">
        {finding.entityIds.map((id) => <button key={id} className="link mono" onClick={() => select(id)}>{id}</button>)}
      </div>
    </li>
  );
}

function Inspector({ twin }: { twin: LabTwin }) {
  const selectedId = useConsole((state) => state.selectedId);
  const entity = selectedId === null ? null : describe(twin, selectedId);
  const related = twin.findings.filter((finding) => selectedId !== null && finding.entityIds.includes(selectedId));
  if (entity === null) {
    return <p className="empty">Select an entity to see where every value came from.</p>;
  }
  return (
    <div className="inspector" data-testid="inspector">
      <h3 className="inspector-title wide">{entity.title}</h3>
      <p className="mono inspector-sub">{entity.subtitle}</p>
      <Spec rows={entity.rows} />
      {entity.steps ? (
        <ol className="steps">
          {entity.steps.map((step) => (
            <li key={step.id}>
              <span>{step.name}</span>
              <span className="mono">{step.duration.meanS.toFixed(0)} ± {step.duration.sdS.toFixed(0)} s</span>
              <span className="label">n={step.duration.samples}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <ProvenanceBlock provenance={entity.provenance} />
      {related.length > 0 ? <ul className="findings">{related.map((finding) => <FindingCard key={finding.id} finding={finding} />)}</ul> : null}
    </div>
  );
}

function Health({ twin }: { twin: LabTwin }) {
  const issues = useMemo(() => validateTwin(twin), [twin]);
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return (
    <p className="health mono">
      <i className={hasErrors(issues) ? "dot dot-crit" : "dot dot-good"} />
      {hasErrors(issues) ? `${issues.length - warnings} blocking issues` : "Simulation ready"} · {warnings} warnings
    </p>
  );
}

export function TwinView() {
  const twin = useConsole((state) => state.agent.twin);
  const [tab, setTab] = useState<"inspect" | "findings">("inspect");
  return (
    <>
      <Tree twin={twin} />
      <section className="panel panel-right" aria-label="Inspector">
        <div className="seg seg-wide" role="tablist" aria-label="Inspector content">
          <button role="tab" aria-selected={tab === "inspect"} className={tab === "inspect" ? "is-on" : ""} onClick={() => setTab("inspect")}>Inspector</button>
          <button role="tab" aria-selected={tab === "findings"} className={tab === "findings" ? "is-on" : ""} onClick={() => setTab("findings")}>Findings {twin.findings.length}</button>
        </div>
        <div className="panel-scroll">
          {tab === "inspect" ? <Inspector twin={twin} /> : <ul className="findings">{twin.findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)}</ul>}
        </div>
        <Health twin={twin} />
      </section>
    </>
  );
}
