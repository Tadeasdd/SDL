export const hours = (seconds: number): string => `${(seconds / 3600).toFixed(1)} h`;
export const minutes = (seconds: number): string => `${(seconds / 60).toFixed(0)} min`;

export const clock = (seconds: number): string => {
  const whole = Math.floor(seconds);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `T+${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}`;
};

export const signed = (value: number, digits = 2): string => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;

export const euros = (value: number): string => {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(2)}M`;
  return value >= 10_000 ? `€${Math.round(value / 1000)}k` : `€${Math.round(value).toLocaleString("en-GB")}`;
};

/** A payback period. Under a year reads better in months. */
export const years = (value: number): string => {
  if (value < 1 / 12) return "Under 1 month";
  return value < 1 ? `${Math.round(value * 12)} months` : `${value.toFixed(1)} years`;
};
