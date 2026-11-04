import { blockedStep, feasibleInstruments } from "../twin/feasible";
import { createRouter, type Leg, type Point } from "../twin/routing";
import type { Instrument, LabTwin, Step, Transport, Workflow } from "../twin/schema";
import { EventQueue } from "./queue";
import { createRng, sampleExponential, sampleNormal, type Rng } from "./random";
import type { ResourceStat, Segment, SimConfig, SimResult } from "./types";

const MIN_DURATION_SHARE = 0.3;
const DEGRADED_SLOWDOWN = 1.25;
const SECONDS_PER_HOUR = 3600;
const PLATE_STREAM_STRIDE = 100_003;

type Resource = {
  id: string;
  kind: ResourceStat["kind"];
  capacity: number;
  busy: number;
  queue: (() => void)[];
  busyS: number;
  waitS: number;
  jobs: number;
  failures: number;
};

type Plate = { id: number; workflow: Workflow; at: string | null; releasedAt: number; rng: Rng };

const newResource = (id: string, kind: ResourceStat["kind"], capacity: number): Resource => ({
  id,
  kind,
  capacity,
  busy: 0,
  queue: [],
  busyS: 0,
  waitS: 0,
  jobs: 0,
  failures: 0,
});

const percentile = (values: readonly number[], share: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
};

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const pickBottleneck = (resources: readonly ResourceStat[]): string | null => {
  const ranked = [...resources].sort((a, b) => b.waitS - a.waitS || b.utilization - a.utilization);
  return ranked[0]?.id ?? null;
};

/**
 * Runs one seeded discrete-event simulation. State inside this closure is deliberately mutable, because
 * it is the simulation clock, but it never escapes: the twin is read-only and the result is a plain value.
 */
export const simulate = (twin: LabTwin, config: SimConfig): SimResult => {
  const events = new EventQueue();
  const route = createRouter(twin);
  const segments: Segment[] = [];
  const cycleTimes: number[] = [];
  const instruments = new Map(twin.instruments.map((item) => [item.id, item]));
  const transports = new Map(twin.transports.map((item) => [item.id, item]));
  const positions = new Map<string, Point>(twin.transports.map((item) => [item.id, { x: item.homeX, y: item.homeY }]));
  const resources = new Map<string, Resource>([
    ...twin.instruments.map((item): [string, Resource] => [item.id, newResource(item.id, "instrument", item.capacity)]),
    ...twin.transports.map((item): [string, Resource] => [item.id, newResource(item.id, "transport", item.capacity)]),
  ]);

  let now = 0;
  let wip = 0;
  let totalFailures = 0;
  const held: Plate[] = [];

  const resource = (id: string): Resource => resources.get(id) as Resource;

  const acquire = (id: string, plate: Plate, step: Step, then: () => void): void => {
    const target = resource(id);
    if (target.busy < target.capacity) {
      target.busy += 1;
      then();
      return;
    }
    const queuedAt = now;
    target.queue.push(() => {
      target.waitS += now - queuedAt;
      segments.push({
        plateId: plate.id,
        workflowId: plate.workflow.id,
        kind: "wait",
        resourceId: id,
        stepId: step.id,
        start: queuedAt,
        end: now,
      });
      then();
    });
  };

  const release = (id: string): void => {
    const target = resource(id);
    const next = target.queue.shift();
    if (next === undefined) {
      target.busy -= 1;
      return;
    }
    next();
  };

  const feasibility = new Map(twin.workflows.map((item) => [item.id, feasibleInstruments(twin, item, route)]));

  const assertRunnable = (workflow: Workflow): void => {
    const step = workflow.steps[blockedStep(feasibility.get(workflow.id) ?? [])];
    if (step !== undefined) {
      throw new Error(`No reachable instrument provides "${step.capability}" for step "${step.name}".`);
    }
  };

  const eligible = (plate: Plate, index: number): Instrument[] =>
    (feasibility.get(plate.workflow.id)?.[index] ?? []).filter((item) => plate.at === null || route(plate.at, item.id) !== null);

  const chooseInstrument = (plate: Plate, index: number): Instrument => {
    const load = (item: Instrument): number => {
      const state = resource(item.id);
      return (state.busy + state.queue.length) / state.capacity;
    };
    return [...eligible(plate, index)].sort((a, b) => load(a) - load(b))[0] as Instrument;
  };

  const legDuration = (leg: Leg, transport: Transport): number => {
    const start = leg.path[0] as Point;
    const position = positions.get(transport.id) as Point;
    const deadheadM = Math.hypot(position.x - start.x, position.y - start.y);
    return transport.handoffS + (deadheadM + leg.distanceM) / transport.speedMps;
  };

  const runLegs = (plate: Plate, step: Step, legs: readonly Leg[], then: () => void): void => {
    const [leg, ...rest] = legs;
    if (leg === undefined) {
      then();
      return;
    }
    acquire(leg.transportId, plate, step, () => {
      const transport = transports.get(leg.transportId) as Transport;
      const duration = legDuration(leg, transport);
      const start = now;
      const state = resource(leg.transportId);
      state.busyS += duration;
      state.jobs += 1;
      events.push(now + duration, () => {
        positions.set(transport.id, leg.path[leg.path.length - 1] as Point);
        segments.push({
          plateId: plate.id,
          workflowId: plate.workflow.id,
          kind: "move",
          resourceId: transport.id,
          stepId: step.id,
          start,
          end: now,
          path: leg.path,
        });
        release(leg.transportId);
        runLegs(plate, step, rest, then);
      });
    });
  };

  const sampleDuration = ({ rng }: Plate, step: Step, instrument: Instrument): { seconds: number; failed: boolean } => {
    const floor = step.duration.meanS * MIN_DURATION_SHARE;
    const nominal = Math.max(floor, sampleNormal(rng, step.duration.meanS, step.duration.sdS));
    const base = instrument.state === "degraded" ? nominal * DEGRADED_SLOWDOWN : nominal;
    if (!config.failures) return { seconds: base, failed: false };
    const failed = rng() < 1 - Math.exp(-base / (instrument.mtbfHours * SECONDS_PER_HOUR));
    return { seconds: failed ? base + sampleExponential(rng, instrument.mttrMinutes * 60) : base, failed };
  };

  const finish = (plate: Plate): void => {
    cycleTimes.push(now - plate.releasedAt);
    wip -= 1;
    const next = held.shift();
    if (next !== undefined) admit(next);
  };

  const process = (plate: Plate, index: number, step: Step, instrument: Instrument): void => {
    const { seconds, failed } = sampleDuration(plate, step, instrument);
    const start = now;
    const state = resource(instrument.id);
    state.busyS += seconds;
    state.jobs += 1;
    state.failures += failed ? 1 : 0;
    totalFailures += failed ? 1 : 0;
    events.push(now + seconds, () => {
      segments.push({
        plateId: plate.id,
        workflowId: plate.workflow.id,
        kind: "process",
        resourceId: instrument.id,
        stepId: step.id,
        start,
        end: now,
        failed,
      });
      release(instrument.id);
      runStep(plate, index + 1);
    });
  };

  const runStep = (plate: Plate, index: number): void => {
    const step = plate.workflow.steps[index];
    if (step === undefined) {
      finish(plate);
      return;
    }
    const instrument = chooseInstrument(plate, index);
    const legs = plate.at === null ? [] : (route(plate.at, instrument.id)?.legs ?? []);
    // Instruments have no input buffer, so the destination is reserved before the final leg. Earlier legs
    // run first: the plate stages at the last hand-off, as a real scheduler would stage it, instead of
    // holding a busy instrument idle for the whole journey.
    runLegs(plate, step, legs.slice(0, -1), () => {
      acquire(instrument.id, plate, step, () => {
        runLegs(plate, step, legs.slice(-1), () => {
          plate.at = instrument.id;
          process(plate, index, step, instrument);
        });
      });
    });
  };

  const admit = (plate: Plate): void => {
    wip += 1;
    plate.releasedAt = now;
    runStep(plate, 0);
  };

  const schedule = (): number => {
    let plateId = 0;
    for (const demand of config.demands) {
      const workflow = twin.workflows.find((item) => item.id === demand.workflowId);
      if (workflow === undefined) throw new Error(`Unknown workflow ${demand.workflowId}.`);
      assertRunnable(workflow);
      for (let index = 0; index < demand.plates; index += 1) {
        // One stream per plate: a scenario that reorders events still gives each plate the same draws.
        const rng = createRng(Math.imul(config.seed, PLATE_STREAM_STRIDE) + plateId);
        const plate: Plate = { id: plateId, workflow, at: null, releasedAt: 0, rng };
        plateId += 1;
        events.push(index * demand.intervalS, () => {
          if (wip < config.maxWip) admit(plate);
          else held.push(plate);
        });
      }
    }
    return plateId;
  };

  const total = schedule();
  for (let entry = events.pop(); entry !== undefined; entry = events.pop()) {
    now = entry.time;
    entry.run();
  }

  const makespanS = now;
  const stats: ResourceStat[] = [...resources.values()]
    .filter((item) => item.jobs > 0)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      utilization: makespanS === 0 ? 0 : Math.min(1, item.busyS / (item.capacity * makespanS)),
      waitS: item.waitS,
      jobs: item.jobs,
      failures: item.failures,
    }));

  return {
    completed: cycleTimes.length,
    makespanS,
    throughputPerHour: makespanS === 0 ? 0 : (total / makespanS) * SECONDS_PER_HOUR,
    meanCycleS: mean(cycleTimes),
    p95CycleS: percentile(cycleTimes, 0.95),
    resources: stats,
    bottleneckId: pickBottleneck(stats),
    failures: totalFailures,
    segments: [...segments].sort((a, b) => a.start - b.start),
  };
};

