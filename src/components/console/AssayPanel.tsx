"use client";

import { useEffect, useMemo, useState } from "react";
import { assaySummary, COLUMNS, plateData, ROWS, UNSEALED_LIMIT_MIN, type AssayPlate, type AssaySummary } from "@/core/sim/assay";
import { indexAt } from "@/core/sim/series";
import type { SimResult } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { SvgChart } from "./charts/Svg";
import { usePlayback } from "./playback";

const CELL = 14;
const DOSE_MIN_UM = 0.001;
const DOSE_MAX_UM = 100;
const SIGNAL_MAX = 110_000;

const logScale = (value: number, left: number, right: number): number =>
  left + ((Math.log10(value) - Math.log10(DOSE_MIN_UM)) / (Math.log10(DOSE_MAX_UM) - Math.log10(DOSE_MIN_UM))) * (right - left);

const DOSE_TICKS = [0.001, 0.01, 0.1, 1, 10, 100].map((value) => ({ value, label: String(value) }));

/** One hue, dark to light, so brighter always means more signal. */
const heat = (signal: number): string => `hsl(78 68% ${8 + Math.min(1, signal / SIGNAL_MAX) * 58}%)`;

function Heatmap({ wells, title }: { wells: number[]; title: string }) {
  return (
    <svg className="heatmap" viewBox={`0 0 ${COLUMNS * CELL} ${ROWS * CELL}`} role="img" aria-label={title}>
      {wells.map((signal, index) => {
        const row = Math.floor(index / COLUMNS);
        const column = index % COLUMNS;
        return (
          <rect key={index} x={column * CELL + 1} y={row * CELL + 1} width={CELL - 2} height={CELL - 2} rx={2} fill={heat(signal)}>
            <title>{`${String.fromCharCode(65 + row)}${column + 1}: ${Math.round(signal).toLocaleString("en-GB")} RLU`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function DoseCurve({ curve, ic50 }: { curve: { doseUm: number; viability: number }[]; ic50: number | null }) {
  const points = [...curve].sort((a, b) => a.doseUm - b.doseUm);
  return (
    <SvgChart width={360} height={170} xMax={DOSE_MAX_UM} yMax={120} xLabel="Dose (µM, log scale)" yLabel="Viability (%)" title="Dose-response curve of the reference compound" xAxis={{ scale: logScale, ticks: DOSE_TICKS }}>
      {({ x, y }) => (
        <>
          <polyline className="series-line" points={points.map((item) => `${x(item.doseUm)},${y(Math.max(0, item.viability))}`).join(" ")} />
          {points.map((item) => <circle key={item.doseUm} className="series-dot" cx={x(item.doseUm)} cy={y(Math.max(0, item.viability))} r={4} />)}
          {ic50 === null ? null : <line className="marker-line" x1={x(ic50)} x2={x(ic50)} y1={y(0)} y2={y(50)} />}
        </>
      )}
    </SvgChart>
  );
}

const usePlateAtPlayhead = (summary: AssaySummary): AssayPlate | null => {
  const ends = useMemo(() => summary.plates.map((plate) => plate.readEndS), [summary]);
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    const sync = (t: number): void => setIndex(ends.length === 0 || (ends[0] as number) > t ? -1 : indexAt({ t: ends }, t));
    sync(usePlayback.getState().t);
    return usePlayback.subscribe(({ t }) => sync(t));
  }, [ends]);
  return summary.plates[index] ?? null;
};

function PlateView({ plate, seed }: { plate: AssayPlate; seed: number }) {
  const data = useMemo(() => plateData(plate.plateId, plate.delayMin, seed), [plate, seed]);
  return (
    <>
      <div className="assay-plate-head mono">
        <span>Plate {plate.plateId}</span>
        <span>{Math.round(plate.delayMin)} min unsealed</span>
        <span>Z′ {plate.zPrime.toFixed(2)}</span>
        <span className={`flag ${plate.passes ? "flag-good" : "flag-crit"}`}>{plate.passes ? "Pass" : "Fail"}</span>
      </div>
      <Heatmap wells={data.wells} title={`Simulated 384-well signal for plate ${plate.plateId}`} />
      <p className="chart-note mono">Darker is less signal. Left columns are untreated controls, right columns are kill controls.</p>
      <h3 className="group-head label">Reference compound</h3>
      <DoseCurve curve={data.curve} ic50={data.ic50Um} />
      <p className="chart-note mono">{data.ic50Um === null ? "IC50 not found on this plate" : `IC50 ${data.ic50Um.toFixed(2)} µM, true value 1 µM`}</p>
    </>
  );
}

export function AssayPanel({ twin, run, seed }: { twin: LabTwin; run: SimResult; seed: number }) {
  const summary = useMemo(() => assaySummary(twin, run, seed), [twin, run, seed]);
  if (summary === null) return <p className="empty">This lab has no screening workflow to model.</p>;
  return <Assay summary={summary} seed={seed} />;
}

function Assay({ summary, seed }: { summary: AssaySummary; seed: number }) {
  const [isWorst, setIsWorst] = useState(false);
  const live = usePlateAtPlayhead(summary);
  const worst = useMemo(() => [...summary.plates].sort((a, b) => a.zPrime - b.zPrime)[0] ?? null, [summary]);
  const plate = isWorst ? worst : live;
  return (
    <div className="assay" data-testid="assay">
      <p className="sim-flag mono">Simulated data. No plate was read. Sensitivity to waiting is an assumption.</p>
      <dl className="stat-row">
        <div><dt className="label">Pass Z′ 0.5</dt><dd>{Math.round(summary.passShare * 100)}%</dd></div>
        <div><dt className="label">Over {UNSEALED_LIMIT_MIN} min</dt><dd>{Math.round(summary.overLimitShare * 100)}%</dd></div>
        <div><dt className="label">Mean wait</dt><dd>{Math.round(summary.meanDelayMin)} min</dd></div>
      </dl>
      <div className="seg seg-tabs" role="group" aria-label="Plate shown">
        <button className={!isWorst ? "is-on" : ""} aria-pressed={!isWorst} onClick={() => setIsWorst(false)}>Latest read</button>
        <button className={isWorst ? "is-on" : ""} aria-pressed={isWorst} onClick={() => setIsWorst(true)}>Worst plate</button>
      </div>
      {plate === null ? <p className="empty">No plate has been read yet.</p> : <PlateView plate={plate} seed={seed} />}
    </div>
  );
}
