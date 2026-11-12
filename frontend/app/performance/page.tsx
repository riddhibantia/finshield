import type { Metadata } from "next";
import { Performance } from "@/components/site";

export const metadata: Metadata = {
  title: "Model Observatory (Offline ULB Benchmark)",
  description:
    "Offline XGBoost evaluation (ROC-AUC 0.9709) on the public ULB dataset plus synthetic stress-test results.",
};

export default function PerformancePage() {
  return <Performance />;
}
