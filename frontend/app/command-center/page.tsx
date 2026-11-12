import type { Metadata } from "next";
import { CommandCenter } from "@/components/site";

export const metadata: Metadata = {
  title: "Operations Console (Simulator)",
  description:
    "Hackathon simulator console for testing synthetic UPI transfers, sample webhook payloads, and local 5-signal risk scoring.",
};

// Reads window.location at render (webhook URL box) — render on demand, not at build.
export const dynamic = "force-dynamic";

export default function CommandCenterPage() {
  return <CommandCenter />;
}
