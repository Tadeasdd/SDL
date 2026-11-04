"use client";

import type { Instrument } from "@/core/twin/schema";
import { Centrifuge, Dispenser, Generic, Peeler, Reader, Sealer, Thermocycler } from "./benchtop";
import { ClimateStore, Hotel, Imager, LiquidHandler, Nest } from "./large";

/**
 * One procedural body per instrument class, drawn to the size in the twin, so a mapped lab
 * looks right whatever it contains. Proportions follow real instruments. No logos are drawn.
 */
export function BodyOf({ item }: { item: Instrument }) {
  const { size, category, capabilities } = item;
  switch (category) {
    case "plate-reader": return <Reader {...size} />;
    case "liquid-handler": return <LiquidHandler {...size} />;
    case "dispenser":
    case "washer": return <Dispenser {...size} />;
    case "sealer": return <Sealer {...size} />;
    case "peeler": return <Peeler {...size} />;
    case "centrifuge": return <Centrifuge {...size} />;
    case "thermocycler": return <Thermocycler {...size} />;
    case "incubator": return <ClimateStore {...size} />;
    case "imager": return <Imager {...size} />;
    case "storage":
      if (capabilities.includes("cold-store")) return <ClimateStore {...size} isCold />;
      if (capabilities.includes("handoff")) return <Nest {...size} />;
      return <Hotel {...size} />;
    default: return <Generic {...size} />;
  }
}
