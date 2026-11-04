"use client";

import { create } from "zustand";

/** Kept apart from the console store: this changes every frame and must not re-render panels. */
type PlaybackState = {
  t: number;
  duration: number;
  playing: boolean;
  rate: number;
  load: (duration: number) => void;
  seek: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  setRate: (rate: number) => void;
  tick: (deltaS: number) => void;
};

export const RATES = [300, 900, 2700] as const;

export const usePlayback = create<PlaybackState>((set) => ({
  t: 0,
  duration: 0,
  playing: false,
  rate: RATES[1],
  load: (duration) => set({ duration, t: 0, playing: true }),
  seek: (t) => set((state) => ({ t: Math.min(Math.max(t, 0), state.duration) })),
  setPlaying: (playing) => set({ playing }),
  setRate: (rate) => set({ rate }),
  tick: (deltaS) =>
    set((state) => {
      if (!state.playing) return state;
      const t = state.t + deltaS * state.rate;
      return t >= state.duration ? { t: state.duration, playing: false } : { t };
    }),
}));
