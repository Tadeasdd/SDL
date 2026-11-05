"use client";

import { useEffect, useMemo, useRef } from "react";
import { indexAt, plateRecords, toCsv } from "@/core/sim/series";
import type { MonteCarloResult } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { saveFile } from "../download";
import { hours, minutes } from "../format";
import { usePlayback } from "../playback";

const percent = (share: number): string => `${Math.round(share * 100)}%`;

const toMinutes = (seconds: number): number => Number((seconds / 60).toFixed(1));

function ResourceTable({ result }: { result: MonteCarloResult }) {
  const run = result.representative;
  const rows = useMemo(() => [...run.resources].sort((a, b) => b.utilization - a.utilization), [run]);
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="label">Resources, representative run</caption>
        <thead><tr><th scope="col">Resource</th><th scope="col">Busy</th><th scope="col">Jobs</th><th scope="col">Queued</th><th scope="col">Fails</th></tr></thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} className={item.id === run.bottleneckId ? "is-limit" : ""}>
              <th scope="row">{item.id}</th>
              <td>{percent(item.utilization)}</td>
              <td>{item.jobs}</td>
              <td>{hours(item.waitS)}</td>
              <td>{item.failures}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlateTable({ twin, result }: { twin: LabTwin; result: MonteCarloResult }) {
  const body = useRef<HTMLTableSectionElement>(null);
  const records = useMemo(() => plateRecords(result.representative), [result]);
  const nameOf = (id: string): string => twin.workflows.find((item) => item.id === id)?.name ?? id;

  useEffect(() => {
    const ends = records.map((item) => item.endS);
    let shown = -1;
    const sync = (t: number): void => {
      const finished = ends.length === 0 || (ends[0] as number) > t ? 0 : indexAt({ t: ends }, t) + 1;
      if (finished === shown) return;
      shown = finished;
      Array.from(body.current?.rows ?? []).forEach((row, index) => row.classList.toggle("is-pending", index >= finished));
    };
    sync(usePlayback.getState().t);
    return usePlayback.subscribe(({ t }) => sync(t));
  }, [records]);

  const exportCsv = (): void => {
    const rows = records.map((item) => [item.plateId, nameOf(item.workflowId), toMinutes(item.startS), toMinutes(item.endS), toMinutes(item.cycleS), toMinutes(item.waitS), item.failures]);
    saveFile(`${twin.id}-plates.csv`, toCsv(["plate", "workflow", "started_min", "finished_min", "cycle_min", "queued_min", "failures"], rows), "text/csv");
  };

  return (
    <>
      <div className="table-head">
        <span className="label">Plates, in finishing order</span>
        <button className="btn btn-small" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="table-wrap table-scroll" tabIndex={0} aria-label="Plate results, scrollable">
        <table className="data" data-testid="plate-table">
          <thead><tr><th scope="col">Plate</th><th scope="col" className="data-text">Workflow</th><th scope="col">Finished</th><th scope="col">Cycle</th><th scope="col">Queued</th></tr></thead>
          <tbody ref={body}>
            {records.map((item) => (
              <tr key={item.plateId}>
                <th scope="row">{item.plateId}</th>
                <td className="data-text">{nameOf(item.workflowId)}</td>
                <td>{hours(item.endS)}</td>
                <td>{minutes(item.cycleS)}</td>
                <td>{minutes(item.waitS)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ResultTables({ twin, result }: { twin: LabTwin; result: MonteCarloResult }) {
  return (
    <div className="tables">
      <PlateTable twin={twin} result={result} />
      <ResourceTable result={result} />
    </div>
  );
}
