"use client";

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Segment } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { buildCloud, toScene, wallSegments, WALL_HEIGHT } from "./geometry";
import { InstrumentBody } from "./InstrumentBody";
import { SCENE } from "./palette";
import { Plates, Transports } from "./Playback";
import { Routes } from "./Routes";

export type SceneProps = {
  twin: LabTwin;
  segments?: readonly Segment[];
  selectedId?: string | null;
  touchedId?: string | null;
  showCloud?: boolean;
  showRoutes?: boolean;
  showLabels?: boolean;
  isScanning?: boolean;
  autoRotate?: boolean;
  interactive?: boolean;
  onSelect?: (id: string | null) => void;
};

function Cloud({ twin }: { twin: LabTwin }) {
  const geometry = useMemo(() => {
    const { positions, colors } = buildCloud(twin);
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    next.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return next;
  }, [twin]);
  return (
    <points geometry={geometry}>
      <pointsMaterial size={0.022} vertexColors transparent opacity={0.85} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function Walls({ twin }: { twin: LabTwin }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(wallSegments(twin), 3));
    return next;
  }, [twin]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={SCENE.ink} transparent opacity={0.34} />
    </lineSegments>
  );
}

function Floors({ twin, selectedId, onSelect }: Pick<SceneProps, "twin" | "selectedId" | "onSelect">) {
  return twin.zones.map((zone) => {
    const { x, y, w, h } = zone.bounds;
    const isSelected = zone.id === selectedId;
    return (
      <mesh
        key={zone.id}
        position={toScene({ x: x + w / 2, y: y + h / 2 }, 0.001)}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={onSelect ? (event) => { event.stopPropagation(); onSelect(zone.id); } : undefined}
      >
        <planeGeometry args={[w - 0.04, h - 0.04]} />
        <meshBasicMaterial color={isSelected ? SCENE.accent : "#14140f"} transparent opacity={isSelected ? 0.12 : 0.8} />
      </mesh>
    );
  });
}

function Doors({ twin, minDoorMm }: { twin: LabTwin; minDoorMm: number }) {
  return twin.doors.map((door) => (
    <mesh key={door.id} position={toScene(door, 2.1)}>
      <boxGeometry args={[0.16, 0.05, 0.16]} />
      <meshBasicMaterial color={door.widthMm < minDoorMm ? SCENE.warn : SCENE.dim} />
    </mesh>
  ));
}

function ZoneLabels({ twin }: { twin: LabTwin }) {
  return twin.zones.map((zone) => (
    <Html key={zone.id} position={toScene({ x: zone.bounds.x + 0.5, y: zone.bounds.y + 0.4 }, WALL_HEIGHT)} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
      <span className="scene-zone">{zone.name}</span>
    </Html>
  ));
}

const SWEEP_SPAN_M = 26;
const SWEEP_SECONDS = 5;

function Sweep() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current === null) return;
    ref.current.position.x = ((clock.elapsedTime % SWEEP_SECONDS) / SWEEP_SECONDS - 0.5) * SWEEP_SPAN_M;
  });
  return (
    <mesh ref={ref} position={[0, WALL_HEIGHT / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[16, WALL_HEIGHT + 0.6]} />
      <meshBasicMaterial color={SCENE.accent} transparent opacity={0.09} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

function Contents(props: SceneProps) {
  const { twin, segments, selectedId, touchedId, showCloud, showRoutes, showLabels, isScanning, onSelect } = props;
  const minDoorMm = Math.max(0, ...twin.transports.map((item) => item.minDoorMm ?? 0));
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[-8, 14, 6]} intensity={1.5} />
      <gridHelper args={[60, 60, "#22221d", "#171713"]} position={[0, -0.01, 0]} />
      <Floors twin={twin} selectedId={selectedId} onSelect={onSelect} />
      <Walls twin={twin} />
      <Doors twin={twin} minDoorMm={minDoorMm} />
      {showCloud ? <Cloud twin={twin} /> : null}
      {twin.instruments.map((item) => (
        <InstrumentBody
          key={item.id}
          item={item}
          segments={segments}
          isSelected={item.id === selectedId}
          isTouched={item.id === touchedId}
          showLabel={showLabels ?? false}
          onSelect={onSelect}
        />
      ))}
      {showLabels ? <ZoneLabels twin={twin} /> : null}
      {showRoutes ? <Routes twin={twin} selectedId={selectedId ?? null} /> : null}
      <Transports twin={twin} segments={segments} selectedId={selectedId ?? null} onSelect={onSelect} />
      {segments ? <Plates twin={twin} segments={segments} /> : null}
      {isScanning ? <Sweep /> : null}
    </>
  );
}

export default function LabScene(props: SceneProps) {
  const { autoRotate = false, interactive = true, onSelect } = props;
  return (
    <Canvas
      camera={{ position: [-13, 15, 17], fov: 38, near: 0.1, far: 200 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => onSelect?.(null)}
      aria-label="3D view of the lab digital twin"
    >
      <fog attach="fog" args={[SCENE.bg, 30, 62]} />
      <Contents {...props} />
      <OrbitControls
        enabled={interactive}
        enablePan={interactive}
        enableZoom={interactive}
        autoRotate={autoRotate}
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={6}
        maxDistance={46}
        target={[0, 0.4, 0]}
      />
    </Canvas>
  );
}
