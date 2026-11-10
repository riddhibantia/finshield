import type { Metadata } from "next";
import { PayPalShield } from "@/components/paypal";

export const metadata: Metadata = {
  title: "FinShield Fulfilment Shield for PayPal",
  description:
    "PayPal locks the funds, FinShield decides before the digital good is delivered: auto-capture, OTP step-up, analyst review, or auto-void.",
};

export const dynamic = "force-dynamic";

export default function PayPalPage() {
  return <PayPalShield />;
}
