"use client";

import { useMemo } from "react";
import type { LabTwin, Zone } from "@/core/twin/schema";
import { Box, Cylinder, TONE } from "./bodies/parts";
import { toScene } from "./geometry";
import { BENCH_HEIGHT, benchesOf, wallRunsOf, type Bench, type WallRun } from "./layout";
import { SCENE } from "./palette";

const CUTAWAY_WALL_M = 0.5;
const WALL_THICKNESS_M = 0.09;
const BENCH_TOP_M = 0.04;
const LEG_M = 0.05;
const LEG_PITCH_M = 1.6;

const FLOOR_TONE: Record<Zone["kind"], string> = {
  automation: "#3a3d3e",
  wet: "#3c4140",
  imaging: "#2f3134",
  cold: "#39424a",
  storage: "#38372f",
  corridor: "#2b2c2b",
  office: "#413a31",
};

function WallPiece({ run }: { run: WallRun }) {
  const dx = run.to.x - run.from.x;
  const dy = run.to.y - run.from.y;
  const at = toScene({ x: (run.from.x + run.to.x) / 2, y: (run.from.y + run.to.y) / 2 }, CUTAWAY_WALL_M / 2);
  return <Box at={at} size={[Math.abs(dx) + WALL_THICKNESS_M, CUTAWAY_WALL_M, Math.abs(dy) + WALL_THICKNESS_M]} color="#b9b8b1" rough={0.8} />;
}

type ShellProps = { twin: LabTwin; selectedId?: string | null; minDoorMm: number; onSelect?: (id: string | null) => void };

/** Floors, walls cut away at waist height so the kit stays visible, and each door's clear opening. */
export function Shell({ twin, selectedId, minDoorMm, onSelect }: ShellProps) {
  const runs = useMemo(() => wallRunsOf(twin), [twin]);
  return (
    <>
      {twin.zones.map((zone) => {
        const { x, y, w, h } = zone.bounds;
        return (
          <mesh
            key={zone.id}
            position={toScene({ x: x + w / 2, y: y + h / 2 }, 0.001)}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
            onClick={onSelect ? (event) => { event.stopPropagation(); onSelect(zone.id); } : undefined}
          >
            <planeGeometry args={[w, h]} />
            <meshStandardMaterial color={zone.id === selectedId ? "#55632a" : FLOOR_TONE[zone.kind]} roughness={0.62} />
          </mesh>
        );
      })}
      {runs.map((run) => <WallPiece key={`${run.from.x}:${run.from.y}:${run.to.x}:${run.to.y}`} run={run} />)}
      {twin.doors.map((door) => (
        <mesh key={door.id} position={toScene(door, 0.012)} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[door.widthMm / 2000, 32]} />
          <meshBasicMaterial color={door.widthMm < minDoorMm ? SCENE.warn : SCENE.dim} transparent opacity={0.28} />
        </mesh>
      ))}
    </>
  );
}

function BenchBody({ bench }: { bench: Bench }) {
  const legs = Math.max(1, Math.ceil(bench.w / LEG_PITCH_M));
  return (
    <group position={toScene(bench)}>
      <Box at={[0, BENCH_HEIGHT - BENCH_TOP_M / 2, 0]} size={[bench.w, BENCH_TOP_M, bench.d]} color="#55585a" rough={0.5} />
      <Box at={[0, 0.2, 0]} size={[bench.w - 0.1, 0.03, bench.d - 0.1]} color={TONE.gray} metal={0.5} />
      {Array.from({ length: legs + 1 }, (_, index) =>
        [-1, 1].map((side) => (
          <Box
            key={`${index}:${side}`}
            at={[(index / legs - 0.5) * (bench.w - LEG_M * 2), (BENCH_HEIGHT - BENCH_TOP_M) / 2, side * (bench.d / 2 - LEG_M)]}
            size={[LEG_M, BENCH_HEIGHT - BENCH_TOP_M, LEG_M]}
            color={TONE.steel}
            metal={0.7}
            rough={0.35}
          />
        )),
      )}
    </group>
  );
}

const SHELF_LEVELS = [0.35, 0.85, 1.35, 1.85];

function ShelfUnit({ x, y, length }: { x: number; y: number; length: number }) {
  return (
    <group position={toScene({ x, y })}>
      {SHELF_LEVELS.map((level) => <Box key={level} at={[0, level, 0]} size={[length, 0.025, 0.45]} color={TONE.steel} metal={0.5} />)}
      {[-1, 1].flatMap((end) => [-1, 1].map((side) => (
        <Box key={`${end}:${side}`} at={[end * (length / 2 - 0.02), 1, side * 0.2]} size={[0.03, 2, 0.03]} color={TONE.gray} metal={0.6} />
      )))}
      {SHELF_LEVELS.map((level, index) => (
        <Box key={`stock-${level}`} at={[(index % 2 === 0 ? -0.2 : 0.2) * length, level + 0.12, 0]} size={[length * 0.45, 0.22, 0.36]} color={index % 2 === 0 ? "#b7a98c" : "#d4d6d4"} rough={0.8} />
      ))}
    </group>
  );
}

const DESK_PITCH_M = 2.4;

function Desk({ x, y }: { x: number; y: number }) {
  return (
    <group position={toScene({ x, y })}>
      <Box at={[0, 0.72, 0]} size={[1.5, 0.035, 0.72]} color="#8a7a63" rough={0.6} />
      {[-0.7, 0.7].map((side) => <Box key={side} at={[side, 0.36, 0]} size={[0.04, 0.72, 0.65]} color={TONE.dark} />)}
      <Box at={[0, 1.02, -0.2]} size={[0.56, 0.33, 0.02]} color={TONE.black} rough={0.25} />
      <Box at={[0, 0.82, -0.2]} size={[0.05, 0.16, 0.05]} color={TONE.dark} />
      <Cylinder at={[0, 0.48, 0.62]} radius={0.21} length={0.06} color={TONE.dark} metal={0} rough={0.7} />
      <Box at={[0, 0.78, 0.82]} size={[0.4, 0.55, 0.05]} color={TONE.dark} rough={0.7} />
    </group>
  );
}

const fittingsOf = (zone: Zone) => {
  const { x, y, w, h } = zone.bounds;
  if (zone.kind === "storage" || zone.kind === "cold") {
    return zone.kind === "storage"
      ? [<ShelfUnit key="a" x={x + w / 2} y={y + 0.5} length={w - 0.8} />, <ShelfUnit key="b" x={x + w / 2} y={y + h - 0.9} length={w - 0.8} />]
      : [<ShelfUnit key="a" x={x + w / 2} y={y + h - 0.45} length={w - 0.8} />];
  }
  if (zone.kind === "office") {
    const desks = Math.max(1, Math.floor((w - 1) / DESK_PITCH_M));
    return Array.from({ length: desks }, (_, index) => <Desk key={index} x={x + 1.4 + index * DESK_PITCH_M} y={y + h / 2 + 0.3} />);
  }
  return [];
};

/** Benches under the kit, plus shelving and desks from each room's kind. */
export function Fittings({ twin }: { twin: LabTwin }) {
  const benches = useMemo(() => benchesOf(twin), [twin]);
  return (
    <>
      {benches.map((bench) => <BenchBody key={bench.id} bench={bench} />)}
      {twin.zones.map((zone) => <group key={zone.id}>{fittingsOf(zone)}</group>)}
    </>
  );
}
