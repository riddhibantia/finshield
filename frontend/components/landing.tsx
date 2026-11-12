"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { SiteNavbar, SourcePill } from "./chrome";

function CompoundCta({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="group inline-flex items-center focus-visible:outline-none">
      <span className="rounded-full bg-[#D7F46B] group-hover:bg-[#CCEC57] text-[#0D1611] px-7 py-3.5 text-[13.5px] font-medium tracking-[-0.01em] transition-colors shadow-[0_8px_24px_rgba(215,244,107,0.18)]">
        {label}
      </span>
      <span className="-ml-1.5 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white text-[#0D1611] shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4.5 11.5L11.5 4.5M11.5 4.5H5.5M11.5 4.5V10.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Link>
  );
}

function HeroAuthCard() {
  const [mode, setMode] = useState<"clean" | "void">("clean");
  const isClean = mode === "clean";

  return (
    <div className="relative flex flex-col items-center lg:items-end justify-center">
      {/* Subtle atmospheric glow matched cleanly behind card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-6 top-[44%] -translate-y-1/2 h-[240px] w-[300px] rounded-full blur-[64px] transition-colors duration-500"
        style={{
          background: isClean
            ? "radial-gradient(circle, rgba(61,130,90,0.34) 0%, rgba(215,244,107,0.1) 60%, transparent 100%)"
            : "radial-gradient(circle, rgba(185,68,52,0.3) 0%, rgba(30,48,38,0.24) 65%, transparent 100%)",
        }}
      />

      <div className="relative w-full max-w-[392px] space-y-3.5">
        {/* Clean Tactile Matte Authorization Card */}
        <div
          className="relative w-full aspect-[1.58/1] rounded-[20px] p-6 sm:p-7 flex flex-col justify-between border transition-colors duration-300 shadow-[0_28px_64px_rgba(4,10,7,0.48)]"
          style={{
            background: isClean
              ? "linear-gradient(135deg, #F2F5EE 0%, #E7EEE0 54%, #DCEAC2 100%)"
              : "linear-gradient(135deg, #1B2520 0%, #151D19 60%, #1E241E 100%)",
            borderColor: isClean ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.12)",
          }}
        >
          {/* Card Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className={`text-[15.5px] font-semibold tracking-[-0.02em] ${
                  isClean ? "text-[#111A15]" : "text-white"
                }`}
              >
                FinShield
              </div>
              <div
                className={`mt-0.5 text-[11px] font-medium ${
                  isClean ? "text-[#58655E]" : "text-[#9BB0A5]"
                }`}
              >
                Orders v2 Sandbox Hold
              </div>
            </div>
            <span
              className={`text-[11px] font-semibold tracking-[-0.01em] ${
                isClean ? "text-[#174A2B]" : "text-[#FF8A70]"
              }`}
            >
              {isClean ? "Low Risk" : "Critical Risk"}
            </span>
          </div>

          {/* Authorization Token */}
          <div className="my-auto pt-2">
            <div
              className={`text-[18px] sm:text-[20px] font-medium tracking-[0.06em] tabular-nums ${
                isClean ? "text-[#141F19]" : "text-[#F2F6F4]"
              }`}
            >
              {isClean ? "7KR0  ••••  ••••  844K" : "2L86  ••••  ••••  531F"}
            </div>
          </div>

          {/* Card Footer Metadata */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <div
                className={`text-[10px] font-medium ${
                  isClean ? "text-[#5B6861]" : "text-[#8FA097]"
                }`}
              >
                Gate Action
              </div>
              <div
                className={`mt-0.5 text-[13px] font-semibold tracking-[-0.01em] ${
                  isClean ? "text-[#121B16]" : "text-[#FF8A70]"
                }`}
              >
                {isClean ? "Auto-Capture · $42.00" : "Void Before Delivery · $4,800"}
              </div>
            </div>
            <div className="text-right">
              <div
                className={`text-[10px] font-medium ${
                  isClean ? "text-[#5B6861]" : "text-[#8FA097]"
                }`}
              >
                Score
              </div>
              <div
                className={`mt-0.5 text-[13px] font-semibold tabular-nums ${
                  isClean ? "text-[#121B16]" : "text-white"
                }`}
              >
                {isClean ? "0.037" : "0.890"}
              </div>
            </div>
          </div>
        </div>

        {/* Deliberate Switcher Positioned Cleanly Below Card */}
        <div className="flex items-center justify-between gap-3 px-1">
          <div
            className="inline-flex items-center rounded-full bg-white/[0.12] border border-white/15 p-1 text-[11.5px] font-medium backdrop-blur-sm"
            role="group"
            aria-label="Toggle sample sandbox authorization"
          >
            <button
              type="button"
              onClick={() => setMode("clean")}
              className={`rounded-full px-3 py-1 transition-colors cursor-pointer ${
                isClean ? "bg-[#D7F46B] text-[#0D1611]" : "text-[#D4DFD9] hover:text-white"
              }`}
            >
              Clean $42
            </button>
            <button
              type="button"
              onClick={() => setMode("void")}
              className={`rounded-full px-3 py-1 transition-colors cursor-pointer ${
                !isClean ? "bg-[#C53030] text-white" : "text-[#D4DFD9] hover:text-white"
              }`}
            >
              Flagged $4.8k
            </button>
          </div>

          <span className="text-[11.5px] font-medium text-[#E4ECE7]">
            Sample interactive preview
          </span>
        </div>
      </div>
    </div>
  );
}

const SAMPLE_SIGNALS = [
  { name: "XGBoost (ULB)", score: "0.92", pct: 92, high: true },
  { name: "Isolation Forest", score: "0.88", pct: 88, high: true },
  { name: "Policy Rules (8)", score: "0.75", pct: 75, high: true },
  { name: "Behavioral Drift", score: "0.64", pct: 64, high: false },
  { name: "Device Graph", score: "0.88", pct: 88, high: true },
];

const GATE_TIERS = [
  { band: "< 0.30", action: "Auto-Capture", note: "Release digital goods", cls: "text-[#174A2B]" },
  { band: "0.30 – 0.60", action: "OTP Step-Up", note: "Buyer code check", cls: "text-[#9A5B13]" },
  { band: "0.60 – 0.85", action: "Analyst Review", note: "Hold funds pending sign-off", cls: "text-[#9A5B13]" },
  { band: "≥ 0.85", action: "Auto-Void", note: "Release hold before delivery", cls: "text-[#B42318]" },
];

export function LandingPageView() {
  const [metrics, setMetrics] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    Promise.all([api.metrics(), api.health()])
      .then(([m, h]) => {
        setMetrics(m);
        setHealth(h);
      })
      .catch(() => {});
  }, []);

  const roc = metrics?.xgboost?.roc_auc ? metrics.xgboost.roc_auc.toFixed(3) : "0.971";
  const pr = metrics?.xgboost?.pr_auc ? metrics.xgboost.pr_auc.toFixed(3) : "0.842";
  const isLive = health?.adapter === "real";

  return (
    <div className="min-h-screen bg-white text-[#111814] font-sans antialiased">
      {/* ================= HERO + MISTY TRANSITION ================= */}
      <section className="fin-hero-atmosphere relative overflow-hidden">
        <div className="fin-hero-grid pointer-events-none absolute inset-x-0 top-0 h-[560px]" aria-hidden="true">
          <div className="mx-auto max-w-[1220px] h-full relative">
            <div className="absolute left-[224px] top-[56px] w-[56px] h-[56px] bg-white/[0.025]" />
            <div className="absolute left-[504px] top-[112px] w-[56px] h-[56px] bg-white/[0.025]" />
            <div className="absolute right-[168px] top-[56px] w-[56px] h-[56px] bg-white/[0.02]" />
          </div>
        </div>

        <SiteNavbar activePath="/" />

        <div className="relative z-10 max-w-[1220px] mx-auto px-6 md:px-10 pt-10 md:pt-14 pb-10 grid items-center gap-12 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="fin-fade-up">
            <h1 className="font-medium text-[38px] sm:text-[48px] lg:text-[52px] xl:text-[56px] leading-[1.08] tracking-[-0.035em] text-white">
              PayPal locks the funds.
              <br />
              FinShield decides what ships.
            </h1>
            <p className="mt-5 max-w-[475px] text-[14.5px] leading-[1.6] text-[#D4DFD9] font-normal">
              PayPal Hackathon prototype — score Orders v2 Sandbox authorizations across five local
              ML and graph signals, explain verdicts with SHAP, and gate digital delivery before capture.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <CompoundCta href="/paypal" label="Try sandbox demo" />
              <Link
                href="/agent"
                className="text-[13px] font-medium text-[#C8D4CD] hover:text-white transition-colors underline underline-offset-4 decoration-white/30 hover:decoration-white"
              >
                Open analyst agent
              </Link>
            </div>
          </div>

          <HeroAuthCard />
        </div>

        {/* Clean PayPal Hackathon Surface Row inside soft mist zone */}
        <div className="relative z-10 max-w-[1220px] mx-auto px-6 md:px-10 pt-8 pb-14">
          <p className="text-[12.5px] font-medium text-[#1D2822] mb-4">
            Hackathon Prototype Scope — PayPal Sandbox &amp; Simulator Flows
          </p>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-[13.5px] font-medium text-[#1E2A23]">
            <span className="inline-flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-[#003087]">
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M5.2 14.5H3.1L4.8 3.5H9.6C11.9 3.5 13.3 4.7 13 6.9C12.6 9.3 10.7 10.6 8.3 10.6H6.1L5.2 14.5Z" fill="#003087" />
                <path d="M7.6 15.5H5.7L7.1 6.7H11.1C13 6.7 14.2 7.7 13.9 9.5C13.6 11.5 12 12.5 10 12.5H8.3L7.6 15.5Z" fill="#0079C1" opacity="0.88" />
              </svg>
              <span>Pay</span>
              <span className="-ml-1.5 text-[#0079C1]">Pal</span>
              <span className="ml-0.5 text-[12.5px] font-semibold text-[#173525]">Sandbox</span>
            </span>
            <span className="text-[#6F7C75]" aria-hidden="true">·</span>
            <span>Orders v2 Hold</span>
            <span className="text-[#6F7C75]" aria-hidden="true">·</span>
            <span>OTP Step-Up</span>
            <span className="text-[#6F7C75]" aria-hidden="true">·</span>
            <span>Dispute Briefs</span>
            <span className="text-[#6F7C75]" aria-hidden="true">·</span>
            <span>Webhook &amp; UPI Simulator</span>
          </div>
        </div>
      </section>

      {/* ================= CLEAN STACK BAR ================= */}
      <section className="bg-white py-9 px-6">
        <div className="max-w-[1100px] mx-auto flex flex-wrap items-center justify-center gap-x-9 gap-y-3 text-[13.5px] font-medium text-[#7C8781]">
          <span className="text-[#111814] font-semibold tracking-[-0.015em]">Core stack</span>
          <span>XGBoost</span>
          <span>Isolation Forest</span>
          <span>SHAP</span>
          <span>NetworkX</span>
          <span>FastAPI</span>
          <span>Next.js</span>
        </div>
      </section>

      {/* ================= 3-CARD CAPABILITIES SECTION (REAL PRODUCT SPECIMENS) ================= */}
      <section className="bg-white pt-6 pb-20 px-6 md:px-10 max-w-[1220px] mx-auto">
        <div className="text-center max-w-[660px] mx-auto">
          <h2 className="text-[32px] sm:text-[40px] md:text-[44px] font-medium leading-[1.1] tracking-[-0.035em] text-[#111814]">
            Inspect Every Authorization
            <br />
            Before Digital Fulfilment
          </h2>
          <p className="mt-4 max-w-[520px] mx-auto text-[14px] leading-[1.6] text-[#606A65]">
            Each PayPal Sandbox hold passes through calibrated ML scoring, deterministic threshold
            gating, and a human approval queue before digital goods ship.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Real 5-Signal Breakdown Specimen */}
          <div className="rounded-[20px] bg-[#F5F6F5] border border-[#E7EBE8] p-6 flex flex-col justify-between gap-6">
            <div>
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-[#111814]">
                5-Signal Risk Fusion
              </h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-[#5A645F]">
                Combines supervised ML, outlier detection, personal habits, 8 hard rules, and shared
                device cliques into one calibrated score.
              </p>
            </div>

            <div className="border-t border-[#E2E6E3] pt-4 space-y-2.5">
              {SAMPLE_SIGNALS.map((sig) => (
                <div key={sig.name} className="space-y-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-[#2A3530]">{sig.name}</span>
                    <span className="tabular-nums font-semibold text-[#111814]">{sig.score}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#E3E7E5] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${sig.pct}%`,
                        backgroundColor: sig.high ? "#B42318" : "#173525",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Real Gate Threshold Specimen */}
          <div className="rounded-[20px] bg-[#F5F6F5] border border-[#E7EBE8] p-6 flex flex-col justify-between gap-6">
            <div>
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-[#111814]">
                Fulfilment Gate Control
              </h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-[#5A645F]">
                Routes PayPal Sandbox authorizations by risk band before digital fulfilment —
                capturing clean orders and voiding fraud cleanly.
              </p>
            </div>

            <div className="border-t border-[#E2E6E3] pt-2 divide-y divide-[#E4E8E5]">
              {GATE_TIERS.map((tier) => (
                <div key={tier.band} className="py-2.5 flex items-center justify-between gap-3 text-[12px]">
                  <div>
                    <div className={`font-semibold ${tier.cls}`}>{tier.action}</div>
                    <div className="text-[#66706B]">{tier.note}</div>
                  </div>
                  <span className="mono text-[11.5px] font-medium text-[#2A3530] tabular-nums shrink-0">
                    {tier.band}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Real SHAP & Human Approval Specimen */}
          <div className="rounded-[20px] bg-[#F5F6F5] border border-[#E7EBE8] p-6 flex flex-col justify-between gap-6">
            <div>
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-[#111814]">
                SHAP &amp; Analyst Guardrail
              </h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-[#5A645F]">
                Every scored order exposes local SHAP feature weights while money-moving proposals
                wait in a human sign-off queue.
              </p>
            </div>

            <div className="border-t border-[#E2E6E3] pt-4 space-y-3 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-[#5A645F]">Top SHAP drivers</span>
                <span className="font-semibold text-[#B42318] tabular-nums">+0.520 combined</span>
              </div>
              <div className="space-y-1.5 text-[12px] text-[#2A3530]">
                <div className="flex items-center justify-between">
                  <span>amount_deviation (39.5×)</span>
                  <span className="tabular-nums font-medium text-[#B42318]">+0.280</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>velocity_5m (7 txns)</span>
                  <span className="tabular-nums font-medium text-[#B42318]">+0.240</span>
                </div>
              </div>
              <div className="pt-2.5 border-t border-[#E4E8E5] flex items-center justify-between gap-2">
                <span className="font-medium text-[#111814]">Proposed: Void Auth</span>
                <span className="rounded-full bg-[#FEF5E6] text-[#9A5B13] px-2.5 py-0.5 text-[11px] font-medium">
                  Needs Approval
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= WHY POST-AUTHORIZATION + OFFLINE ULB BENCHMARKS ================= */}
      <section className="bg-white pb-20 px-6 md:px-10 max-w-[1220px] mx-auto">
        <div className="grid gap-10 lg:grid-cols-12 items-start">
          <div className="lg:col-span-6">
            <h2 className="text-[26px] md:text-[32px] font-medium leading-[1.18] tracking-[-0.03em] text-[#111814]">
              Checkout catches stolen cards upfront. Digital merchants still face a post-authorization gap.
            </h2>
            <div className="mt-7 divide-y divide-[#EAEDEB] border-t border-[#EAEDEB]">
              {[
                {
                  title: "Friendly fraud on digital goods",
                  body: "When a buyer downloads digital content and later disputes the charge, merchants need structured evidence tied directly to fulfilment.",
                },
                {
                  title: "Using PayPal authorization holds",
                  body: "Because Orders v2 lets merchants lock funds before capture, this prototype evaluates device novelty and spending drift prior to delivery.",
                },
                {
                  title: "Grounded evidence trails",
                  body: "Velocity bursts, device clusters, and SHAP factor contributions are compiled automatically into dispute briefs.",
                },
              ].map((item) => (
                <div key={item.title} className="py-4">
                  <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-[#111814]">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[13.5px] leading-[1.6] text-[#5A645F]">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 rounded-[20px] bg-[#F5F6F5] border border-[#E7EBE8] p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-[#111814]">
                Offline ML Benchmark (ULB Dataset)
              </h3>
              <SourcePill source={isLive ? "LIVE_MODEL" : "DEMO_FALLBACK"} />
            </div>
            <p className="mt-1.5 text-[12.5px] text-[#5A645F]">
              Public ULB dataset · 284,807 rows · 0.17% fraud · zero-leakage stratified split
            </p>

            {/* Flat hairline-divided metric pair instead of nested shadow boxes */}
            <div className="mt-5 rounded-[14px] bg-white border border-[#E3E7E5] grid grid-cols-2 divide-x divide-[#E3E7E5]">
              <div className="p-5 text-center">
                <div className="text-[30px] font-semibold tracking-tight text-[#111814] tabular-nums">
                  {roc}
                </div>
                <div className="mt-1 text-[12px] font-medium text-[#5A645F]">ROC-AUC</div>
              </div>
              <div className="p-5 text-center">
                <div className="text-[30px] font-semibold tracking-tight text-[#111814] tabular-nums">
                  {pr}
                </div>
                <div className="mt-1 text-[12px] font-medium text-[#5A645F]">PR-AUC</div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-[#5A645F]">
              <span>
                <strong className="font-semibold text-[#111814] tabular-nums">8</strong> policy rules
              </span>
              <span>
                <strong className="font-semibold text-[#111814] tabular-nums">36</strong> features
              </span>
              <span>
                <strong className="font-semibold text-[#111814] tabular-nums">5</strong> fused signals
              </span>
              <span>
                <strong className="font-semibold text-[#111814]">MIT</strong> license
              </span>
            </div>

            <div className="mt-5 pt-4 border-t border-[#E2E6E3] flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/performance"
                className="text-[13px] font-medium text-[#173525] hover:underline underline-offset-4"
              >
                Open Model Observatory →
              </Link>
              <Link
                href="/architecture"
                className="text-[13px] font-medium text-[#5A645F] hover:text-[#111814] transition-colors"
              >
                Prototype Architecture →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================= GUARDRAIL CALLOUT BANNER ================= */}
      <section className="bg-white pb-20 px-6 md:px-10 max-w-[1220px] mx-auto">
        <div className="fin-guardrail-banner relative overflow-hidden rounded-[24px] px-6 py-12 md:px-12 md:py-16 text-center border border-[#1E3327]">
          <div className="fin-hero-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-[28px] sm:text-[36px] font-medium leading-[1.14] tracking-[-0.03em] text-white">
              The copilot never sets the score.
              <br />
              The agent never moves money alone.
            </h2>
            <p className="mt-4 text-[13.5px] leading-[1.65] text-[#C8D4CD] max-w-xl mx-auto">
              In this prototype, the analyst copilot inspects flagged sandbox orders and drafts
              dispute evidence from SHAP and device-graph trails — while every capture, void, or
              refund pauses in a human approval queue.
            </p>
            <div className="mt-7 flex justify-center">
              <CompoundCta href="/agent" label="Test analyst approval queue" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
