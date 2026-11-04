"use client";

import { RoundedBox } from "@react-three/drei";

export const TONE = {
  shell: "#e6e5e0",
  panel: "#cfcfca",
  steel: "#a9adae",
  gray: "#7c7f80",
  dark: "#2c2e30",
  black: "#141516",
  plate: "#dfe7ea",
  tipRack: "#3b4148",
} as const;

export type Size = { w: number; d: number; h: number };
type Vec = [number, number, number];

type BoxProps = { at: Vec; size: Vec; color?: string; rough?: number; metal?: number; opacity?: number };

/** A plain box, centred on `at`. Bodies are drawn with the front on +z and the origin at the base. */
export function Box({ at, size, color = TONE.shell, rough = 0.55, metal = 0, opacity = 1 }: BoxProps) {
  return (
    <mesh position={at} castShadow={opacity === 1} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

const MAX_RADIUS_SHARE = 0.25;

/** A moulded casing with softened edges. */
export function Shell({ at, size, color = TONE.shell, rough = 0.42, radius = 0.014 }: BoxProps & { radius?: number }) {
  return (
    <RoundedBox args={size} position={at} radius={Math.min(radius, Math.min(...size) * MAX_RADIUS_SHARE)} smoothness={3} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={rough} />
    </RoundedBox>
  );
}

type CylinderProps = { at: Vec; radius: number; length: number; color?: string; rotation?: Vec; metal?: number; rough?: number };

export function Cylinder({ at, radius, length, color = TONE.steel, rotation = [0, 0, 0], metal = 0.3, rough = 0.45 }: CylinderProps) {
  return (
    <mesh position={at} rotation={rotation} castShadow>
      <cylinderGeometry args={[radius, radius, length, 20]} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} />
    </mesh>
  );
}

const FOOT_INSET_M = 0.03;

export function Feet({ w, d }: { w: number; d: number }) {
  const x = w / 2 - FOOT_INSET_M;
  const z = d / 2 - FOOT_INSET_M;
  return ([[x, z], [-x, z], [x, -z], [-x, -z]] as const).map(([px, pz]) => (
    <Cylinder key={`${px}:${pz}`} at={[px, 0.006, pz]} radius={0.012} length={0.012} color={TONE.black} />
  ));
}

/** An SBS microplate on a tray. The real footprint is 128 x 85 mm. */
export function MicroPlate({ at, color = TONE.plate }: { at: Vec; color?: string }) {
  return <Box at={at} size={[0.128, 0.014, 0.085]} color={color} rough={0.3} />;
}
