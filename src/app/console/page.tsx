import type { Metadata } from "next";
import { Console } from "@/components/console/Console";
import { loadExampleDocs } from "@/lib/load-example";
import "./console.css";

export const metadata: Metadata = { title: "SDL Console" };

export default function ConsolePage() {
  return <Console docs={loadExampleDocs()} />;
}
