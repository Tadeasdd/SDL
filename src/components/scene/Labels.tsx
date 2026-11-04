"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import { Vector3 } from "three";
import type { LabTwin } from "@/core/twin/schema";
import { sceneOffset, toScene, WALL_HEIGHT } from "./geometry";
import { topOf } from "./layout";

const LABEL_LIFT_M = 0.24;

type Label = { id: string; text: string; at: [number, number, number]; className: string };

const shift = (at: [number, number, number], by: [number, number, number]): [number, number, number] => [at[0] + by[0], at[1], at[2] + by[2]];

export const buildLabels = (twin: LabTwin, selectedId: string | null): Label[] => {
  const offset = sceneOffset(twin);
  return [
  ...twin.zones.map((zone) => ({
    id: zone.id,
    text: zone.name,
    at: shift(toScene({ x: zone.bounds.x + zone.bounds.w / 2, y: zone.bounds.y + 0.3 }, WALL_HEIGHT), offset),
    className: "scene-zone",
  })),
  ...twin.instruments.map((item) => ({
    id: item.id,
    text: item.id,
    at: shift(toScene(item, topOf(item) + LABEL_LIFT_M), offset),
    className: `scene-tag${item.id === selectedId ? " is-selected" : ""}${item.state === "offline" ? " is-offline" : ""}`,
  })),
  ];
};

/** Plain DOM, positioned by LabelProjector. Living outside the Canvas keeps it out of the three.js reconciler. */
export function LabelLayer({ labels, root }: { labels: Label[]; root: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={root} className="scene-labels" aria-hidden>
      {labels.map(({ id, text, at, className }) => (
        <span key={id} className={className} data-at={at.join(",")}>{text}</span>
      ))}
    </div>
  );
}

const place = (element: HTMLElement, left: number, top: number, isVisible: boolean): void => {
  element.style.transform = `translate(-50%, -50%) translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
  element.style.visibility = isVisible ? "visible" : "hidden";
};

export function LabelProjector({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const point = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const nodes = root.current?.children;
    if (nodes === undefined) return;
    for (const node of nodes) {
      const element = node as HTMLElement;
      const [x = 0, y = 0, z = 0] = (element.dataset.at ?? "").split(",").map(Number);
      point.set(x, y, z).project(camera);
      const left = ((point.x + 1) / 2) * size.width;
      const top = ((1 - point.y) / 2) * size.height;
      place(element, left, top, point.z < 1);
    }
  });
  return null;
}
