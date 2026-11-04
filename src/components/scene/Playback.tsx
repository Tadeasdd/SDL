"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Segment } from "@/core/sim/types";
import type { Point } from "@/core/twin/routing";
import type { LabTwin, Transport } from "@/core/twin/schema";
import { usePlayback } from "../console/playback";
import { pointAlong, toScene } from "./geometry";
import { SCENE, seriesColor } from "./palette";

const endOf = (segment: Segment, anchor: (id: string) => Point): Point => {
  const path = segment.path;
  return path === undefined ? anchor(segment.resourceId) : (path[path.length - 1] as Point);
};

/** Where a timeline puts something at time t, or null before its first segment. */
const locate = (timeline: readonly Segment[], t: number, anchor: (id: string) => Point): Point | null => {
  let last: Segment | null = null;
  for (const segment of timeline) {
    if (segment.start > t) break;
    last = segment;
  }
  if (last === null) return null;
  if (last.path === undefined || t >= last.end) return endOf(last, anchor);
  return pointAlong(last.path, (t - last.start) / Math.max(last.end - last.start, 1e-6));
};

const PLATE_SIZE: [number, number, number] = [0.2, 0.05, 0.14];

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
  const heights = useMemo(() => new Map(twin.instruments.map((item) => [item.id, item.size.h])), [twin]);
  const anchors = useMemo(() => new Map(twin.instruments.map((item) => [item.id, { x: item.x, y: item.y }])), [twin]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const target = mesh.current;
    if (target === null) return;
    plates.forEach((timeline, index) => {
      target.setColorAt(index, new THREE.Color(seriesColor(timeline[0]?.workflowId ?? "")));
    });
    if (target.instanceColor !== null) target.instanceColor.needsUpdate = true;
  }, [plates]);

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
        const height = current?.kind === "move" ? 1.15 : (heights.get(current?.resourceId ?? "") ?? 1) + 0.06;
        dummy.position.set(...toScene(point, height));
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
      <meshBasicMaterial />
    </instancedMesh>
  );
}

const RAIL_Y = 4;

function Mover({ transport, timeline, isSelected, onSelect }: {
  transport: Transport;
  timeline: readonly Segment[];
  isSelected: boolean;
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const home = { x: transport.homeX, y: transport.homeY };

  useFrame(() => {
    if (ref.current === null) return;
    const point = locate(timeline, usePlayback.getState().t, () => home) ?? home;
    const place = transport.kind === "arm" ? { x: Math.min(11, Math.max(1.5, point.x)), y: RAIL_Y } : point;
    ref.current.position.set(...toScene(place));
  });

  const color = isSelected ? SCENE.accent : SCENE.ink;
  const select = onSelect ? (event: { stopPropagation: () => void }) => { event.stopPropagation(); onSelect(transport.id); } : undefined;
  return (
    <group ref={ref} position={toScene(home)} onClick={select}>
      {transport.kind === "arm" ? (
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[0.5, 0.26, 0.42]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ) : null}
      {transport.kind === "amr" ? (
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.3, 24]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ) : null}
      {transport.kind === "human" ? (
        <mesh position={[0, 0.85, 0]}>
          <capsuleGeometry args={[0.16, 1.2, 4, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} />
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
  return twin.transports.map((transport) => (
    <Mover key={transport.id} transport={transport} timeline={timelines.get(transport.id) ?? []} isSelected={transport.id === selectedId} onSelect={onSelect} />
  ));
}
