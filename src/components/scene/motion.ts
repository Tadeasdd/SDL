import type { Segment } from "@/core/sim/types";
import type { Point } from "@/core/twin/routing";
import { pointAlong } from "./geometry";

const endOf = (segment: Segment, anchor: (id: string) => Point): Point => {
  const path = segment.path;
  return path === undefined ? anchor(segment.resourceId) : (path[path.length - 1] as Point);
};

/** Where a timeline puts something at time t, or null before its first segment. */
export const locate = (timeline: readonly Segment[], t: number, anchor: (id: string) => Point): Point | null => {
  let last: Segment | null = null;
  for (const segment of timeline) {
    if (segment.start > t) break;
    last = segment;
  }
  if (last === null) return null;
  if (last.path === undefined || t >= last.end) return endOf(last, anchor);
  return pointAlong(last.path, (t - last.start) / Math.max(last.end - last.start, 1e-6));
};

const END_SHARE = 0.16;

/** 1 at either end of a transfer, easing to 0 mid-flight. Used to lift a plate off a dock and set it down again. */
export const dockBlend = (share: number): number => Math.max(0, 1 - Math.min(share, 1 - share) / END_SHARE);
