"use client";

import type { LabTwin } from "@/core/twin/schema";

const PAD = 1;

const extent = (twin: LabTwin) => ({
  w: Math.max(24, ...twin.zones.map((zone) => zone.bounds.x + zone.bounds.w)),
  h: Math.max(14, ...twin.zones.map((zone) => zone.bounds.y + zone.bounds.h)),
});

const stroke = (state: string, isSelected: boolean): string => {
  if (isSelected) return "var(--accent)";
  return state === "offline" ? "var(--crit)" : "var(--ink)";
};

type Props = { twin: LabTwin; selectedId: string | null; onSelect: (id: string | null) => void };

/** The same model without WebGL: every selectable entity is a real, keyboard-reachable control. */
export function PlanView({ twin, selectedId, onSelect }: Props) {
  const { w, h } = extent(twin);
  return (
    <svg className="plan" viewBox={`${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}`} role="group" aria-label="Plan view of the lab">
      {twin.zones.map((zone) => (
        <g key={zone.id}>
          <rect x={zone.bounds.x} y={zone.bounds.y} width={zone.bounds.w} height={zone.bounds.h} fill={zone.id === selectedId ? "var(--accent-dim)" : "var(--surface)"} stroke="var(--line-strong)" strokeWidth={0.04} />
          <text x={zone.bounds.x + 0.15} y={zone.bounds.y + 0.4} className="plan-zone">{zone.name}</text>
        </g>
      ))}
      {twin.doors.map((door) => (
        <g key={door.id}>
          <circle cx={door.x} cy={door.y} r={0.14} fill="var(--bg)" stroke="var(--warn)" strokeWidth={0.04} />
          <text x={door.x + 0.2} y={door.y - 0.14} className="plan-tag">{door.id} · {door.widthMm}</text>
        </g>
      ))}
      {twin.instruments.map((item) => (
        <g key={item.id} role="button" tabIndex={0} aria-label={item.name} className="plan-kit" onClick={() => onSelect(item.id)} onKeyDown={(event) => { if (event.key === "Enter") onSelect(item.id); }}>
          <rect x={item.x - item.size.w / 2} y={item.y - item.size.d / 2} width={item.size.w} height={item.size.d} fill="var(--surface-2)" stroke={stroke(item.state, item.id === selectedId)} strokeWidth={0.04} />
          <text x={item.x - item.size.w / 2} y={item.y + item.size.d / 2 + 0.26} className="plan-tag">{item.id}</text>
        </g>
      ))}
    </svg>
  );
}
