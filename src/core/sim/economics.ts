import type { InstrumentCategory, LabTwin, Transport } from "../twin/schema";
import type { Patch, Scenario } from "./scenarios";

export type Cost = { capex: number; annual: number };

/** Editable in the console. The defaults are round planning figures, not vendor quotes. */
export type Assumptions = { valuePerPlate: number; operatingHoursPerYear: number };

export const DEFAULT_ASSUMPTIONS: Assumptions = { valuePerPlate: 120, operatingHoursPerYear: 3000 };

const SERVICE_SHARE = 0.1;
const REPAIR_SHARE = 0.12;
const DOOR_WORKS = 18_000;
const NOTHING: Cost = { capex: 0, annual: 0 };

/** Purchase price by class, in EUR. Invented for planning: instrument prices are rarely published. */
const PRICE: Record<InstrumentCategory, number> = {
  "liquid-handler": 250_000,
  dispenser: 15_000,
  incubator: 80_000,
  "plate-reader": 90_000,
  imager: 450_000,
  centrifuge: 30_000,
  sealer: 20_000,
  peeler: 25_000,
  thermocycler: 20_000,
  storage: 100_000,
  washer: 20_000,
};

const TRANSPORT: Record<Transport["kind"], Cost> = {
  arm: { capex: 90_000, annual: 9_000 },
  amr: { capex: 45_000, annual: 4_500 },
  human: { capex: 0, annual: 70_000 },
};

const purchase = (price: number, units: number): Cost => ({ capex: price * units, annual: price * units * SERVICE_SHARE });

const costOfPatch = (twin: LabTwin, patch: Patch): Cost => {
  if (patch.op === "widen-door") return { capex: DOOR_WORKS, annual: 0 };
  if (patch.op === "scale-transport-speed") return NOTHING;
  const item = twin.instruments.find(({ id }) => id === patch.id);
  if (patch.op === "set-state") return item === undefined ? NOTHING : { capex: PRICE[item.category] * REPAIR_SHARE, annual: 0 };
  if (item !== undefined) return purchase(PRICE[item.category], patch.by);
  const transport = twin.transports.find(({ id }) => id === patch.id);
  if (transport === undefined) return NOTHING;
  const unit = TRANSPORT[transport.kind];
  return { capex: unit.capex * patch.by, annual: unit.annual * patch.by };
};

export const costOf = (twin: LabTwin, scenarios: readonly Scenario[]): Cost =>
  scenarios.flatMap((scenario) => scenario.patches).reduce<Cost>((sum, patch) => {
    const next = costOfPatch(twin, patch);
    return { capex: sum.capex + next.capex, annual: sum.annual + next.annual };
  }, NOTHING);

/** Years to recover the outlay, or null if the change never pays back. Assumes demand for every extra plate. */
export const paybackYears = (cost: Cost, gainPerHour: number, assumptions: Assumptions): number | null => {
  const benefit = gainPerHour * assumptions.operatingHoursPerYear * assumptions.valuePerPlate - cost.annual;
  if (benefit <= 0) return null;
  return cost.capex / benefit;
};
