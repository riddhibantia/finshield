import type { Metadata } from "next";
import { PayPalShield } from "@/components/paypal";

export const metadata: Metadata = {
  title: "PayPal Sandbox Fulfilment Shield (Prototype)",
  description:
    "PayPal Hackathon Prototype: buyer authorizes funds in PayPal Sandbox while FinShield scores five signals before digital fulfilment: auto-capture, OTP step-up, analyst review, or auto-void.",
};

export const dynamic = "force-dynamic";

export default function PayPalPage() {
  return <PayPalShield />;
}
