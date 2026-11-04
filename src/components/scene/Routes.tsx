"use client";

import { Line } from "@react-three/drei";
import { useMemo } from "react";
import { planRoute, type Point } from "@/core/twin/routing";
import type { LabTwin } from "@/core/twin/schema";
import { railOf, toScene } from "./geometry";
import { SCENE } from "./palette";

const ROUTE_HEIGHT = 0.03;

type Path = { key: string; points: Point[] };

/** Every AMR dock-to-dock path, from the same router the simulator uses. */
const mobilePaths = (twin: LabTwin): Path[] =>
  twin.transports
    .filter((transport) => transport.kind === "amr")
    .flatMap((transport) =>
      transport.reach.slice(1).flatMap((stop) => {
        const leg = planRoute({ ...twin, transports: [transport] }, transport.reach[0] as string, stop)?.legs[0];
        return leg === undefined ? [] : [{ key: `${transport.id}-${stop}`, points: leg.path }];
      }),
    );

export function Routes({ twin, selectedId }: { twin: LabTwin; selectedId: string | null }) {
  const paths = useMemo(() => mobilePaths(twin), [twin]);
  const arms = twin.transports.filter((item) => item.kind === "arm");
  const selected = arms.find((item) => item.id === selectedId);
  const reach = selected ? twin.instruments.filter((item) => selected.reach.includes(item.id)) : [];
  return (
    <>
      {arms.map((arm) => {
        const { from, to } = railOf(twin, arm);
        return <Line key={arm.id} points={[toScene(from, 0.9), toScene(to, 0.9)]} color={SCENE.ink} lineWidth={1.4} />;
      })}
      {paths.map(({ key, points }) => (
        <Line key={key} points={points.map((point) => toScene(point, ROUTE_HEIGHT))} color={SCENE.accent} lineWidth={1} dashed dashSize={0.18} gapSize={0.14} transparent opacity={0.55} />
      ))}
      {selected
        ? reach.map((item) => (
            <Line key={item.id} points={[toScene({ x: item.x, y: selected.homeY }, 0.9), toScene(item, item.size.h)]} color={SCENE.accent} lineWidth={1} transparent opacity={0.7} />
          ))
        : null}
    </>
  );
}
