import type { Instrument, LabTwin, Transport } from "./schema";

/** Published UR5e reach of 850 mm, plus a plate gripper. */
export const ARM_REACH_M = 1;
const RAIL_CLEARANCE_M = 0.2;

export type LayoutIssue = { id: string; kind: "off-floor" | "overlap" | "rail" | "out-of-reach"; message: string };

const footprint = ({ x, y, size }: Instrument) => ({ left: x - size.w / 2, right: x + size.w / 2, top: y - size.d / 2, bottom: y + size.d / 2 });

const zoneAt = (twin: LabTwin, x: number, y: number) =>
  twin.zones.find(({ bounds }) => x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h);

const railSpan = (twin: LabTwin, arm: Transport): { from: number; to: number } => {
  const xs = twin.instruments.filter((item) => arm.reach.includes(item.id)).map((item) => item.x);
  return { from: Math.min(arm.homeX, ...xs), to: Math.max(arm.homeX, ...xs) };
};

/** Gap from the rail to the nearest edge of an instrument. */
export const railGap = (item: Instrument, arm: Transport, rail: { from: number; to: number }): number => {
  const box = footprint(item);
  const dx = Math.max(0, rail.from - box.right, box.left - rail.to);
  const dy = Math.max(0, box.top - arm.homeY, arm.homeY - box.bottom);
  return Math.hypot(dx, dy);
};

/** Moves an instrument and updates its room. The arm's reach list is re-derived from the original layout. */
export const moveInstrument = (twin: LabTwin, original: LabTwin, id: string, x: number, y: number): LabTwin => {
  const instruments = twin.instruments.map((item) => (item.id === id ? { ...item, x, y, zoneId: zoneAt(twin, x, y)?.id ?? item.zoneId } : item));
  const transports = twin.transports.map((transport) => {
    const before = original.transports.find((item) => item.id === transport.id);
    if (transport.kind !== "arm" || before === undefined) return transport;
    const rail = railSpan(original, before);
    const reach = before.reach.filter((reachId) => {
      const item = instruments.find((candidate) => candidate.id === reachId);
      return item !== undefined && railGap(item, before, rail) <= ARM_REACH_M;
    });
    return { ...transport, reach };
  });
  return { ...twin, instruments, transports };
};

const overlaps = (a: Instrument, b: Instrument): boolean => {
  const [p, q] = [footprint(a), footprint(b)];
  return p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
};

/** What is physically wrong with the current layout. `original` says who the arm is meant to serve. */
export const layoutIssues = (twin: LabTwin, original: LabTwin): LayoutIssue[] => {
  const issues: LayoutIssue[] = [];
  twin.instruments.forEach((item, index) => {
    if (zoneAt(twin, item.x, item.y) === undefined) issues.push({ id: item.id, kind: "off-floor", message: `${item.id} is outside every room.` });
    for (const other of twin.instruments.slice(index + 1)) {
      if (overlaps(item, other)) issues.push({ id: item.id, kind: "overlap", message: `${item.id} overlaps ${other.id}.` });
    }
  });
  for (const arm of original.transports.filter((item) => item.kind === "arm")) {
    const rail = railSpan(original, arm);
    const current = twin.transports.find((item) => item.id === arm.id);
    for (const id of arm.reach) {
      const item = twin.instruments.find((candidate) => candidate.id === id);
      if (item === undefined) continue;
      const fouls = (candidate: Instrument): boolean =>
        candidate.x >= rail.from && candidate.x <= rail.to && Math.abs(candidate.y - arm.homeY) < candidate.size.d / 2 + RAIL_CLEARANCE_M;
      // A station designed in at the end of the rail, like a transfer nest, is not fouling it.
      const wasThere = original.instruments.some((candidate) => candidate.id === id && fouls(candidate));
      if (current !== undefined && !current.reach.includes(id)) issues.push({ id, kind: "out-of-reach", message: `${id} is out of ${arm.id}'s reach.` });
      else if (fouls(item) && !wasThere) issues.push({ id, kind: "rail", message: `${id} is fouling ${arm.id}'s rail.` });
    }
  }
  return issues;
};
