export const SCENE = {
  bg: "#0b0b0a",
  ink: "#ede9de",
  dim: "#6f6c62",
  body: "#191915",
  accent: "#cfff5e",
  warn: "#f2b84b",
  crit: "#ff6a5c",
};

const SERIES_3D = ["#a9dc3f", "#6fa8ff"] as const;

/** The first workflow takes slot one. Every other workflow shares slot two, so no hue is ever generated. */
export const seriesColor = (workflowId: string, primaryId: string | undefined): string =>
  SERIES_3D[workflowId === primaryId ? 0 : 1];
