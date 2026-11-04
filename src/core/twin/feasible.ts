import type { Route } from "./routing";
import type { Instrument, LabTwin, Workflow } from "./schema";

type Router = (fromId: string, toId: string) => Route | null;

const usable = (twin: LabTwin, capability: string): Instrument[] =>
  twin.instruments.filter((item) => item.state !== "offline" && item.capabilities.includes(capability));

/**
 * For each step, the instruments from which a plate can still finish the workflow. Worked backwards,
 * so the validator and the simulator agree on what a runnable workflow is.
 */
export const feasibleInstruments = (twin: LabTwin, workflow: Workflow, route: Router): Instrument[][] =>
  workflow.steps.reduceRight<Instrument[][]>((later, step) => {
    const next = later[0];
    const options = usable(twin, step.capability);
    const feasible =
      next === undefined ? options : options.filter((item) => next.some((target) => route(item.id, target.id) !== null));
    return [feasible, ...later];
  }, []);

/** Index of the step that breaks the workflow: the last one nothing can complete from. */
export const blockedStep = (feasible: readonly Instrument[][]): number =>
  feasible.findLastIndex((options) => options.length === 0);
