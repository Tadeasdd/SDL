"use client";

import { useMemo } from "react";
import { costOf, paybackYears } from "@/core/sim/economics";
import { euros, years } from "./format";
import { useConsole } from "./store";

function Field({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={0} step={step} value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value)))} />
    </label>
  );
}

export function CostPanel() {
  const twin = useConsole((state) => state.agent.twin);
  const sim = useConsole((state) => state.sim);
  const assumptions = useConsole((state) => state.assumptions);
  const setAssumptions = useConsole((state) => state.setAssumptions);
  const applied = useMemo(() => (sim.comparison ? sim.scenarios : []), [sim.comparison, sim.scenarios]);
  const cost = useMemo(() => costOf(twin, applied), [twin, applied]);
  const gain = sim.comparison?.delta.mean ?? 0;
  const payback = paybackYears(cost, gain, assumptions);
  const extraPlates = gain * assumptions.operatingHoursPerYear;
  return (
    <div className="cost" data-testid="cost">
      <p className="sim-flag mono">Prices are round planning estimates, not quotes.</p>
      {applied.length === 0 ? <p className="empty">Tick one or more changes and run the simulation to cost them.</p> : (
        <>
          <dl className="stat-row">
            <div><dt className="label">One-off</dt><dd>{euros(cost.capex)}</dd></div>
            <div><dt className="label">Per year</dt><dd>{euros(cost.annual)}</dd></div>
            <div><dt className="label">Payback</dt><dd data-testid="payback">{payback === null ? "Never" : years(payback)}</dd></div>
          </dl>
          <p className="chart-note mono">About {Math.round(extraPlates).toLocaleString("en-GB")} extra plates a year, if demand exists for all of them.</p>
          <table className="data">
            <caption className="label">Changes</caption>
            <thead><tr><th scope="col">Change</th><th scope="col">One-off</th><th scope="col">Per year</th></tr></thead>
            <tbody>
              {applied.map((scenario) => {
                const item = costOf(twin, [scenario]);
                return <tr key={scenario.id}><th scope="row">{scenario.name}</th><td>{euros(item.capex)}</td><td>{euros(item.annual)}</td></tr>;
              })}
            </tbody>
          </table>
        </>
      )}
      <h3 className="group-head label">Assumptions</h3>
      <div className="fields">
        <Field label="Value of one extra plate (EUR)" value={assumptions.valuePerPlate} step={10} onChange={(valuePerPlate) => setAssumptions({ ...assumptions, valuePerPlate })} />
        <Field label="Operating hours per year" value={assumptions.operatingHoursPerYear} step={100} onChange={(operatingHoursPerYear) => setAssumptions({ ...assumptions, operatingHoursPerYear })} />
      </div>
    </div>
  );
}
