import { createRng } from "@/core/sim/random";
import type { Point } from "@/core/twin/routing";
import type { Instrument, LabTwin, Transport, Zone } from "@/core/twin/schema";

export const WALL_HEIGHT = 2.6;
export const SITE = { x: 12, y: 7 };

/** Twin plan coordinates to scene coordinates: plan y becomes depth. */
export const toScene = (point: Point, height = 0): [number, number, number] => [point.x - SITE.x, height, point.y - SITE.y];

/** Shift that puts this twin at the scene origin. `toScene` assumes SITE, so this is applied once at the root. */
export const sceneOffset = (twin: LabTwin): [number, number, number] => {
  if (twin.zones.length === 0) return [0, 0, 0];
  const xs = twin.zones.flatMap(({ bounds }) => [bounds.x, bounds.x + bounds.w]);
  const ys = twin.zones.flatMap(({ bounds }) => [bounds.y, bounds.y + bounds.h]);
  return [SITE.x - (Math.min(...xs) + Math.max(...xs)) / 2, 0, SITE.y - (Math.min(...ys) + Math.max(...ys)) / 2];
};

/** An arm's rail spans the instruments it reaches, along the line of its home position. */
export const railOf = (twin: LabTwin, arm: Transport): { from: Point; to: Point } => {
  const xs = twin.instruments.filter((item) => arm.reach.includes(item.id)).map((item) => item.x);
  return { from: { x: Math.min(arm.homeX, ...xs), y: arm.homeY }, to: { x: Math.max(arm.homeX, ...xs), y: arm.homeY } };
};

export const pointAlong = (path: readonly Point[], share: number): Point => {
  const lengths = path.slice(1).map((point, index) => {
    const previous = path[index] as Point;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = total * Math.min(Math.max(share, 0), 1);
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index] as number;
    const from = path[index] as Point;
    const to = path[index + 1] as Point;
    if (remaining <= length && length > 0) {
      const ratio = remaining / length;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    remaining -= length;
  }
  return path[path.length - 1] as Point;
};

const hash = (text: string): number => [...text].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 7);

const WALL_POINTS_PER_M = 150;
const FLOOR_POINTS_PER_M2 = 46;
const KIT_POINTS_PER_M2 = 900;
const NOISE_M = 0.012;

type Cloud = { positions: number[]; shades: number[] };

const sampleZone = ({ id, bounds }: Zone, out: Cloud, doorsAt: readonly Point[]): void => {
  const rng = createRng(hash(id));
  const jitter = () => (rng() - 0.5) * 2 * NOISE_M;
  const { x, y, w, h } = bounds;
  const perimeter = 2 * (w + h);
  const emit = (px: number, py: number, pz: number, shade: number) => {
    out.positions.push(px - SITE.x + jitter(), py + jitter(), pz - SITE.y + jitter());
    out.shades.push(shade);
  };
  for (let index = 0; index < perimeter * WALL_POINTS_PER_M; index += 1) {
    const along = rng() * perimeter;
    const height = rng() * WALL_HEIGHT;
    const [px, pz] =
      along < w ? [x + along, y]
      : along < w + h ? [x + w, y + along - w]
      : along < 2 * w + h ? [x + along - w - h, y + h]
      : [x, y + along - 2 * w - h];
    const isOpening = height < 2.05 && doorsAt.some((door) => Math.hypot(door.x - px, door.y - pz) < 0.5);
    if (!isOpening) emit(px, height, pz, 0.34 + 0.5 * (height / WALL_HEIGHT));
  }
  for (let index = 0; index < w * h * FLOOR_POINTS_PER_M2; index += 1) {
    emit(x + rng() * w, 0, y + rng() * h, 0.16 + rng() * 0.16);
  }
};

const sampleKit = (item: Instrument, out: Cloud): void => {
  const rng = createRng(hash(item.id));
  const { w, d, h } = item.size;
  const area = 2 * (w * h + d * h) + w * d;
  for (let index = 0; index < area * KIT_POINTS_PER_M2; index += 1) {
    const face = rng() * area;
    const u = rng() - 0.5;
    const v = rng();
    const [px, py, pz] =
      face < w * d ? [u * w, h, (rng() - 0.5) * d]
      : face < w * d + w * h ? [u * w, v * h, d / 2]
      : face < w * d + 2 * w * h ? [u * w, v * h, -d / 2]
      : face < w * d + 2 * w * h + d * h ? [w / 2, v * h, u * d]
      : [-w / 2, v * h, u * d];
    out.positions.push(item.x + px - SITE.x, py, item.y + pz - SITE.y);
    out.shades.push(0.6 + 0.4 * (py / h));
  }
};

/** A synthetic scan of the twin. It is generated from the model, not captured, and is labelled as such. */
export const buildCloud = (twin: LabTwin): { positions: Float32Array; colors: Float32Array } => {
  const cloud: Cloud = { positions: [], shades: [] };
  twin.zones.forEach((zone) => sampleZone(zone, cloud, twin.doors));
  twin.instruments.forEach((item) => sampleKit(item, cloud));
  const colors = new Float32Array(cloud.shades.length * 3);
  cloud.shades.forEach((shade, index) => {
    colors[index * 3] = shade * 0.93;
    colors[index * 3 + 1] = shade * 0.91;
    colors[index * 3 + 2] = shade * 0.84;
  });
  return { positions: new Float32Array(cloud.positions), colors };
};

/** Flat list of wall segments in scene space, ready for a LineSegments buffer. */
export const wallSegments = (twin: LabTwin): Float32Array => {
  const points = twin.zones.flatMap(({ bounds: { x, y, w, h } }) => {
    const corners: Point[] = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    return corners.flatMap((corner, index) => {
      const next = corners[(index + 1) % 4] as Point;
      return [...toScene(corner, 0), ...toScene(next, 0), ...toScene(corner, WALL_HEIGHT), ...toScene(next, WALL_HEIGHT)];
    });
  });
  return new Float32Array(points);
};
