import type { Metadata } from "next";
import { AgentConsole } from "@/components/paypal";

export const metadata: Metadata = {
  title: "Analyst Agent (Prototype) — Human Approval Queue",
  description:
    "Hackathon prototype copilot that inspects flagged sandbox authorizations and proposes capture, void, refund, and dispute briefs. A human approves anything that moves funds.",
};

export const dynamic = "force-dynamic";

export default function AgentPage() {
  return <AgentConsole />;
}
