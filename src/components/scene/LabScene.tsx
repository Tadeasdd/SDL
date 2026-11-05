"use client";

import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Segment } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { buildCloud, sceneOffset, SITE, toScene, wallSegments, WALL_HEIGHT } from "./geometry";
import { InstrumentBody } from "./InstrumentBody";
import { closeViewOf, facingOf } from "./layout";
import { buildLabels, LabelLayer, LabelProjector } from "./Labels";
import { SCENE } from "./palette";
import { Plates } from "./Playback";
import { Transports } from "./Robots";
import { Fittings, Shell as RoomShell } from "./Room";
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
  /** Present only while editing: instruments can then be dragged. */
  onMove?: (id: string, x: number, y: number) => void;
  cameraPosition?: [number, number, number];
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
      <pointsMaterial size={0.03} vertexColors transparent opacity={0.95} depthWrite={false} sizeAttenuation />
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
      <lineBasicMaterial color={SCENE.ink} transparent opacity={0.5} />
    </lineSegments>
  );
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

const SHADOW_SPAN_M = 16;

function Lights() {
  return (
    <>
      <ambientLight intensity={0.16} />
      <directionalLight
        position={[-6, 15, 7]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-SHADOW_SPAN_M}
        shadow-camera-right={SHADOW_SPAN_M}
        shadow-camera-top={SHADOW_SPAN_M}
        shadow-camera-bottom={-SHADOW_SPAN_M}
      />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={0.85} position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[24, 12, 1]} />
        <Lightformer intensity={0.55} position={[-12, 3, 6]} rotation={[0, Math.PI / 2, 0]} scale={[14, 5, 1]} />
        <Lightformer intensity={0.4} color="#bcd4ff" position={[12, 3, -6]} rotation={[0, -Math.PI / 2, 0]} scale={[14, 5, 1]} />
      </Environment>
    </>
  );
}

function Contents(props: SceneProps & { onGrab?: (id: string) => void }) {
  const { twin, segments, selectedId, touchedId, showCloud, showRoutes, isScanning, onSelect, onGrab } = props;
  const minDoorMm = Math.max(0, ...twin.transports.map((item) => item.minDoorMm ?? 0));
  return (
    <>
      <Lights />
      <gridHelper args={[60, 60, "#22221d", "#171713"]} position={[0, -0.01, 0]} />
      <RoomShell twin={twin} selectedId={selectedId} minDoorMm={minDoorMm} onSelect={onSelect} />
      <Walls twin={twin} />
      <Fittings twin={twin} />
      {showCloud ? <Cloud twin={twin} /> : null}
      {twin.instruments.map((item) => (
        <InstrumentBody
          key={item.id}
          item={item}
          facing={facingOf(twin, item)}
          segments={segments}
          isSelected={item.id === selectedId}
          isTouched={item.id === touchedId}
          onSelect={onSelect}
          onGrab={onGrab}
        />
      ))}
      {showRoutes ? <Routes twin={twin} selectedId={selectedId ?? null} /> : null}
      <Transports twin={twin} segments={segments} selectedId={selectedId ?? null} onSelect={onSelect} />
      {segments ? <Plates twin={twin} segments={segments} /> : null}
      {isScanning ? <Sweep /> : null}
    </>
  );
}

const FLY_EASE = 0.09;
const FLY_DONE_M = 0.01;


/** Sits left of centre: the automation bay is what people come to see. */
const OVERVIEW_TARGET: [number, number, number] = [-4.2, 0.4, -3];

type Controls = { target: THREE.Vector3; update: () => void };
type Flight = { camera: THREE.Vector3; target: THREE.Vector3 };

/** Flies to the selected instrument, then lets go, so orbiting and zooming still belong to the user. */
function CameraRig({ twin, selectedId, overview }: { twin: LabTwin; selectedId?: string | null; overview: [number, number, number] }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as Controls | null;
  const flight = useRef<Flight | null>(null);
  const isClose = useRef(false);

  useEffect(() => {
    const item = twin.instruments.find(({ id }) => id === selectedId);
    if (item === undefined) {
      if (isClose.current) flight.current = { camera: new THREE.Vector3(...overview), target: new THREE.Vector3(...OVERVIEW_TARGET) };
      isClose.current = false;
      return;
    }
    const shift = sceneOffset(twin);
    const { centre, offset } = closeViewOf(twin, item);
    const [x, y, z] = toScene(item, centre);
    const target = new THREE.Vector3(x + shift[0], y, z + shift[2]);
    flight.current = { camera: target.clone().add(new THREE.Vector3(...offset)), target };
    isClose.current = true;
  }, [twin, selectedId, overview]);

  useFrame(() => {
    const goal = flight.current;
    if (goal === null || controls === null) return;
    camera.position.lerp(goal.camera, FLY_EASE);
    controls.target.lerp(goal.target, FLY_EASE);
    controls.update();
    if (camera.position.distanceTo(goal.camera) < FLY_DONE_M) flight.current = null;
  });
  return null;
}

const SNAP_M = 0.05;
const snap = (value: number): number => Math.round(value / SNAP_M) * SNAP_M;

/** Follows the pointer on the floor plane. Listens on the window so a fast drag cannot slip off a mesh. */
function DragController({ twin, dragId, onMove, onEnd }: { twin: LabTwin; dragId: string | null; onMove: (id: string, x: number, y: number) => void; onEnd: () => void }) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    if (dragId === null) return;
    const shift = sceneOffset(twin);
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    const hit = new THREE.Vector3();
    const item = twin.instruments.find(({ id }) => id === dragId);
    let grabbed: { x: number; y: number } | null = null;
    const move = (event: PointerEvent): void => {
      const box = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1), camera);
      if (ray.ray.intersectPlane(floor, hit) === null) return;
      const planX = hit.x - shift[0] + SITE.x;
      const planY = hit.z - shift[2] + SITE.y;
      // The pointer meets the floor some way from the instrument. Keeping that offset stops it jumping on grab.
      grabbed ??= { x: planX - (item?.x ?? planX), y: planY - (item?.y ?? planY) };
      onMove(dragId, snap(planX - grabbed.x), snap(planY - grabbed.y));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onEnd);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onEnd);
    };
    // The twin changes on every move, but the offset comes from its rooms, which a drag cannot change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId, camera, canvas, onMove, onEnd]);
  return null;
}

export default function LabScene(props: SceneProps) {
  const { twin, selectedId, showLabels = false, autoRotate = false, interactive = true, onSelect, onMove, cameraPosition = [-11.5, 13, 9.5] } = props;
  const labelRoot = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const endDrag = useMemo(() => () => setDragId(null), []);
  const grab = useMemo(() => (id: string) => { onSelect?.(id); setDragId(id); }, [onSelect]);
  const labels = useMemo(() => (showLabels ? buildLabels(twin, selectedId ?? null) : []), [showLabels, twin, selectedId]);
  return (
    <div className="scene">
      <Canvas
        camera={{ position: cameraPosition, fov: 38, near: 0.1, far: 200 }}
        dpr={[1, 2]}
        shadows="percentage"
        gl={{ antialias: true, alpha: true }}
        // A drag ends away from the mesh it started on, which would otherwise read as a click on nothing.
        onPointerMissed={() => { if (onMove === undefined) onSelect?.(null); }}
        aria-label="3D view of the lab digital twin"
      >
        <fog attach="fog" args={[SCENE.bg, 38, 80]} />
        <group position={sceneOffset(twin)}><Contents {...props} onGrab={onMove ? grab : undefined} /></group>
        {onMove ? <DragController twin={twin} dragId={dragId} onMove={onMove} onEnd={endDrag} /> : null}
        <LabelProjector root={labelRoot} />
        {interactive && onMove === undefined ? <CameraRig twin={twin} selectedId={selectedId} overview={cameraPosition} /> : null}
        <OrbitControls
          makeDefault
          enabled={interactive && dragId === null}
          enablePan={interactive}
          enableZoom={interactive}
          autoRotate={autoRotate}
          autoRotateSpeed={0.5}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={1.2}
          maxDistance={60}
          target={OVERVIEW_TARGET}
        />
      </Canvas>
      <LabelLayer labels={labels} root={labelRoot} />
    </div>
  );
}
