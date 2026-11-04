"use client";

import { Box, Cylinder, Feet, MicroPlate, Shell, TONE, type Size } from "./parts";

const TRACK_PITCH_M = 0.17;
const DECK_PLATES = 3;
const CHANNELS = 8;

/** Pipetting workstation: plinth, carrier-loaded deck, gantry with a channel head, and a clear front shield. */
export function LiquidHandler({ w, d, h }: Size) {
  const deck = h * 0.3;
  const carriers = Math.max(2, Math.floor((w - 0.36) / TRACK_PITCH_M));
  const pitch = (w - 0.36) / carriers;
  return (
    <>
      <Shell at={[0, deck / 2, 0]} size={[w, deck, d]} color={TONE.panel} />
      <Box at={[0, deck + 0.004, 0]} size={[w - 0.16, 0.008, d - 0.1]} color={TONE.gray} metal={0.5} rough={0.4} />
      {Array.from({ length: carriers }, (_, column) => {
        const x = -w / 2 + 0.18 + pitch * (column + 0.5);
        return (
          <group key={column}>
            <Box at={[x, deck + 0.022, 0.02]} size={[pitch * 0.82, 0.028, d * 0.66]} color={TONE.steel} metal={0.5} />
            {Array.from({ length: DECK_PLATES }, (_, row) => (
              <MicroPlate key={row} at={[x, deck + 0.044, 0.02 + (row - 1) * d * 0.21]} color={column % 3 === 0 ? TONE.tipRack : TONE.plate} />
            ))}
          </group>
        );
      })}
      <Shell at={[0, h * 0.62, -d / 2 + 0.05]} size={[w, h * 0.76, 0.1]} color={TONE.panel} />
      <Shell at={[-w / 2 + 0.05, h * 0.62, 0]} size={[0.1, h * 0.76, d]} />
      <Shell at={[w / 2 - 0.05, h * 0.62, 0]} size={[0.1, h * 0.76, d]} />
      <Shell at={[0, h * 0.93, 0]} size={[w, h * 0.14, d]} />
      <Box at={[0, h * 0.85, d / 2 - 0.01]} size={[w * 0.96, 0.012, 0.012]} color="#4ea3ff" rough={0.2} />
      <Box at={[-w * 0.12, h * 0.78, 0]} size={[0.1, 0.1, d - 0.14]} color={TONE.dark} />
      <Box at={[-w * 0.12, h * 0.62, d * 0.1]} size={[0.13, h * 0.24, 0.13]} color={TONE.shell} />
      {Array.from({ length: CHANNELS }, (_, index) => (
        <Cylinder key={index} at={[-w * 0.12 - 0.05 + index * 0.0143, h * 0.44, d * 0.1]} radius={0.0035} length={h * 0.12} color={TONE.steel} />
      ))}
      <Box at={[0, h * 0.56, d / 2 - 0.004]} size={[w - 0.2, h * 0.56, 0.006]} color="#bfd8e4" rough={0.05} opacity={0.14} />
    </>
  );
}

const SLATS = 7;

/** Climate plate store: brushed door under a head unit with vents and a three-line readout. */
export function ClimateStore({ w, d, h, isCold = false }: Size & { isCold?: boolean }) {
  const head = Math.min(h * 0.24, 0.38);
  const body = h - head - 0.04;
  const readout = isCold ? "#6fc3ff" : "#ff4a3d";
  return (
    <>
      <Feet w={w} d={d} />
      <Shell at={[0, 0.04 + body / 2, 0]} size={[w, body, d]} />
      <Box at={[-w * 0.06, 0.04 + body / 2, d / 2 + 0.002]} size={[w * 0.68, body * 0.94, 0.006]} color="#c4c7c6" metal={0.2} rough={0.5} />
      <Box at={[w * 0.32, 0.04 + body / 2, d / 2 + 0.002]} size={[w * 0.22, body * 0.94, 0.006]} color="#a5a8a8" metal={0.2} rough={0.5} />
      <Shell at={[0, h - head / 2, 0.012]} size={[w, head, d + 0.024]} />
      {Array.from({ length: SLATS }, (_, index) => (
        <Box key={index} at={[-w * 0.14, h - head * 0.14 - index * head * (0.72 / SLATS), d / 2 + 0.025]} size={[w * 0.54, head * 0.05, 0.003]} color={TONE.dark} />
      ))}
      <Box at={[w * 0.28, h - head * 0.42, d / 2 + 0.025]} size={[w * 0.2, head * 0.62, 0.003]} color={TONE.black} />
      {[0.22, 0.42, 0.62].map((share) => (
        <Box key={share} at={[w * 0.28, h - head * share, d / 2 + 0.028]} size={[w * 0.13, head * 0.07, 0.002]} color={readout} />
      ))}
      <Box at={[w * 0.5 + 0.03, h * 0.5, 0]} size={[0.06, 0.02, d * 0.3]} color={TONE.gray} metal={0.5} />
    </>
  );
}

const SHELVES = 11;

/** Open plate hotel: two removable cassettes of plates either side of a lift. */
export function Hotel({ w, d, h }: Size) {
  const cassette = w * 0.42;
  return (
    <>
      <Shell at={[0, 0.04, 0]} size={[w, 0.08, d]} color={TONE.dark} />
      <Shell at={[0, h - 0.025, 0]} size={[w, 0.05, d]} color={TONE.dark} />
      <Box at={[0, h / 2, -d * 0.1]} size={[w * 0.1, h - 0.1, 0.05]} color={TONE.steel} metal={0.6} />
      {[-1, 1].map((side) => (
        <group key={side}>
          {[-1, 1].flatMap((end) => [-1, 1].map((edge) => (
            <Box key={`${end}:${edge}`} at={[side * w * 0.27 + edge * cassette * 0.5, h / 2, end * d * 0.4]} size={[0.012, h - 0.12, 0.012]} color={TONE.steel} metal={0.6} />
          )))}
          {Array.from({ length: SHELVES }, (_, index) => (
            <Box key={index} at={[side * w * 0.27, 0.12 + index * ((h - 0.2) / SHELVES), 0]} size={[cassette * 0.9, 0.014, d * 0.72]} color={index % 4 === 3 ? TONE.tipRack : TONE.plate} rough={0.3} />
          ))}
        </group>
      ))}
    </>
  );
}

/** Confocal imager: stepped optical casing, dark stage door, side ventilation. */
export function Imager({ w, d, h }: Size) {
  const lower = h * 0.58;
  return (
    <>
      <Feet w={w} d={d} />
      <Shell at={[0, lower / 2 + 0.01, 0]} size={[w, lower, d]} radius={0.018} />
      <Shell at={[0, lower + (h - lower) / 2, -d * 0.08]} size={[w * 0.92, h - lower, d * 0.74]} color={TONE.panel} radius={0.03} />
      <Box at={[0, lower * 0.6, d / 2 + 0.002]} size={[w * 0.66, lower * 0.5, 0.006]} color={TONE.dark} rough={0.25} />
      <Box at={[0, lower * 0.24, d / 2 + 0.002]} size={[w * 0.82, 0.008, 0.006]} color="#3f7fb5" />
      {[0.2, 0.3, 0.4, 0.5, 0.6].map((share) => (
        <Box key={share} at={[w / 2 + 0.001, lower * share + 0.06, 0]} size={[0.003, 0.012, d * 0.4]} color={TONE.dark} />
      ))}
    </>
  );
}

/** Machined two-position hand-off nest. */
export function Nest({ w, d, h }: Size) {
  return (
    <>
      <Box at={[0, h * 0.25, 0]} size={[w, h * 0.5, d]} color={TONE.gray} metal={0.65} rough={0.35} />
      {[-0.07, 0.07].map((z) => (
        <group key={z}>
          <Box at={[0, h * 0.56, z]} size={[0.146, h * 0.12, 0.1]} color={TONE.black} />
          <MicroPlate at={[0, h * 0.68, z]} />
        </group>
      ))}
    </>
  );
}
