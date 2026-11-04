"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { EXAMPLE_CONFIG } from "@/core/example-config";
import { simulate } from "@/core/sim/engine";
import type { LabTwin } from "@/core/twin/schema";
import { usePlayback } from "../console/playback";

const LabScene = dynamic(() => import("../scene/LabScene"), { ssr: false });

const HERO_RATE = 420;
const LOOP_START_S = 5000;

const subscribeNever = () => () => undefined;
const prefersMotion = (): boolean => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Runs the real simulator in the browser so the plates in the hero are not an animation loop. */
export function HeroScene({ twin }: { twin: LabTwin }) {
  const result = useMemo(() => simulate(twin, EXAMPLE_CONFIG), [twin]);
  const canRotate = useSyncExternalStore(subscribeNever, prefersMotion, () => false);

  useEffect(() => {
    const { load, setRate, seek, setPlaying } = usePlayback.getState();
    load(result.makespanS);
    setRate(HERO_RATE);
    seek(LOOP_START_S);
    if (!prefersMotion()) {
      setPlaying(false);
      return;
    }
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const playback = usePlayback.getState();
      playback.tick(Math.min((now - last) / 1000, 0.1));
      last = now;
      if (!usePlayback.getState().playing) {
        seek(LOOP_START_S);
        setPlaying(true);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [result]);

  return <LabScene twin={twin} segments={result.segments} showCloud showRoutes autoRotate={canRotate} interactive={false} cameraPosition={[-10, 13, 17]} />;
}
