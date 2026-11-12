"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect
        x="4.5"
        y="6.5"
        width="6.5"
        height="17"
        rx="3.25"
        transform="rotate(24 7.75 15)"
        fill="#FFFFFF"
      />
      <rect
        x="14.5"
        y="5.5"
        width="6.5"
        height="17"
        rx="3.25"
        transform="rotate(24 17.75 14)"
        fill="#D7F46B"
      />
    </svg>
  );
}

const NAV_ITEMS = [
  { label: "Overview", href: "/" },
  { label: "Sandbox Demo", href: "/paypal" },
  { label: "Analyst Agent", href: "/agent" },
  { label: "Console", href: "/command-center" },
  { label: "Benchmarks", href: "/performance" },
];

export function SiteNavbar({ activePath = "/" }: { activePath?: string }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="relative z-20 max-w-[1220px] mx-auto px-6 md:px-10 pt-6 pb-4">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <BrandMark size={24} />
          <span className="text-[18px] font-semibold tracking-[-0.025em] text-white">
            FinShield
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-1 rounded-full bg-white/[0.06] border border-white/[0.09] px-1.5 py-1.5 backdrop-blur-md"
        >
          {NAV_ITEMS.map((item) => {
            const active = activePath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "font-medium text-white bg-white/[0.11]"
                    : "font-normal text-[#A2AEA7] hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/paypal"
            className="hidden sm:inline-flex items-center rounded-full bg-[#D7F46B] hover:bg-[#CBEB54] text-[#0D1611] px-5 py-2.5 text-[13px] font-medium tracking-[-0.01em] transition-colors shadow-[0_4px_16px_rgba(215,244,107,0.16)]"
          >
            Try Sandbox Demo
          </Link>
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] border border-white/15 text-white cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              {mobileMenuOpen ? (
                <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M3 5.5h12M3 9h12M3 12.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden mt-3 rounded-[18px] bg-[#0F1B15]/95 border border-white/10 p-3 backdrop-blur-md space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`block rounded-xl px-4 py-2.5 text-[13.5px] font-medium ${
                activePath === item.href
                  ? "bg-white/[0.12] text-white"
                  : "text-[#C8D4CD] hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

export function SubpageHero({
  activePath,
  title,
  subtitle,
  rightSlot,
  backHref,
  backLabel,
}: {
  activePath: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <section className="fin-subpage-atmosphere relative overflow-hidden">
      <div className="fin-hero-grid pointer-events-none absolute inset-x-0 top-0 h-[260px]" aria-hidden="true" />
      <SiteNavbar activePath={activePath} />
      <div className="relative z-10 max-w-[1220px] mx-auto px-6 md:px-10 pt-5 pb-12">
        {backHref && backLabel && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#C0CEC6] hover:text-white transition-colors mb-3"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 12.5L5.5 8 10 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{backLabel}</span>
          </Link>
        )}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-[30px] sm:text-[38px] font-medium leading-[1.12] tracking-[-0.03em] text-white">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2.5 max-w-2xl text-[14px] leading-[1.6] text-[#D5E1DB]">
                {subtitle}
              </p>
            )}
          </div>
          {rightSlot && <div className="flex flex-wrap items-center gap-2.5">{rightSlot}</div>}
        </div>
      </div>
    </section>
  );
}

export function RiskPill({ level }: { level?: string | null }) {
  const l = (level || "LOW").toUpperCase();
  const cls =
    l === "CRITICAL" || l === "HIGH"
      ? "bg-[#FDECEC] text-[#B42318]"
      : l === "MEDIUM"
      ? "bg-[#FEF5E6] text-[#9A5B13]"
      : "bg-[#E8F3EB] text-[#174A2B]";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${cls}`}>
      {l === "CRITICAL" ? "Critical" : l === "HIGH" ? "High" : l === "MEDIUM" ? "Medium" : "Low"}
    </span>
  );
}

export function StatusPill({ status }: { status?: string | null }) {
  if (!status) return null;
  const s = status.toUpperCase();
  const map: Record<string, { label: string; cls: string }> = {
    CAPTURED: { label: "Captured", cls: "bg-[#E8F3EB] text-[#174A2B]" },
    APPROVED: { label: "Approved", cls: "bg-[#E8F3EB] text-[#174A2B]" },
    EXECUTED: { label: "Executed", cls: "bg-[#E8F3EB] text-[#174A2B]" },
    VOIDED: { label: "Voided", cls: "bg-[#FDECEC] text-[#B42318]" },
    FAILED: { label: "Failed", cls: "bg-[#FDECEC] text-[#B42318]" },
    REJECTED: { label: "Rejected", cls: "bg-[#FDECEC] text-[#B42318]" },
    HELD_STEP_UP: { label: "OTP Step-Up", cls: "bg-[#FEF5E6] text-[#9A5B13]" },
    HELD_REVIEW: { label: "Needs Review", cls: "bg-[#FEF5E6] text-[#9A5B13]" },
    PENDING: { label: "Pending Review", cls: "bg-[#FEF5E6] text-[#9A5B13]" },
    REFUNDED: { label: "Refunded", cls: "bg-[#EBF4F6] text-[#0F5E6B]" },
    AUTHORIZED: { label: "Authorized", cls: "bg-[#F2F4F3] text-[#2A3530]" },
    ORDER_CREATED: { label: "Created", cls: "bg-[#F2F4F3] text-[#5A645F]" },
    CANCELLED: { label: "Cancelled", cls: "bg-[#F2F4F3] text-[#5A645F]" },
  };
  const info = map[s] || { label: status, cls: "bg-[#F2F4F3] text-[#5A645F]" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${info.cls}`}>
      {info.label}
    </span>
  );
}

export function SourcePill({ source, dark = false }: { source?: string; dark?: boolean }) {
  const isLlm = source === "LIVE_LLM";
  const isLive = source === "LIVE_MODEL" || isLlm;
  const darkLabel = isLlm ? "Connected LLM" : isLive ? "Local ML Engine" : "Offline Simulation";
  const lightLabel = isLlm ? "Connected LLM" : isLive ? "Local ML Engine" : "Offline Fallback";
  if (dark) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium border backdrop-blur-sm ${
          isLive
            ? "bg-white/[0.09] border-white/15 text-[#D7F46B]"
            : "bg-white/[0.08] border-white/15 text-[#FDE68A]"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-[#D7F46B]" : "bg-[#FCD34D]"}`} />
        {darkLabel}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${
        isLive ? "bg-[#E8F3EB] text-[#174A2B]" : "bg-[#FEF5E6] text-[#9A5B13]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-[#174A2B]" : "bg-[#9A5B13]"}`} />
      {lightLabel}
    </span>
  );
}

export function Tip({ label, text, dark = false }: { label: ReactNode; text: string; dark?: boolean }) {
  return (
    <span className="tip" tabIndex={0}>
      <span className="tip-dots">{label}</span>
      <span className="tip-box" style={dark ? { background: "#F5F6F5", color: "#111814" } : undefined}>
        {text}
      </span>
    </span>
  );
}

export function SiteFooter({ flush = false }: { flush?: boolean }) {
  return (
    <footer className={`tellnova-footer ${flush ? "" : "mt-16"} pt-14 pb-10 px-6 md:px-10 relative overflow-hidden`}>
      <div className="max-w-[1220px] mx-auto relative z-10 space-y-10">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div className="space-y-3 max-w-sm">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <BrandMark size={22} />
              <span className="font-semibold tracking-[-0.02em] text-lg text-white">FinShield</span>
            </Link>
            <p className="text-[13px] text-[#96A29B] leading-relaxed">
              PayPal Hackathon Prototype: post-authorization fulfilment shield combining 5-signal ML
              fusion (XGBoost, Isolation Forest, deterministic rules, behavioral profiling, NetworkX
              graph) with SHAP explainability and human approval gates.
            </p>
          </div>

          <div className="flex flex-wrap gap-12">
            <div>
              <div className="text-[12px] font-semibold text-[#D7F46B] mb-3">Prototype</div>
              <ul className="space-y-2 text-[13px]">
                <li><Link href="/paypal" className="text-[#A4B0A9] hover:text-white transition-colors">PayPal Sandbox Demo</Link></li>
                <li><Link href="/agent" className="text-[#A4B0A9] hover:text-white transition-colors">Analyst Agent</Link></li>
                <li><Link href="/command-center" className="text-[#A4B0A9] hover:text-white transition-colors">Operations Console</Link></li>
                <li><Link href="/performance" className="text-[#A4B0A9] hover:text-white transition-colors">Model Observatory</Link></li>
                <li><Link href="/architecture" className="text-[#A4B0A9] hover:text-white transition-colors">Architecture</Link></li>
                <li><Link href="/glossary" className="text-[#A4B0A9] hover:text-white transition-colors">Plain-English Glossary</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-[#D7F46B] mb-3">Engine &amp; Privacy</div>
              <ul className="space-y-2 text-[13px]">
                <li><Link href="/privacy/U-00001" className="text-[#A4B0A9] hover:text-white transition-colors">Tokenized Identity</Link></li>
                <li><span className="text-[#7E8B83]">XGBoost 0.971 ROC-AUC (ULB)</span></li>
                <li><span className="text-[#7E8B83]">NetworkX Device Graph</span></li>
              </ul>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-[#D7F46B] mb-3">Repository</div>
              <ul className="space-y-2 text-[13px]">
                <li>
                  <a
                    href="https://github.com/riddhibantia/finshield"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#A4B0A9] hover:text-white transition-colors"
                  >
                    GitHub Repository
                  </a>
                </li>
                <li><span className="text-[#7E8B83]">MIT Open Source</span></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-wrap items-center justify-between gap-4 text-[12px] text-[#7E8B83] border-t border-[#1B2921]">
          <div>FinShield Prototype · Built for PayPal Hackathon</div>
          <div>PayPal Sandbox · 5-Signal Risk Fusion · Human Approval Gate</div>
        </div>
      </div>
    </footer>
  );
}
