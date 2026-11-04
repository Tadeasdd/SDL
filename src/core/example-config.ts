import type { SimConfig } from "./sim/types";

/** The default production day for the example lab. */
export const EXAMPLE_CONFIG: SimConfig = {
  demands: [
    { workflowId: "wf-viability", plates: 72, intervalS: 360 },
    { workflowId: "wf-amplicon", plates: 8, intervalS: 3000 },
  ],
  seed: 1000,
  maxWip: 24,
  failures: true,
};

export const MONTE_CARLO_RUNS = 32;
