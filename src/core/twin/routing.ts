import type { Door, Instrument, LabTwin, Transport } from "./schema";

export type Point = { x: number; y: number };

export type Leg = {
  transportId: string;
  fromId: string;
  toId: string;
  path: Point[];
  distanceM: number;
};

export type Route = { legs: Leg[]; distanceM: number };

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const pathLength = (path: readonly Point[]): number =>
  path.slice(1).reduce((total, point, index) => total + distance(path[index] as Point, point), 0);

const canPass = (door: Door, transport: Transport): boolean =>
  transport.minDoorMm === undefined || door.widthMm >= transport.minDoorMm;

type Frontier = { zoneId: string; at: Point; cost: number; doors: Door[] };

/** Dijkstra over zones, with doors as edges. Returns the doors crossed, or null if unreachable. */
const doorsBetween = (twin: LabTwin, from: Instrument, to: Instrument, transport: Transport): Door[] | null => {
  const best = new Map<string, number>([[from.zoneId, 0]]);
  let frontier: Frontier[] = [{ zoneId: from.zoneId, at: from, cost: 0, doors: [] }];

  while (frontier.length > 0) {
    const sorted = [...frontier].sort((a, b) => a.cost - b.cost);
    const current = sorted[0] as Frontier;
    frontier = sorted.slice(1);
    if (current.zoneId === to.zoneId) return current.doors;

    for (const door of twin.doors) {
      if (!canPass(door, transport)) continue;
      const next = door.zoneA === current.zoneId ? door.zoneB : door.zoneB === current.zoneId ? door.zoneA : null;
      if (next === null) continue;
      const cost = current.cost + distance(current.at, door);
      if (cost >= (best.get(next) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(next, cost);
      frontier = [...frontier, { zoneId: next, at: door, cost, doors: [...current.doors, door] }];
    }
  }
  return null;
};

const directLeg = (twin: LabTwin, transport: Transport, from: Instrument, to: Instrument): Leg | null => {
  const restricted = transport.kind === "arm" || transport.reach.length > 0;
  if (restricted && !(transport.reach.includes(from.id) && transport.reach.includes(to.id))) return null;
  if (transport.kind === "arm") {
    const path = [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
    return { transportId: transport.id, fromId: from.id, toId: to.id, path, distanceM: pathLength(path) };
  }
  const doors = doorsBetween(twin, from, to, transport);
  if (doors === null) return null;
  const path = [{ x: from.x, y: from.y }, ...doors.map((door) => ({ x: door.x, y: door.y })), { x: to.x, y: to.y }];
  return { transportId: transport.id, fromId: from.id, toId: to.id, path, distanceM: pathLength(path) };
};

const legSeconds = (leg: Leg, transport: Transport): number => leg.distanceM / transport.speedMps + transport.handoffS;

/** Automated transports are preferred: a human leg is priced as if it were much slower. */
const HUMAN_COST_FACTOR = 6;

const legCost = (leg: Leg, transport: Transport): number =>
  legSeconds(leg, transport) * (transport.kind === "human" ? HUMAN_COST_FACTOR : 1);

const collectLegs = (twin: LabTwin, from: Instrument, toId: string): { leg: Leg; cost: number; next: Instrument }[] =>
  twin.transports.flatMap((transport) =>
    twin.instruments.flatMap((next) => {
      if (next.id === from.id) return [];
      if (next.state === "offline" && next.id !== toId) return [];
      const leg = directLeg(twin, transport, from, next);
      return leg === null ? [] : [{ leg, cost: legCost(leg, transport), next }];
    }),
  );

type RouteState = { instrument: Instrument; cost: number; legs: Leg[] };

/**
 * Cheapest chain of transport legs between two instruments. Intermediate stops are instruments,
 * which models plate hand-offs at a shared nest. Returns null when no chain exists.
 */
export const planRoute = (twin: LabTwin, fromId: string, toId: string): Route | null => {
  const start = twin.instruments.find((instrument) => instrument.id === fromId);
  if (start === undefined || !twin.instruments.some((instrument) => instrument.id === toId)) return null;
  if (fromId === toId) return { legs: [], distanceM: 0 };

  const best = new Map<string, number>([[fromId, 0]]);
  let frontier: RouteState[] = [{ instrument: start, cost: 0, legs: [] }];

  while (frontier.length > 0) {
    const sorted = [...frontier].sort((a, b) => a.cost - b.cost);
    const current = sorted[0] as RouteState;
    frontier = sorted.slice(1);
    if (current.instrument.id === toId) {
      return { legs: current.legs, distanceM: current.legs.reduce((sum, leg) => sum + leg.distanceM, 0) };
    }
    for (const { leg, cost, next } of collectLegs(twin, current.instrument, toId)) {
      const total = current.cost + cost;
      if (total >= (best.get(next.id) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(next.id, total);
      frontier = [...frontier, { instrument: next, cost: total, legs: [...current.legs, leg] }];
    }
  }
  return null;
};

/** Memoises routes for one twin, so a simulation plans each instrument pair only once. */
export const createRouter = (twin: LabTwin): ((fromId: string, toId: string) => Route | null) => {
  const cache = new Map<string, Route | null>();
  return (fromId, toId) => {
    const key = `${fromId}>${toId}`;
    if (!cache.has(key)) cache.set(key, planRoute(twin, fromId, toId));
    return cache.get(key) ?? null;
  };
};
