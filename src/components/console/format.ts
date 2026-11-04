export const hours = (seconds: number): string => `${(seconds / 3600).toFixed(1)} h`;
export const minutes = (seconds: number): string => `${(seconds / 60).toFixed(0)} min`;

export const clock = (seconds: number): string => {
  const whole = Math.floor(seconds);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `T+${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}`;
};

export const signed = (value: number, digits = 2): string => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
