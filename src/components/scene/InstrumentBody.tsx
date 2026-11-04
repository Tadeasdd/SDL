"use client";

import { Edges, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, MeshBasicMaterial } from "three";
import type { Segment } from "@/core/sim/types";
import type { Instrument } from "@/core/twin/schema";
import { usePlayback } from "../console/playback";
import { toScene } from "./geometry";
import { SCENE } from "./palette";

const GROW_RATE = 0.12;

const edgeColor = (item: Instrument, isSelected: boolean, isTouched: boolean): string => {
  if (isSelected || isTouched) return SCENE.accent;
  if (item.state === "offline") return SCENE.crit;
  if (item.provenance.status !== "confirmed") return SCENE.warn;
  return SCENE.ink;
};

type Props = {
  item: Instrument;
  segments?: readonly Segment[];
  isSelected: boolean;
  isTouched: boolean;
  showLabel: boolean;
  onSelect?: (id: string) => void;
};

export function InstrumentBody({ item, segments, isSelected, isTouched, showLabel, onSelect }: Props) {
  const group = useRef<Group>(null);
  const light = useRef<MeshBasicMaterial>(null);
  const { w, d, h } = item.size;
  const jobs = useMemo(
    () => (segments ?? []).filter((segment) => segment.kind === "process" && segment.resourceId === item.id),
    [segments, item.id],
  );

  useFrame(() => {
    const body = group.current;
    if (body !== null && body.scale.y < 1) body.scale.y = Math.min(1, body.scale.y + GROW_RATE);
    if (light.current === null) return;
    const { t } = usePlayback.getState();
    const active = jobs.filter((job) => job.start <= t && t < job.end).length;
    light.current.opacity = active === 0 ? 0 : 0.35 + 0.65 * Math.min(1, active / item.capacity);
  });

  return (
    <group
      ref={group}
      position={toScene(item)}
      scale={[1, 0.02, 1]}
      onClick={onSelect ? (event) => { event.stopPropagation(); onSelect(item.id); } : undefined}
    >
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={SCENE.body} roughness={0.7} transparent opacity={item.state === "offline" ? 0.35 : 0.92} />
        <Edges color={edgeColor(item, isSelected, isTouched)} threshold={15} />
      </mesh>
      <mesh position={[0, h + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 0.82, d * 0.82]} />
        <meshBasicMaterial ref={light} color={SCENE.accent} transparent opacity={0} />
      </mesh>
      {showLabel ? (
        <Html position={[0, h + 0.22, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
          <span className={`scene-tag${isSelected ? " is-selected" : ""}${item.state === "offline" ? " is-offline" : ""}`}>{item.id}</span>
        </Html>
      ) : null}
    </group>
  );
}
