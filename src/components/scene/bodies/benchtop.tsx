"use client";

import { Box, Cylinder, Feet, MicroPlate, Shell, TONE, type Size } from "./parts";

const SEAM = 0.003;

/** Monochromator reader: two-tier white casing with a coloured waistline and the plate carrier out at the front. */
export function Reader({ w, d, h, accent = "#6a2c91" }: Size & { accent?: string }) {
  const waist = h * 0.42;
  return (
    <>
      <Feet w={w} d={d} />
      <Shell at={[0, waist / 2 + 0.01, 0]} size={[w, waist, d]} />
      <Box at={[0, waist + 0.012, 0]} size={[w - 0.006, 0.01, d - 0.006]} color={accent} rough={0.35} />
      <Shell at={[0, waist + 0.016 + (h - waist - 0.016) / 2, -0.004]} size={[w, h - waist - 0.016, d - 0.008]} radius={0.03} />
      <Box at={[0, h - 0.001, -d * 0.12]} size={[w * 0.96, SEAM, 0.004]} color={TONE.panel} />
      <Box at={[-w * 0.2, h * 0.14, d / 2 + 0.001]} size={[w * 0.42, h * 0.14, 0.004]} color={TONE.black} />
      <Box at={[-w * 0.2, h * 0.11, d / 2 + 0.06]} size={[w * 0.4, 0.012, 0.13]} color={TONE.black} rough={0.3} />
      <MicroPlate at={[-w * 0.2, h * 0.11 + 0.013, d / 2 + 0.065]} />
    </>
  );
}

/** Peristaltic bulk dispenser: low base, angled keypad, dispensing cassette over the plate carrier, reagent bottle. */
export function Dispenser({ w, d, h }: Size) {
  return (
    <>
      <Feet w={w} d={d} />
      <Shell at={[0, h * 0.2, 0]} size={[w, h * 0.36, d]} />
      <Shell at={[w * 0.28, h * 0.62, -d * 0.1]} size={[w * 0.42, h * 0.72, d * 0.72]} color={TONE.panel} />
      <Box at={[w * 0.28, h * 0.72, d * 0.27]} size={[w * 0.3, h * 0.26, 0.006]} color={TONE.dark} />
      <Box at={[-w * 0.2, h * 0.38, 0]} size={[w * 0.46, 0.008, d * 0.72]} color={TONE.black} />
      <MicroPlate at={[-w * 0.2, h * 0.38 + 0.012, d * 0.08]} />
      <Box at={[-w * 0.2, h * 0.74, -d * 0.2]} size={[w * 0.5, h * 0.16, d * 0.3]} color={TONE.steel} metal={0.4} />
      {[-0.32, -0.24, -0.16, -0.08].map((share) => (
        <Cylinder key={share} at={[w * share, h * 0.92, -d * 0.24]} radius={0.003} length={h * 0.32} color="#d6e3e8" />
      ))}
      <Cylinder at={[-w * 0.42, h * 0.58, -d * 0.36]} radius={0.04} length={h * 0.7} color="#b7cfd8" rough={0.2} metal={0} />
      <Cylinder at={[-w * 0.42, h * 0.97, -d * 0.36]} radius={0.018} length={h * 0.1} color={TONE.tipRack} />
    </>
  );
}

/** Roll heat sealer: narrow upright body with the foil roll on top and a shuttle at the front. */
export function Sealer({ w, d, h }: Size) {
  return (
    <>
      <Feet w={w} d={d} />
      <Shell at={[0, h * 0.42, -d * 0.14]} size={[w, h * 0.8, d * 0.7]} />
      <Shell at={[0, h * 0.12, d * 0.26]} size={[w, h * 0.2, d * 0.46]} color={TONE.panel} />
      <Box at={[0, h * 0.22 + 0.004, d * 0.3]} size={[w * 0.72, 0.006, d * 0.3]} color={TONE.black} />
      <MicroPlate at={[0, h * 0.22 + 0.014, d * 0.3]} />
      <Cylinder at={[0, h * 0.93, -d * 0.2]} radius={h * 0.13} length={w * 0.72} rotation={[0, 0, Math.PI / 2]} color="#c8cdd0" metal={0.7} rough={0.3} />
      <Box at={[0, h * 0.55, d * 0.206]} size={[w * 0.5, h * 0.2, 0.004]} color={TONE.dark} />
    </>
  );
}

/** Seal remover: square body with the supply and take-up tape spools on the side and a front plate stage. */
export function Peeler({ w, d, h }: Size) {
  return (
    <>
      <Feet w={w} d={d} />
      <Shell at={[0, h * 0.48, -d * 0.1]} size={[w, h * 0.92, d * 0.78]} />
      <Shell at={[0, h * 0.1, d * 0.3]} size={[w, h * 0.16, d * 0.38]} color={TONE.panel} />
      <MicroPlate at={[0, h * 0.19 + 0.008, d * 0.3]} />
      <Box at={[0, h * 0.42, d * 0.296]} size={[w * 0.74, h * 0.2, 0.004]} color={TONE.black} />
      <Cylinder at={[w / 2 + 0.01, h * 0.72, -d * 0.22]} radius={h * 0.13} length={0.02} rotation={[0, 0, Math.PI / 2]} color="#e4e0d2" metal={0} />
      <Cylinder at={[w / 2 + 0.01, h * 0.34, -d * 0.22]} radius={h * 0.09} length={0.02} rotation={[0, 0, Math.PI / 2]} color="#e4e0d2" metal={0} />
    </>
  );
}

/** Two-bucket plate centrifuge: low wide tub, sloped lid, loading door at the front. */
export function Centrifuge({ w, d, h }: Size) {
  return (
    <>
      <Feet w={w} d={d} />
      <Shell at={[0, h * 0.46, 0]} size={[w, h * 0.88, d]} radius={0.02} />
      <Shell at={[0, h * 0.94, -d * 0.03]} size={[w * 0.9, h * 0.1, d * 0.84]} color={TONE.panel} />
      <Box at={[0, h * 0.42, d / 2 + 0.001]} size={[w * 0.56, h * 0.42, 0.004]} color={TONE.dark} rough={0.3} />
      <Box at={[w * 0.36, h * 0.6, d / 2 + 0.001]} size={[w * 0.12, h * 0.14, 0.004]} color={TONE.black} />
    </>
  );
}

const FIN_COUNT = 7;

/** On-deck thermal cycler: compact block with heat-sink fins and a plate drawer. */
export function Thermocycler({ w, d, h }: Size) {
  return (
    <>
      <Shell at={[0, h * 0.62, 0]} size={[w, h * 0.72, d]} color={TONE.panel} radius={0.006} />
      {Array.from({ length: FIN_COUNT }, (_, index) => (
        <Box key={index} at={[(index / (FIN_COUNT - 1) - 0.5) * w * 0.9, h * 0.13, 0]} size={[0.005, h * 0.26, d * 0.94]} color={TONE.steel} metal={0.7} rough={0.35} />
      ))}
      <Box at={[0, h * 0.64, d / 2 + 0.008]} size={[w * 0.84, h * 0.24, 0.016]} color={TONE.dark} />
      <MicroPlate at={[0, h * 0.8, d / 2 + 0.05]} color="#d9dfd2" />
    </>
  );
}

/** Generic casing, for anything the twin does not have a dedicated body for. */
export function Generic({ w, d, h }: Size) {
  return (
    <>
      <Feet w={w} d={d} />
      <Shell at={[0, h / 2 + 0.01, 0]} size={[w, h - 0.01, d]} />
      <Box at={[0, h * 0.6, d / 2 + 0.001]} size={[w * 0.5, h * 0.3, 0.004]} color={TONE.dark} />
    </>
  );
}
