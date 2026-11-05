import type { LabTwin } from "../twin/schema";
import { costOf, paybackYears, type Assumptions, type Cost } from "./economics";
import { monteCarlo } from "./montecarlo";
import { applyPatches, candidateInterventions, type Scenario } from "./scenarios";
import type { Range, SimConfig } from "./types";

export type Goal = { targetPerHour: number; budget: number | null; maxChanges: number };

export type Plan = {
  scenarios: Scenario[];
  cost: Cost;
  throughput: Range;
  bottleneckId: string | null;
  /** The 5th percentile clears the target, so it is met in about 95% of runs, not just on average. */
  meetsTarget: boolean;
  paybackYears: number | null;
};

export type SearchProgress = { evaluated: number; best: Plan | null };

export type SearchResult = {
  baseline: Plan;
  best: Plan | null;
  /** Nothing else is both cheaper and faster than these. Sorted by cost. */
  frontier: Plan[];
  evaluated: number;
  /** Plates per hour the demand settings release. No plan can beat this. */
  demandCeiling: number;
};

type Options = { runs?: number; beam?: number; branch?: number };

const SECONDS_PER_HOUR = 3600;
const CONFIRM_RUNS = 32;
const MAX_CONFIRMATIONS = 12;
const keyOf = (scenarios: readonly Scenario[]): string => scenarios.map(({ id }) => id).sort().join("+");

export const demandCeiling = (config: SimConfig): number =>
  config.demands.reduce((sum, { plates, intervalS }) => sum + (plates > 0 && intervalS > 0 ? SECONDS_PER_HOUR / intervalS : 0), 0);

/** Cheapest first. A plan survives only if it is faster than everything cheaper. */
export const paretoFrontier = (plans: readonly Plan[]): Plan[] => {
  const byCost = [...plans].sort((a, b) => a.cost.capex - b.cost.capex || b.throughput.mean - a.throughput.mean);
  const kept: Plan[] = [];
  for (const plan of byCost) {
    if (plan.throughput.mean > (kept.at(-1)?.throughput.mean ?? Number.NEGATIVE_INFINITY)) kept.push(plan);
  }
  return kept;
};

/** Candidates worth trying from this state: owned fixes always, purchases only at the busiest stations. */
const shortlist = (twin: LabTwin, config: SimConfig, branch: number): Scenario[] => {
  const run = monteCarlo(twin, config, 1).representative;
  const busy = new Map(run.resources.map((item) => [item.id, item.waitS + item.utilization]));
  const candidates = candidateInterventions(twin);
  const purchases = candidates
    .filter((item) => item.patches.some((patch) => patch.op === "add-capacity"))
    .sort((a, b) => (busy.get(b.patches[0]?.id ?? "") ?? 0) - (busy.get(a.patches[0]?.id ?? "") ?? 0))
    .slice(0, branch);
  return [...candidates.filter((item) => !purchases.includes(item) && item.patches.every((patch) => patch.op !== "add-capacity")), ...purchases];
};

/**
 * Beam search over combinations of changes, simulating each one. A generator, so the console can yield to
 * the browser between evaluations instead of freezing it. Plans that already hit the target are not extended:
 * every further change only adds cost.
 */
export function* searchPlans(twin: LabTwin, config: SimConfig, goal: Goal, assumptions: Assumptions, options: Options = {}): Generator<SearchProgress, SearchResult> {
  const { runs = 12, beam = 4, branch = 5 } = options;
  const evaluate = (scenarios: Scenario[], baseMean: number, sampleRuns = runs): Plan | null => {
    try {
      const patched = applyPatches(twin, scenarios.flatMap((item) => item.patches));
      const result = monteCarlo(patched, config, sampleRuns);
      const cost = costOf(twin, scenarios);
      const ranked = Object.entries(result.bottleneckShare).sort((a, b) => b[1] - a[1]);
      return {
        scenarios,
        cost,
        throughput: result.throughputPerHour,
        bottleneckId: ranked[0]?.[0] ?? null,
        meetsTarget: result.throughputPerHour.p5 >= goal.targetPerHour,
        paybackYears: paybackYears(cost, result.throughputPerHour.mean - baseMean, assumptions),
      };
    } catch {
      return null;
    }
  };

  const baseline = evaluate([], 0);
  if (baseline === null) throw new Error("The current lab cannot run this demand, so there is nothing to optimise.");
  const baseMean = baseline.throughput.mean;
  const plans: Plan[] = [{ ...baseline, paybackYears: null }];
  const seen = new Set([""]);
  let frontier: Plan[] = plans;
  let evaluated = 1;
  const cheapestHit = (): Plan | null => [...plans].filter((plan) => plan.meetsTarget).sort((a, b) => a.cost.capex - b.cost.capex)[0] ?? null;

  for (let depth = 0; depth < goal.maxChanges; depth += 1) {
    const children: Plan[] = [];
    for (const parent of frontier.filter((plan) => !plan.meetsTarget)) {
      const state = applyPatches(twin, parent.scenarios.flatMap((item) => item.patches));
      for (const candidate of shortlist(state, config, branch)) {
        const scenarios = [...parent.scenarios, candidate];
        const key = keyOf(scenarios);
        if (seen.has(key)) continue;
        seen.add(key);
        if (goal.budget !== null && costOf(twin, scenarios).capex > goal.budget) continue;
        const plan = evaluate(scenarios, baseMean);
        evaluated += 1;
        if (plan !== null) {
          children.push(plan);
          plans.push(plan);
        }
        yield { evaluated, best: cheapestHit() };
      }
    }
    if (children.length === 0) break;
    frontier = [...children].sort((a, b) => b.throughput.mean - a.throughput.mean).slice(0, beam);
  }

  // A small sample can clear a target by luck, so the winner must hold up on more runs before it is recommended.
  // Near misses are rechecked too, or a cheaper plan that was merely unlucky would lose to a dearer lucky one.
  const contenders = plans.filter((plan) => plan.throughput.p95 >= goal.targetPerHour).sort((a, b) => a.cost.capex - b.cost.capex).slice(0, MAX_CONFIRMATIONS);
  let best: Plan | null = null;
  for (const hit of contenders) {
    const confirmed = evaluate(hit.scenarios, baseMean, CONFIRM_RUNS);
    evaluated += 1;
    yield { evaluated, best };
    if (confirmed?.meetsTarget === true) {
      best = confirmed;
      break;
    }
  }

  return { baseline: plans[0] as Plan, best, frontier: paretoFrontier(plans), evaluated, demandCeiling: demandCeiling(config) };
}

export const runSearch = (twin: LabTwin, config: SimConfig, goal: Goal, assumptions: Assumptions, options?: Options): SearchResult => {
  const search = searchPlans(twin, config, goal, assumptions, options);
  for (;;) {
    const step = search.next();
    if (step.done === true) return step.value;
  }
};
