import type { Metadata } from "next";
import { AgentConsole } from "@/components/paypal";

export const metadata: Metadata = {
  title: "FinShield Analyst Agent — human in the loop",
  description:
    "The agent investigates flagged PayPal transactions and proposes capture, void, refund and dispute-evidence actions. A human approves anything that touches money.",
};

export const dynamic = "force-dynamic";

export default function AgentPage() {
  return <AgentConsole />;
}
