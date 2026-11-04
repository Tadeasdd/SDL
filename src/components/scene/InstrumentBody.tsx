"use client";

import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Mesh, type Group, type Material, type MeshBasicMaterial } from "three";
import type { Segment } from "@/core/sim/types";
import type { Instrument } from "@/core/twin/schema";
import { usePlayback } from "../console/playback";
import { BodyOf } from "./bodies";
import { toScene } from "./geometry";
import { mountOf } from "./layout";
import { SCENE } from "./palette";

const GROW_RATE = 0.12;
const OFFLINE_OPACITY = 0.3;
const IDLE_LIGHT = 0.18;

const edgeColor = (item: Instrument, isSelected: boolean, isTouched: boolean): string | null => {
  if (isSelected || isTouched) return SCENE.accent;
  if (item.state === "offline") return SCENE.crit;
  if (item.provenance.status !== "confirmed") return SCENE.warn;
  return null;
};

/** A unit that is away for repair reads as a ghost of itself. Keeps each material's own base opacity. */
const applyGhost = (root: Group, factor: number): void => {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const material = node.material as Material;
    const base = (material.userData.baseOpacity ??= material.opacity) as number;
    material.opacity = base * factor;
    material.transparent = material.opacity < 1;
    material.needsUpdate = true;
  });
};

type Props = {
  item: Instrument;
  facing: 1 | -1;
  segments?: readonly Segment[];
  isSelected: boolean;
  isTouched: boolean;
  onSelect?: (id: string) => void;
};

export function InstrumentBody({ item, facing, segments, isSelected, isTouched, onSelect }: Props) {
  const group = useRef<Group>(null);
  const shell = useRef<Group>(null);
  const light = useRef<MeshBasicMaterial>(null);
  const { w, d, h } = item.size;
  const isOffline = item.state === "offline";
  const jobs = useMemo(
    () => (segments ?? []).filter((segment) => segment.kind === "process" && segment.resourceId === item.id),
    [segments, item.id],
  );
  const edge = edgeColor(item, isSelected, isTouched);

  useLayoutEffect(() => {
    if (shell.current !== null) applyGhost(shell.current, isOffline ? OFFLINE_OPACITY : 1);
  }, [isOffline]);

  useFrame(() => {
    const body = group.current;
    if (body !== null && body.scale.y < 1) body.scale.y = Math.min(1, body.scale.y + GROW_RATE);
    if (light.current === null) return;
    const { t } = usePlayback.getState();
    const active = jobs.filter((job) => job.start <= t && t < job.end).length;
    light.current.opacity = active === 0 ? IDLE_LIGHT : 0.45 + 0.55 * Math.min(1, active / item.capacity);
  });

  return (
    <group
      ref={group}
      position={toScene(item, mountOf(item))}
      rotation={[0, facing < 0 ? Math.PI : 0, 0]}
      scale={[1, 0.02, 1]}
      onClick={onSelect ? (event) => { event.stopPropagation(); onSelect(item.id); } : undefined}
    >
      <group ref={shell}><BodyOf item={item} /></group>
      <mesh position={[w * 0.36, h * 0.9, d / 2 + 0.03]}>
        <boxGeometry args={[Math.min(w * 0.14, 0.06), 0.012, 0.004]} />
        <meshBasicMaterial ref={light} color={isOffline ? SCENE.crit : SCENE.accent} transparent opacity={IDLE_LIGHT} />
      </mesh>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w + 0.03, h + 0.03, d + 0.03]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        {edge === null ? null : <Edges color={edge} threshold={15} />}
      </mesh>
    </group>
  );
}
