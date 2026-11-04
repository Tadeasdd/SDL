"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Segment } from "@/core/sim/types";
import type { LabTwin, Transport } from "@/core/twin/schema";
import { usePlayback } from "../console/playback";
import { Box, Cylinder, Shell, TONE } from "./bodies/parts";
import { railOf, toScene } from "./geometry";
import { BENCH_HEIGHT } from "./layout";
import { locate } from "./motion";
import { SCENE } from "./palette";

const UPPER_ARM_M = 0.425;
const FOREARM_M = 0.392;
const ARM_TONE = "#c8d2d6";
const ARM_CAP = "#5d8fa8";
const POSE_EASE = 0.14;
const HEADING_EASE = 0.2;
const MIN_STEP_M = 1e-4;
const TUCKED = { shoulder: 0.25, elbow: 2.1, wrist: 0.75 };
const REACHING = { shoulder: 0.95, elbow: 1.05, wrist: 1.1 };

export function Rail({ twin, arm }: { twin: LabTwin; arm: Transport }) {
  const { from, to } = railOf(twin, arm);
  const length = to.x - from.x;
  const center = toScene({ x: (from.x + to.x) / 2, y: from.y }, 0);
  const posts = Math.max(2, Math.ceil(length / 1.6));
  return (
    <group position={center}>
      <Box at={[0, BENCH_HEIGHT - 0.06, 0]} size={[length + 0.4, 0.08, 0.2]} color={TONE.steel} metal={0.7} rough={0.35} />
      <Box at={[0, BENCH_HEIGHT - 0.012, 0]} size={[length + 0.36, 0.016, 0.06]} color={TONE.dark} metal={0.5} />
      {Array.from({ length: posts + 1 }, (_, index) => (
        <Box key={index} at={[(index / posts - 0.5) * length, (BENCH_HEIGHT - 0.1) / 2, 0]} size={[0.07, BENCH_HEIGHT - 0.1, 0.07]} color={TONE.gray} metal={0.6} />
      ))}
    </group>
  );
}

const Joint = ({ radius, length }: { radius: number; length: number }) => (
  <Cylinder at={[0, 0, 0]} radius={radius} length={length} rotation={[0, 0, Math.PI / 2]} color={ARM_CAP} metal={0.15} rough={0.4} />
);

const Link = ({ length, radius }: { length: number; radius: number }) => (
  <Cylinder at={[0, length / 2, 0]} radius={radius} length={length} color={ARM_TONE} metal={0.2} rough={0.35} />
);

type Pose = { yaw: number; shoulder: number; elbow: number; wrist: number };

/** Six-axis collaborative arm on a carriage. Rendered at its real 850 mm reach. */
function ArmBody({ pose }: { pose: React.RefObject<Pose> }) {
  const yaw = useRef<THREE.Group>(null);
  const shoulder = useRef<THREE.Group>(null);
  const elbow = useRef<THREE.Group>(null);
  const wrist = useRef<THREE.Group>(null);
  useFrame(() => {
    if (yaw.current === null || shoulder.current === null || elbow.current === null || wrist.current === null) return;
    const { current } = pose;
    yaw.current.rotation.y = current.yaw;
    shoulder.current.rotation.x = current.shoulder;
    elbow.current.rotation.x = current.elbow;
    wrist.current.rotation.x = current.wrist;
  });
  return (
    <group position={[0, BENCH_HEIGHT, 0]}>
      <Shell at={[0, 0.03, 0]} size={[0.34, 0.06, 0.3]} color={TONE.dark} />
      <Cylinder at={[0, 0.1, 0]} radius={0.075} length={0.09} color={ARM_TONE} metal={0.2} />
      <group ref={yaw} position={[0, 0.16, 0]}>
        <Cylinder at={[0, 0, 0]} radius={0.062} length={0.08} color={ARM_CAP} metal={0.15} />
        <group ref={shoulder} position={[0, 0.03, 0]}>
          <Joint radius={0.066} length={0.14} />
          <Link length={UPPER_ARM_M} radius={0.046} />
          <group ref={elbow} position={[0, UPPER_ARM_M, 0]}>
            <Joint radius={0.052} length={0.12} />
            <Link length={FOREARM_M} radius={0.036} />
            <group ref={wrist} position={[0, FOREARM_M, 0]}>
              <Joint radius={0.04} length={0.1} />
              <Cylinder at={[0, 0.05, 0]} radius={0.034} length={0.1} color={ARM_CAP} metal={0.15} />
              <Box at={[0, 0.11, 0]} size={[0.14, 0.02, 0.05]} color={TONE.dark} />
              <Box at={[-0.066, 0.145, 0]} size={[0.012, 0.05, 0.05]} color={TONE.steel} metal={0.6} />
              <Box at={[0.066, 0.145, 0]} size={[0.012, 0.05, 0.05]} color={TONE.steel} metal={0.6} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

/** Differential-drive transport base with a plate rack on the load surface. Real footprint 800 x 580 x 300 mm. */
function AmrBody({ color }: { color: string }) {
  return (
    <>
      <Shell at={[0, 0.165, 0]} size={[0.8, 0.27, 0.58]} color="#4a4f52" radius={0.04} />
      <Box at={[0, 0.056, 0]} size={[0.74, 0.05, 0.52]} color={TONE.black} />
      <Box at={[0.401, 0.2, 0]} size={[0.004, 0.02, 0.44]} color={color} />
      <Box at={[-0.401, 0.2, 0]} size={[0.004, 0.02, 0.44]} color={color} />
      <Box at={[0, 0.31, 0]} size={[0.36, 0.02, 0.28]} color={TONE.steel} metal={0.6} />
    </>
  );
}

function Technician({ color }: { color: string }) {
  return (
    <>
      <mesh position={[0, 0.82, 0]} castShadow>
        <capsuleGeometry args={[0.17, 0.92, 4, 14]} />
        <meshStandardMaterial color="#e9edef" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.115, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </>
  );
}

const eased = (from: number, to: number, share: number): number => from + (to - from) * share;

function Mover({ twin, transport, timeline, isSelected, onSelect }: {
  twin: LabTwin;
  transport: Transport;
  timeline: readonly Segment[];
  isSelected: boolean;
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const pose = useRef<Pose>({ yaw: 0, ...TUCKED });
  const previous = useRef({ x: transport.homeX, y: transport.homeY });
  const home = { x: transport.homeX, y: transport.homeY };
  const rail = useMemo(() => (transport.kind === "arm" ? railOf(twin, transport) : null), [twin, transport]);

  useFrame(() => {
    if (ref.current === null) return;
    const { t } = usePlayback.getState();
    const point = locate(timeline, t, () => home) ?? home;
    const place = rail === null ? point : { x: Math.min(rail.to.x, Math.max(rail.from.x, point.x)), y: rail.from.y };
    ref.current.position.set(...toScene(place));

    if (rail !== null) {
      const job = timeline.find((segment) => segment.start <= t && t < segment.end);
      const end = job?.path?.[job.path.length - 1];
      const target = job === undefined ? TUCKED : REACHING;
      const { current } = pose;
      current.shoulder = eased(current.shoulder, target.shoulder, POSE_EASE);
      current.elbow = eased(current.elbow, target.elbow, POSE_EASE);
      current.wrist = eased(current.wrist, target.wrist, POSE_EASE);
      if (end !== undefined) current.yaw = eased(current.yaw, end.y < rail.from.y ? Math.PI : 0, POSE_EASE);
      return;
    }

    const step = { x: point.x - previous.current.x, y: point.y - previous.current.y };
    previous.current = point;
    if (spin.current === null || Math.hypot(step.x, step.y) < MIN_STEP_M) return;
    const heading = Math.atan2(-step.y, step.x);
    const turn = Math.atan2(Math.sin(heading - spin.current.rotation.y), Math.cos(heading - spin.current.rotation.y));
    spin.current.rotation.y += turn * HEADING_EASE;
  });

  const color = isSelected ? SCENE.accent : SCENE.ink;
  const select = onSelect ? (event: { stopPropagation: () => void }) => { event.stopPropagation(); onSelect(transport.id); } : undefined;
  return (
    <group ref={ref} position={toScene(home)} onClick={select}>
      {transport.kind === "arm" ? <ArmBody pose={pose} /> : null}
      <group ref={spin}>
        {transport.kind === "amr" ? <AmrBody color={isSelected ? SCENE.accent : "#6fa8ff"} /> : null}
        {transport.kind === "human" ? <Technician color={isSelected ? SCENE.accent : "#b89a80"} /> : null}
      </group>
      {isSelected ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.6, 40]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ) : null}
    </group>
  );
}

export function Transports({ twin, segments, selectedId, onSelect }: {
  twin: LabTwin;
  segments?: readonly Segment[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
}) {
  const timelines = useMemo(() => {
    const moves = (segments ?? []).filter((segment) => segment.kind === "move");
    return new Map(twin.transports.map((item) => [item.id, moves.filter((segment) => segment.resourceId === item.id)]));
  }, [segments, twin]);
  return (
    <>
      {twin.transports.filter((item) => item.kind === "arm").map((arm) => <Rail key={`rail-${arm.id}`} twin={twin} arm={arm} />)}
      {twin.transports.map((transport) => (
        <Mover key={transport.id} twin={twin} transport={transport} timeline={timelines.get(transport.id) ?? []} isSelected={transport.id === selectedId} onSelect={onSelect} />
      ))}
    </>
  );
}
