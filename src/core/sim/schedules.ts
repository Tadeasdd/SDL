import type { DispatchRule, Schedule } from "./types";

export type ShiftPreset = { id: string; label: string; attendedHours: number | null; stopsUnattended: boolean };

export const SHIFTS: readonly ShiftPreset[] = [
  { id: "always", label: "Staffed around the clock", attendedHours: null, stopsUnattended: false },
  { id: "two-walkaway", label: "Two shifts, runs on overnight", attendedHours: 16, stopsUnattended: false },
  { id: "day-walkaway", label: "Day shift, runs on overnight", attendedHours: 8, stopsUnattended: false },
  { id: "day-stop", label: "Day shift, lab stops overnight", attendedHours: 8, stopsUnattended: true },
];

export const RULES: readonly { id: DispatchRule; label: string }[] = [
  { id: "fifo", label: "First come, first served" },
  { id: "shortest-step", label: "Shortest step first" },
  { id: "oldest-plate", label: "Oldest plate first" },
];

export const DEFAULT_SCHEDULE: Schedule = { attendedHours: null, stopsUnattended: false, dispatch: "fifo", maintenance: [] };

export const shiftOf = (schedule: Schedule | undefined): ShiftPreset =>
  SHIFTS.find((item) => item.attendedHours === (schedule?.attendedHours ?? null) && item.stopsUnattended === (schedule?.stopsUnattended ?? false)) ?? (SHIFTS[0] as ShiftPreset);

export const scheduleLabel = (schedule: Schedule | undefined): string => {
  const rule = RULES.find((item) => item.id === (schedule?.dispatch ?? "fifo"))?.label ?? "";
  const planned = schedule?.maintenance.length ? `, ${schedule.maintenance.length} maintenance window` : "";
  return `${shiftOf(schedule).label}. ${rule}${planned}`;
};
