"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Segment } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { usePlayback } from "../console/playback";
import { toScene } from "./geometry";
import { dockOf, type Dock } from "./layout";
import { dockBlend, locate } from "./motion";
import { seriesColor } from "./palette";

/** Slightly larger than a real 128 x 85 mm plate, so it can be followed from the overview camera. */
const PLATE_SIZE: [number, number, number] = [0.17, 0.03, 0.12];
const ARM_CARRY_M = 1.3;
const AMR_CARRY_M = 0.36;

const keyOf = (x: number, y: number): string => `${x}:${y}`;
const mix = (from: number, to: number, share: number): number => from + (to - from) * share;

export function Plates({ twin, segments }: { twin: LabTwin; segments: readonly Segment[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const plates = useMemo(() => {
    const byPlate = new Map<number, Segment[]>();
    for (const segment of segments) {
      if (segment.kind === "wait") continue;
      byPlate.set(segment.plateId, [...(byPlate.get(segment.plateId) ?? []), segment]);
    }
    return [...byPlate.values()];
  }, [segments]);
  const anchors = useMemo(() => new Map(twin.instruments.map((item) => [item.id, { x: item.x, y: item.y }])), [twin]);
  const docks = useMemo(() => new Map(twin.instruments.map((item) => [keyOf(item.x, item.y), dockOf(twin, item)])), [twin]);
  const kinds = useMemo(() => new Map(twin.transports.map((item) => [item.id, item])), [twin]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const target = mesh.current;
    if (target === null) return;
    plates.forEach((timeline, index) => {
      target.setColorAt(index, new THREE.Color(seriesColor(timeline[0]?.workflowId ?? "", twin.workflows[0]?.id)));
    });
    if (target.instanceColor !== null) target.instanceColor.needsUpdate = true;
  }, [plates, twin]);

  /** Arm legs ride the rail between docks. AMR and walked legs stay on their route. */
  const placeInFlight = (move: Segment, point: { x: number; y: number }, t: number): void => {
    const path = move.path ?? [];
    const share = (t - move.start) / Math.max(move.end - move.start, 1e-6);
    const first = path[0];
    const last = path[path.length - 1];
    const near: Dock | undefined = first && last ? docks.get(share < 0.5 ? keyOf(first.x, first.y) : keyOf(last.x, last.y)) : undefined;
    const carrier = kinds.get(move.resourceId);
    const isArm = carrier?.kind === "arm";
    const blend = dockBlend(share);
    const carry = isArm ? ARM_CARRY_M : AMR_CARRY_M;
    const y = isArm && near ? mix(carrier.homeY, near.y, blend) : point.y;
    dummy.position.set(...toScene({ x: point.x, y }, mix(carry, near?.height ?? carry, blend)));
  };

  useFrame(() => {
    const target = mesh.current;
    if (target === null) return;
    const { t } = usePlayback.getState();
    plates.forEach((timeline, index) => {
      const final = timeline[timeline.length - 1] as Segment;
      const point = t >= final.end ? null : locate(timeline, t, (id) => anchors.get(id) ?? { x: 0, y: 0 });
      if (point === null) {
        dummy.scale.setScalar(0);
      } else {
        const current = timeline.find((segment) => segment.start <= t && t < segment.end);
        const dock = docks.get(keyOf(point.x, point.y));
        if (current?.kind === "move" && current.path !== undefined) {
          placeInFlight(current, point, t);
        } else if (dock !== undefined) {
          dummy.position.set(...toScene(dock, dock.height));
        } else {
          dummy.position.set(...toScene(point, 1));
        }
        dummy.scale.setScalar(1);
      }
      dummy.updateMatrix();
      target.setMatrixAt(index, dummy.matrix);
    });
    target.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh key={plates.length} ref={mesh} args={[undefined, undefined, Math.max(1, plates.length)]} frustumCulled={false}>
      <boxGeometry args={PLATE_SIZE} />
      <meshStandardMaterial roughness={0.35} />
    </instancedMesh>
  );
}
