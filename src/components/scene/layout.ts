import type { Point } from "@/core/twin/routing";
import type { Instrument, LabTwin } from "@/core/twin/schema";

export const BENCH_HEIGHT = 0.75;
/** Anything this tall stands on the floor. Shorter instruments sit on an integration bench. */
const FLOOR_STANDING_M = 1.5;
const BENCH_MARGIN_M = 0.12;
const DOCK_CLEARANCE_M = 0.08;
const PLATE_REST_M = 0.03;
const ROW_TOLERANCE_M = 0.7;
const ON_LINE_M = 0.01;
const CLOSE_VIEW_MIN_M = 1.5;
const CLOSE_VIEW_SCALE = 1.9;

export const mountOf = (item: Instrument): number => (item.size.h >= FLOOR_STANDING_M ? 0 : BENCH_HEIGHT);

export const topOf = (item: Instrument): number => mountOf(item) + item.size.h;

const towards = (from: number, to: number): 1 | -1 => (to < from ? -1 : 1);

/** Which way along plan y the front of an instrument faces: at the arm that serves it, otherwise into its room. */
export const facingOf = (twin: LabTwin, item: Instrument): 1 | -1 => {
  const arm = twin.transports.find((transport) => transport.kind === "arm" && transport.reach.includes(item.id));
  if (arm !== undefined) return towards(item.y, arm.homeY);
  const zone = twin.zones.find(({ id }) => id === item.zoneId);
  return zone === undefined ? 1 : towards(item.y, zone.bounds.y + zone.bounds.h / 2);
};

/** A close view of an instrument's front, as an offset from its centre in scene space. */
export const closeViewOf = (twin: LabTwin, item: Instrument): { centre: number; offset: [number, number, number] } => {
  const reach = Math.max(CLOSE_VIEW_MIN_M, Math.max(item.size.w, item.size.h, item.size.d) * CLOSE_VIEW_SCALE);
  return { centre: mountOf(item) + item.size.h / 2, offset: [-reach * 0.42, reach * 0.34, facingOf(twin, item) * reach * 0.95] };
};

export type Dock = Point & { height: number };

/** Where a plate rests while an instrument has it: on the tray at the front, so it stays visible. */
export const dockOf = (twin: LabTwin, item: Instrument): Dock => ({
  x: item.x,
  y: item.y + facingOf(twin, item) * (item.size.d / 2 + DOCK_CLEARANCE_M),
  height: Math.max(mountOf(item), BENCH_HEIGHT) + PLATE_REST_M,
});

export type Bench = { id: string; x: number; y: number; w: number; d: number };

type Row = { key: string; items: Instrument[] };

const rowsOf = (twin: LabTwin): Row[] =>
  twin.instruments
    .filter((item) => mountOf(item) > 0)
    .reduce<Row[]>((rows, item) => {
      const key = `${item.zoneId}:${facingOf(twin, item)}`;
      const row = rows.find((candidate) => candidate.key === key && candidate.items.some((other) => Math.abs(other.y - item.y) < ROW_TOLERANCE_M));
      if (row === undefined) return [...rows, { key, items: [item] }];
      return rows.map((candidate) => (candidate === row ? { ...row, items: [...row.items, item] } : candidate));
    }, []);

/** One continuous bench under each row of bench-top instruments. */
export const benchesOf = (twin: LabTwin): Bench[] =>
  rowsOf(twin).map(({ items }, index) => {
    const left = Math.min(...items.map((item) => item.x - item.size.w / 2)) - BENCH_MARGIN_M;
    const right = Math.max(...items.map((item) => item.x + item.size.w / 2)) + BENCH_MARGIN_M;
    const back = Math.min(...items.map((item) => item.y - item.size.d / 2)) - BENCH_MARGIN_M;
    const front = Math.max(...items.map((item) => item.y + item.size.d / 2)) + BENCH_MARGIN_M;
    return { id: `bench-${index}`, x: (left + right) / 2, y: (back + front) / 2, w: right - left, d: front - back };
  });

export type WallRun = { from: Point; to: Point };

/** Cut a straight wall at every door that sits on it. */
const splitAtDoors = (from: Point, to: Point, twin: LabTwin): WallRun[] => {
  const isHorizontal = from.y === to.y;
  const axis = (point: Point): number => (isHorizontal ? point.x : point.y);
  const at = (value: number): Point => (isHorizontal ? { x: value, y: from.y } : { x: from.x, y: value });
  const onWall = twin.doors
    .filter((door) => Math.abs(isHorizontal ? door.y - from.y : door.x - from.x) < ON_LINE_M && axis(door) > axis(from) && axis(door) < axis(to))
    .sort((a, b) => axis(a) - axis(b));
  const runs: WallRun[] = [];
  let cursor = axis(from);
  for (const door of onWall) {
    const half = door.widthMm / 2000;
    if (axis(door) - half > cursor) runs.push({ from: at(cursor), to: at(axis(door) - half) });
    cursor = axis(door) + half;
  }
  if (cursor < axis(to)) runs.push({ from: at(cursor), to });
  return runs;
};

const runKey = ({ from, to }: WallRun): string => `${from.x}:${from.y}:${to.x}:${to.y}`;

/** Every wall piece once. A wall shared by two rooms comes out of both. */
export const wallRunsOf = (twin: LabTwin): WallRun[] => {
  const runs = twin.zones.flatMap(({ bounds: { x, y, w, h } }) => [
    ...splitAtDoors({ x, y }, { x: x + w, y }, twin),
    ...splitAtDoors({ x, y: y + h }, { x: x + w, y: y + h }, twin),
    ...splitAtDoors({ x, y }, { x, y: y + h }, twin),
    ...splitAtDoors({ x: x + w, y }, { x: x + w, y: y + h }, twin),
  ]);
  return [...new Map(runs.map((run) => [runKey(run), run])).values()];
};
