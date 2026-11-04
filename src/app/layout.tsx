import type { Metadata } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const martian = Martian_Mono({ subsets: ["latin"], variable: "--font-martian", display: "swap" });

export const metadata: Metadata = {
  title: "SDL — Compile your lab into a digital twin",
  description: "An AI agent reads your lab's records, builds a provenance-tracked digital twin, and simulates it.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${martian.variable}`}>
      <body>{children}</body>
    </html>
  );
}
