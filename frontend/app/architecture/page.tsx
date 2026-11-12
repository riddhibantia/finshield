import type { Metadata } from "next";
import { Architecture } from "@/components/site";

export const metadata: Metadata = {
  title: "Prototype Architecture & 5-Signal Risk Engine",
  description:
    "How the hackathon prototype fuses five local signals, SHAP explainability, entity graph forensics, and PayPal Sandbox authorization gating.",
};

export default function ArchitecturePage() {
  return <Architecture />;
}
