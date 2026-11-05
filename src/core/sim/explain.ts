import type { LabTwin } from "../twin/schema";
import type { AssaySummary } from "./assay";
import { queueSteps, valueAt } from "./series";
import type { MonteCarloResult, SimResult } from "./types";

export type AskContext = { twin: LabTwin; current: MonteCarloResult; assay: AssaySummary | null; capex: number | null; paybackYears: number | null };

export type Answer = { text: string; basis: string[] };

const SECONDS_PER_HOUR = 3600;

const hoursText = (seconds: number): string => `${(seconds / SECONDS_PER_HOUR).toFixed(1)} h`;
const round1 = (value: number): number => Math.round(value * 10) / 10;

const hourIn = (question: string): number | null => {
  const match = /(?:hour|hr|h|t\+?)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:h\b|hours?\b)/i.exec(question);
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? null : Number(value);
};

const resourceIn = (question: string, run: SimResult): string | null => {
  const upper = question.toUpperCase();
  return run.resources.find(({ id }) => upper.includes(id.toUpperCase()))?.id ?? null;
};

export const queuesAt = (run: SimResult, t: number): { id: string; depth: number }[] =>
  run.resources
    .map(({ id }) => ({ id, depth: valueAt(queueSteps(run, id), t) }))
    .filter((item) => item.depth > 0)
    .sort((a, b) => b.depth - a.depth);

const peakOf = (run: SimResult, id: string): { depth: number; t: number } => {
  const steps = queueSteps(run, id);
  const depth = Math.max(...steps.v);
  return { depth, t: steps.t[steps.v.indexOf(depth)] ?? 0 };
};

/** In the hour before t: plates that joined the queue or went straight in, against plates served. */
export const flowInto = (run: SimResult, id: string, t: number): { arrived: number; served: number; failures: number; meanJobS: number } => {
  const from = t - SECONDS_PER_HOUR;
  const inHour = (time: number): boolean => time >= from && time < t;
  const jobs = run.segments.filter((item) => item.kind === "process" && item.resourceId === id);
  const queued = run.segments.filter((item) => item.kind === "wait" && item.resourceId === id && inHour(item.start)).length;
  const served = jobs.filter((item) => inHour(item.end));
  const direct = jobs.filter((item) => inHour(item.start) && !run.segments.some((wait) => wait.kind === "wait" && wait.resourceId === id && wait.plateId === item.plateId && wait.end === item.start)).length;
  const meanJobS = jobs.reduce((sum, item) => sum + item.end - item.start, 0) / Math.max(1, jobs.length);
  return { arrived: queued + direct, served: served.length, failures: jobs.filter((item) => item.failed === true && inHour(item.end)).length, meanJobS };
};

const explainHour = (context: AskContext, hour: number, asked: string | null): Answer => {
  const run = context.current.representative;
  const t = hour * SECONDS_PER_HOUR;
  if (t > run.makespanS) return { text: `This run finished at ${hoursText(run.makespanS)}, so nothing happened at hour ${hour}.`, basis: ["Run length"] };
  const queues = queuesAt(run, t);
  const target = asked ?? queues[0]?.id ?? null;
  if (target === null) return { text: `Nothing was queueing at hour ${hour}. Every plate was being worked on or moved.`, basis: [`Queues at ${hour} h`] };
  const depth = valueAt(queueSteps(run, target), t);
  const flow = flowInto(run, target, t);
  const peak = peakOf(run, target);
  const units = context.twin.instruments.find(({ id }) => id === target)?.capacity ?? 1;
  const perHour = (units * SECONDS_PER_HOUR) / Math.max(flow.meanJobS, 1);
  const pressure = flow.arrived > flow.served ? `${flow.arrived} plates arrived in the hour before and ${flow.served} were served, so the line grew` : `${flow.arrived} plates arrived in the hour before and ${flow.served} were served, so the line was holding or shrinking`;
  const reason = flow.failures > 0 ? ` ${flow.failures} job${flow.failures === 1 ? "" : "s"} there failed and needed repair time in that hour.` : "";
  const others = queues.filter(({ id }) => id !== target).slice(0, 2).map(({ id, depth: count }) => `${id} (${count})`).join(", ");
  return {
    text: `At hour ${hour}, ${depth} plate${depth === 1 ? " was" : "s were"} waiting for ${target}. ${pressure}. It averages ${round1(flow.meanJobS / 60)} min per job, which limits it to about ${round1(perHour)} plates per hour.${reason} This queue peaked at ${peak.depth} at ${hoursText(peak.t)}.${others ? ` Also waiting then: ${others}.` : ""}`,
    basis: [`Queue depth for ${target} at ${hour} h`, `Arrivals and completions from ${Math.max(0, hour - 1)} to ${hour} h`, "Job durations in this run"],
  };
};

const explainBottleneck = ({ current }: AskContext): Answer => {
  const run = current.representative;
  const id = run.bottleneckId;
  if (id === null) return { text: "Nothing queued in this run, so there is no bottleneck.", basis: ["Queue totals"] };
  const stat = run.resources.find((item) => item.id === id);
  const peak = peakOf(run, id);
  const share = Math.round((current.bottleneckShare[id] ?? 0) * 100);
  return {
    text: `${id} is the bottleneck: it had the longest queue in ${share}% of ${current.runs} runs. In the run shown it was busy ${Math.round((stat?.utilization ?? 0) * 100)}% of the time, plates spent ${hoursText(stat?.waitS ?? 0)} in total waiting for it, and the queue peaked at ${peak.depth} at ${hoursText(peak.t)}.`,
    basis: ["Queue totals across runs", "Utilisation in this run"],
  };
};

const explainResource = ({ current }: AskContext, id: string): Answer => {
  const run = current.representative;
  const stat = run.resources.find((item) => item.id === id);
  if (stat === undefined) return { text: `${id} was not used in this run.`, basis: ["Resource totals"] };
  const peak = peakOf(run, id);
  return {
    text: `${id} ran ${stat.jobs} jobs and was busy ${Math.round(stat.utilization * 100)}% of the time, with ${stat.failures} failure${stat.failures === 1 ? "" : "s"}. Plates spent ${hoursText(stat.waitS)} in total waiting for it, and its queue peaked at ${peak.depth}.`,
    basis: [`Totals for ${id}`],
  };
};

const explainThroughput = ({ current }: AskContext): Answer => {
  const { throughputPerHour: rate, makespanS, meanCycleS, runs } = current;
  return {
    text: `Across ${runs} runs this setup averages ${rate.mean.toFixed(2)} plates per hour (${rate.p5.toFixed(2)} to ${rate.p95.toFixed(2)}), finishing in ${hoursText(makespanS.mean)} with a mean cycle of ${Math.round(meanCycleS.mean / 60)} min per plate.`,
    basis: ["Monte Carlo totals"],
  };
};

const explainAssay = ({ assay }: AskContext): Answer => {
  if (assay === null) return { text: "This run has no screening workflow, so there is no simulated assay.", basis: [] };
  return {
    text: `In the simulated assay, ${Math.round(assay.passShare * 100)}% of plates pass Z' 0.5. ${Math.round(assay.overLimitShare * 100)}% waited past the 45-minute unsealed limit, and the mean wait from peel to read was ${Math.round(assay.meanDelayMin)} min. These readouts are generated, and the sensitivity to waiting is an assumption.`,
    basis: ["Peel-to-read waits in this run", "Synthetic assay model"],
  };
};

const explainCost = ({ capex, paybackYears }: AskContext): Answer => {
  if (capex === null || capex === 0) return { text: "No paid changes are applied in this run. Tick a change and run it to see a cost and payback.", basis: [] };
  const payback = paybackYears === null ? "It does not pay back on the current assumptions." : `It pays back in about ${paybackYears.toFixed(1)} years.`;
  return { text: `The applied changes cost about EUR ${Math.round(capex).toLocaleString("en-GB")}. ${payback} Prices are planning estimates, not quotes.`, basis: ["Cost assumptions", "Paired throughput gain"] };
};

const HELP = "I can answer from this run's data. Try \"why did the queue build up at hour 3?\", \"what is the bottleneck?\", \"how did RDR-01 do?\", \"what is the throughput?\", \"how is assay quality?\" or \"what does this cost?\".";

/** Answers from the simulation data alone. No model is involved, so nothing here can be made up. */
export const answerLocally = (question: string, context: AskContext): Answer => {
  const run = context.current.representative;
  const hour = hourIn(question);
  const resource = resourceIn(question, run);
  if (hour !== null) return explainHour(context, hour, resource);
  if (resource !== null) return explainResource(context, resource);
  if (/z'|z-prime|assay|quality|signal|ic50|unsealed/i.test(question)) return explainAssay(context);
  if (/cost|price|payback|roi|budget|worth/i.test(question)) return explainCost(context);
  if (/bottleneck|limit|slow|constraint|queue/i.test(question)) return explainBottleneck(context);
  if (/throughput|plates per|how many|finish|cycle|fast/i.test(question)) return explainThroughput(context);
  return { text: HELP, basis: [] };
};

/** The run as compact facts, for a model to reason over without seeing raw segments. */
export const factsOf = (context: AskContext): Record<string, unknown> => {
  const { current, assay, capex, paybackYears } = context;
  const run = current.representative;
  const hours = Math.ceil(run.makespanS / SECONDS_PER_HOUR);
  return {
    plates: run.completed,
    durationHours: round1(run.makespanS / SECONDS_PER_HOUR),
    platesPerHour: current.throughputPerHour,
    bottleneck: run.bottleneckId,
    resources: run.resources.map(({ id, utilization, waitS, jobs, failures }) => ({ id, busyPct: Math.round(utilization * 100), waitHours: round1(waitS / SECONDS_PER_HOUR), jobs, failures })),
    hourly: Array.from({ length: hours + 1 }, (_, hour) => ({ hour, queues: queuesAt(run, hour * SECONDS_PER_HOUR).slice(0, 3) })),
    assay: assay === null ? null : { passShare: assay.passShare, overLimitShare: assay.overLimitShare, meanDelayMin: round1(assay.meanDelayMin), isSynthetic: true },
    capex,
    paybackYears,
  };
};
