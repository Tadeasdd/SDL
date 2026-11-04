export const SCENE = {
  bg: "#0b0b0a",
  ink: "#ede9de",
  dim: "#6f6c62",
  body: "#191915",
  accent: "#cfff5e",
  warn: "#f2b84b",
  crit: "#ff6a5c",
  series: { "wf-viability": "#a9dc3f", other: "#6fa8ff" },
};

export const seriesColor = (workflowId: string): string =>
  workflowId === "wf-viability" ? SCENE.series["wf-viability"] : SCENE.series.other;
