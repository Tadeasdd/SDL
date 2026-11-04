export type Rng = () => number;

/** mulberry32: small, fast, and identical across platforms for a given seed. */
export const createRng = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const sampleNormal = (rng: Rng, mean: number, sd: number): number => {
  const u = Math.max(rng(), Number.EPSILON);
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export const sampleExponential = (rng: Rng, mean: number): number => -mean * Math.log(Math.max(rng(), Number.EPSILON));
