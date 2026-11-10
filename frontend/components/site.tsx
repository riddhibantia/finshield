"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, type Rec } from "@/lib/api";
import { GLOSSARY, LEVEL_MEANINGS, RULE_MEANINGS, ruleMeaning, SCORE_MEANING, signalMeaning, whyFlagged } from "@/lib/plain";

function Badge({ level }: { level: string }) {
  const c = level === "CRITICAL" ? "risk-CRITICAL" : level === "HIGH" ? "risk-HIGH" : level === "MEDIUM" ? "risk-MEDIUM" : "risk-LOW";
  return <span className={`mono text-[9px] font-semibold tracking-[1px] uppercase px-2.5 py-0.5 rounded-full border ${c}`}>{level}</span>;
}

function Src({ s }: { s: string }) {
  const cl = s === "LIVE_MODEL" ? "src-LIVE_MODEL" : "src-DEMO_FALLBACK";
  return <span className={`mono text-[9px] uppercase tracking-[1px] px-2 py-0.5 rounded-full border ${cl}`}>{s.replace("_", " ")}</span>;
}

// Static example shown in the Cashfree Demo Output Panel before the first live call.
const SAMPLE_CF_OUTPUT = {
  status: "processed",
  gateway: "Cashfree",
  transaction_id: "CF-CF_PAY_DEMO_1",
  risk_score: 0.035,
  risk_level: "LOW",
  record: {
    transaction: {
      transaction_id: "CF-CF_PAY_DEMO_1",
      user_id: "riddhi@okhdfcbank",
      amount: 75.0,
      merchant: "Cashfree Payment Rail",
      channel: "UPI",
      gateway: "Cashfree",
    },
    score: {
      risk_score: 0.035,
      risk_level: "LOW",
      rules: [],
      evidence: ["Everyday transaction verified safe"],
      source: "LIVE_MODEL",
    },
  },
};

function Card({ children, className = "", alt = false, dark = false }: { children: any; className?: string; alt?: boolean; dark?: boolean }) {
  const base = dark ? "card-dark" : alt ? "card-alt" : "card-white";
  return <div className={`${base} p-5 ${className}`}>{children}</div>;
}

/** Hover tooltip: dotted term + plain-English bubble. */
function Tip({ label, text, dark = false }: { label: any; text: string; dark?: boolean }) {
  return (
    <span className="tip" tabIndex={0}>
      <span className="tip-dots">{label}</span>
      <span className="tip-box" style={dark ? { background: "#F2EFE7", color: "#171916" } : undefined}>{text}</span>
    </span>
  );
}

function NavHeader({ metrics, health }: { metrics?: any; health?: any }) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F2EFE7]/90 border-b border-[#D8D4CA]">
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-[7px] bg-[#171916] flex items-center justify-center text-white font-bold text-xs group-hover:bg-[#FF5B35] transition-colors">
              F
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-bold tracking-tight text-lg text-[#171916]">FinShield</span>
              <span className="text-[#FF5B35] font-black text-xl leading-none">.</span>
              <span className="font-mono text-[9px] font-semibold tracking-[1.2px] text-[#7F837B] uppercase hidden sm:inline ml-1">
                // Fraud Defense
              </span>
            </div>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/paypal">Live Demo</Link>
          <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/agent">Agent</Link>
          <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/command-center">Console</Link>
        </nav>

        <div className="flex items-center gap-2.5">
          <Src s={health ? (health.adapter === "real" ? "LIVE_MODEL" : "DEMO_FALLBACK") : "DEMO_FALLBACK"} />
          <span className="font-mono text-[9px] tracking-wider text-[#7F837B] uppercase hidden lg:inline">
            XGB {metrics?.xgboost ? `${metrics.xgboost.roc_auc.toFixed(3)} ROC • ${metrics.xgboost.pr_auc.toFixed(3)} PR` : "…"}
          </span>
        </div>
      </div>
    </header>
  );
}

function FinShieldFooter() {
  return (
    <footer className="tellnova-footer mt-20 pt-16 pb-12 px-6 relative overflow-hidden">
      <div className="tellnova-circle-accent w-[360px] h-[360px] -top-20 -right-20 opacity-80 pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-12">
        {/* Dark Callout Banner */}
        <div className="tellnova-callout-box p-6 md:p-8 max-w-3xl space-y-3">
          <div className="font-mono text-[9px] uppercase font-bold tracking-[1.5px] text-[#FF5B35]">
            REQUIRED PROTOCOL CHECK // ZERO TEMPORAL LEAKAGE
          </div>
          <h3 className="font-title-strong text-xl md:text-2xl text-[#F2EFE7]">
            Running with Real ML Core Artifacts?
          </h3>
          <p className="text-xs text-[#A7AAA3] leading-relaxed">
            Ensure the ML Core engine is connected via <code className="text-[#FF5B35]">FINSHEILD_CORE_PATH</code>. All 36 features are strictly timestamp-restricted (<code className="text-[#F2EFE7]">ts &lt; t</code>) to guarantee zero target leakage.
          </p>
        </div>

        {/* Big Headline */}
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase font-bold tracking-[1.5px] text-[#FF5B35]">
            PRODUCTION ENGINE
          </div>
          <h2 className="font-display-hero text-[#F2EFE7]">
            Put FinShield to work.
          </h2>
          <p className="text-sm text-[#A7AAA3] max-w-xl">
            Autonomous multi-signal fraud defense running at microsecond latency.
          </p>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-8 pt-10 border-t border-[#2B2D2A]">
          <div className="space-y-2 max-w-sm">
            <div className="flex items-baseline gap-1">
              <span className="font-bold tracking-tight text-xl text-[#F2EFE7]">FinShield</span>
              <span className="text-[#FF5B35] font-black text-xl">.</span>
              <span className="font-mono text-[9px] text-[#92978E] uppercase tracking-wider ml-1">// Fraud Intelligence</span>
            </div>
            <p className="text-xs text-[#92978E] leading-relaxed">
              Hybrid 5-signal digital payment fraud defense platform fusing XGBoost, Isolation Forests, Deterministic Rules, Behavioral Profiling, and NetworkX Graph Rings with SHAP explainability.
            </p>
          </div>

          <div className="flex flex-wrap gap-10">
            <div>
              <div className="font-mono text-[9px] font-bold tracking-[1.2px] text-[#FF5B35] uppercase mb-3">Platform</div>
              <ul className="space-y-2 text-xs">
                <li><Link href="/paypal" className="text-[#A7AAA3] hover:text-[#F2EFE7] transition-colors">Live demo (PayPal sandbox)</Link></li>
                <li><Link href="/agent" className="text-[#A7AAA3] hover:text-[#F2EFE7] transition-colors">Analyst agent</Link></li>
                <li><Link href="/" className="text-[#A7AAA3] hover:text-[#F2EFE7] transition-colors">Command Center</Link></li>
                <li><Link href="/performance" className="text-[#A7AAA3] hover:text-[#F2EFE7] transition-colors">Model Observatory</Link></li>
                <li><Link href="/architecture" className="text-[#A7AAA3] hover:text-[#F2EFE7] transition-colors">Risk Fusion Engine</Link></li>
                <li><Link href="/glossary" className="text-[#A7AAA3] hover:text-[#F2EFE7] transition-colors">Glossary (plain English)</Link></li>
              </ul>
            </div>
            <div>
              <div className="font-mono text-[9px] font-bold tracking-[1.2px] text-[#FF5B35] uppercase mb-3">Protocols</div>
              <ul className="space-y-2 text-xs">
                <li><Link href="/privacy/U-00001" className="text-[#A7AAA3] hover:text-[#F2EFE7] transition-colors">Tokenized Privacy</Link></li>
                <li><span className="text-[#7F837B]">XGBoost 0.9709 ROC</span></li>
                <li><span className="text-[#7F837B]">NetworkX Graph Rings</span></li>
              </ul>
            </div>
            <div>
              <div className="font-mono text-[9px] font-bold tracking-[1.2px] text-[#FF5B35] uppercase mb-3">License & Code</div>
              <ul className="space-y-2 text-xs">
                <li><a href="https://github.com/riddhibantia/finshield" target="_blank" rel="noreferrer" className="text-[#A7AAA3] hover:text-[#F2EFE7] transition-colors">GitHub Repository</a></li>
                <li><span className="text-[#7F837B]">MIT Open Source</span></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-wrap items-center justify-between gap-4 text-[11px] text-[#7F837B] border-t border-[#2B2D2A]">
          <div className="font-mono">
            © {new Date().getFullYear()} FinShield Fraud Defense. All rights reserved.
          </div>
          <div className="font-mono text-[10px]">
            EDITORIAL THEME // #F2EFE7 × #171916 × #FF5B35
          </div>
        </div>
      </div>
    </footer>
  );
}

const DEMO_STEPS = [
  { label: "1. Dashboard", path: "/" },
  { label: "2. Suspicious", action: "suspicious" },
  { label: "3. Investigate", action: "open_last" },
  { label: "4. SHAP", anchor: "shap" },
  { label: "5. Fraud ring", action: "fraud_ring" },
  { label: "6. Copilot", anchor: "copilot" },
  { label: "7. Privacy", path: "/privacy/U-00001" },
  { label: "8. Performance", path: "/performance" },
  { label: "9. Architecture", path: "/architecture" },
  { label: "10. Reset", action: "reset" },
];

export function LandingPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    Promise.all([api.metrics(), api.health()]).then(([m, h]) => {
      setMetrics(m);
      setHealth(h);
    }).catch(() => {});
  }, []);

  const roc = metrics?.xgboost?.roc_auc ? metrics.xgboost.roc_auc.toFixed(3) : "0.971";
  const pr = metrics?.xgboost?.pr_auc ? metrics.xgboost.pr_auc.toFixed(3) : "0.842";

  return (
    <div className="min-h-screen tellnova-grid text-[#171916] flex flex-col justify-between selection:bg-[#FF5B35] selection:text-white">
      <div>
        <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F2EFE7]/90 border-b border-[#D8D4CA]">
          <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-7 h-7 rounded-[7px] bg-[#171916] flex items-center justify-center text-white font-bold text-xs group-hover:bg-[#FF5B35] transition-colors">
                  F
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-bold tracking-tight text-lg text-[#171916]">FinShield</span>
                  <span className="text-[#FF5B35] font-black text-xl leading-none">.</span>
                  <span className="font-mono text-[9px] font-semibold tracking-[1.2px] text-[#7F837B] uppercase hidden sm:inline ml-1">
                    // Fulfilment Shield
                  </span>
                </div>
              </Link>
            </div>

            <nav className="hidden md:flex items-center gap-6">
              <Link className="font-nav-link text-[#FF5B35] font-bold" href="/">Overview</Link>
              <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/paypal">Live Demo</Link>
              <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/agent">Agent</Link>
              <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/command-center">Console</Link>
            </nav>

            <div className="flex items-center gap-3">
              <Src s={health ? (health.adapter === "real" ? "LIVE_MODEL" : "DEMO_FALLBACK") : "DEMO_FALLBACK"} />
              <Link href="/paypal" className="btn-primary py-2 px-3 text-[9px]">
                Run the live demo ↗
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6">
          {/* ---------------- hero ---------------- */}
          <section className="relative pt-14 pb-10">
            <div className="tellnova-circle-accent w-[460px] h-[460px] -top-32 -right-28 pointer-events-none" />
            <div className="relative z-10">
              <span className="badge-pill mono text-[9px]">PAYPAL AI HACKATHON · LIVE ON PAYPAL SANDBOX</span>
              <h1 className="font-display-hero text-[#171916] max-w-4xl mt-4 leading-[1.02]">
                PayPal locks the funds.
                <br />
                <span className="text-[#FF5B35]">FinShield decides</span> what ships.
              </h1>
              <p className="mt-5 max-w-2xl text-sm md:text-base leading-relaxed text-[#555951]">
                A post-checkout fulfilment shield for digital-goods merchants. The buyer always completes
                PayPal checkout; the 5-signal engine scores the authorization; risky payments are{" "}
                <strong className="text-[#171916]">voided before delivery</strong> — nothing ships, nothing to dispute.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/paypal" className="btn-primary px-5 py-3 text-xs font-bold">
                  Run the live demo →
                </Link>
                <Link href="/agent" className="btn-secondary px-5 py-3 text-xs font-bold">
                  Meet the analyst agent
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] text-[#7F837B]">
                <span>XGBOOST ROC-AUC <strong className="text-[#171916]">{roc}</strong></span>
                <span>PR-AUC <strong className="text-[#171916]">{pr}</strong></span>
                <span><strong className="text-[#171916]">217</strong> TESTS</span>
                <span><strong className="text-[#171916]">REAL</strong> SANDBOX CAPTURE + VOID</span>
              </div>
            </div>
          </section>

          {/* ---------------- three verdicts ---------------- */}
          <section className="py-10">
            <div className="font-mono text-[10px] uppercase font-bold tracking-[1.5px] text-[#FF5B35] mb-1">
              THE THREE VERDICTS
            </div>
            <h2 className="font-title-strong text-2xl text-[#171916] mb-6">
              Every authorization ends in exactly one of these.
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="card-white p-5 fin-fade-up">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8F5E9]">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#2E7D32" strokeWidth="1.6" /><path d="M5 8.2l2 2L11.5 6" stroke="#2E7D32" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <div className="font-title-strong text-lg text-[#1B5E20]">AUTO-CAPTURE</div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#555951]">
                  Clean buyer, familiar device, usual amount. Funds captured in under a second — the
                  download unlocks immediately. Full autopilot for the 95%.
                </p>
                <div className="mono mt-3 text-[9px] text-[#2E7D32] bg-[#E8F5E9] rounded-[7px] px-3 py-2 w-fit">
                  REAL RUN · $42.00 → CAPTURED · score 0.037
                </div>
              </div>
              <div className="card-white p-5 fin-fade-up" style={{ animationDelay: "80ms" }}>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF8E7]">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="3.5" y="7" width="9" height="6.5" rx="1.6" stroke="#B7791F" strokeWidth="1.6" /><path d="M5.5 7V5.4a2.5 2.5 0 015 0V7" stroke="#B7791F" strokeWidth="1.6" /></svg>
                  </span>
                  <div className="font-title-strong text-lg text-[#7B341E]">STEP-UP / REVIEW</div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#555951]">
                  Amount far off profile or new-device spike. Funds stay locked; a demo OTP or the
                  analyst decides — pass captures, fail voids.
                </p>
                <div className="mono mt-3 text-[9px] text-[#7B341E] bg-[#FFF8E7] rounded-[7px] px-3 py-2 w-fit">
                  OTP 123456 · PASS → CAPTURE · FAIL → VOID
                </div>
              </div>
              <div className="card-white p-5 fin-fade-up" style={{ animationDelay: "160ms" }}>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FDECEC]">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#C53030" strokeWidth="1.6" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#C53030" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </span>
                  <div className="font-title-strong text-lg text-[#C53030]">AUTO-VOID</div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#555951]">
                  Stolen account, shared-device ring, extreme value. Voided before delivery —
                  no goods lost, no chargeback fees, nothing to fight.
                </p>
                <div className="mono mt-3 text-[9px] text-[#C53030] bg-[#FDECEC] rounded-[7px] px-3 py-2 w-fit">
                  REAL RUN · $4,800 → VOIDED · score 0.89
                </div>
              </div>
            </div>
          </section>

          {/* ---------------- how it works ---------------- */}
          <section className="py-10">
            <div className="font-mono text-[10px] uppercase font-bold tracking-[1.5px] text-[#FF5B35] mb-1">
              HOW IT WORKS
            </div>
            <h2 className="font-title-strong text-2xl text-[#171916] mb-6">
              Three moves, fully inside PayPal&apos;s own rails.
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { n: "1", t: "AUTHORIZE", b: "Orders v2 with intent AUTHORIZE — the buyer pays normally, PayPal locks the funds." },
                { n: "2", t: "SCORE", b: "XGBoost + IsolationForest + rules + behavior + device graph, currency-normalized, SHAP-grade evidence." },
                { n: "3", t: "GATE", b: "Capture, verify, review — or void. Every decision trail is stored for disputes." },
              ].map((s) => (
                <div key={s.n} className="card-white flex items-start gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#171916] font-mono text-xs font-bold text-[#F2EFE7]">{s.n}</div>
                  <div>
                    <div className="font-label-caps text-[10px] text-[#FF5B35]">{s.t}</div>
                    <div className="mt-[2px] text-[11px] leading-snug text-[#555951]">{s.b}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------- guardrail ---------------- */}
          <section className="py-10">
            <div className="tellnova-callout-box p-6 md:p-10 relative overflow-hidden">
              <div className="tellnova-circle-accent w-[300px] h-[300px] -top-16 -right-16 opacity-70 pointer-events-none" />
              <div className="relative z-10 max-w-3xl">
                <div className="font-mono text-[10px] uppercase font-bold tracking-[1.5px] text-[#FF5B35]">
                  THE GUARDRAIL
                </div>
                <h2 className="font-display-sub text-[#F2EFE7] mt-3 leading-snug">
                  The model never sets the score.
                  <br />
                  The agent never moves money alone.
                </h2>
                <p className="mt-4 text-xs leading-relaxed text-[#A7AAA3] max-w-xl">
                  The analyst agent investigates flagged authorizations with six tools and drafts dispute
                  evidence from SHAP signals, device-graph connections and checkout telemetry — but every
                  capture, void and refund it proposes sits in a queue until a human clicks.
                </p>
                <Link href="/agent" className="inline-block mt-5 font-mono text-[11px] text-[#FF5B35] hover:underline">
                  Watch it propose → you approve →
                </Link>
              </div>
            </div>
          </section>

          {/* ---------------- why it exists ---------------- */}
          <section className="py-10">
            <div className="font-mono text-[10px] uppercase font-bold tracking-[1.5px] text-[#FF5B35] mb-1">
              WHY IT EXISTS
            </div>
            <h2 className="font-title-strong text-2xl text-[#171916] mb-6 max-w-2xl">
              PayPal stops stolen cards at checkout. Nobody protects the merchant after.
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { t: "Friendly fraud", b: "The real buyer keeps the download, then files a chargeback weeks later. PayPal Seller Protection does not cover digital goods." },
                { t: "Post-authorization blind spot", b: "Checkout-side risk engines decide before payment. After funds lock, the merchant ships blind." },
                { t: "Evidence merchants lose without", b: "Disputes are won with data: device fingerprints, velocity, behavioral baselines. Merchants hand-write none of it." },
              ].map((c) => (
                <div key={c.t} className="card-white p-5">
                  <div className="font-title-strong text-sm text-[#171916]">{c.t}</div>
                  <p className="mt-2 text-xs leading-relaxed text-[#555951]">{c.b}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------- metrics strip ---------------- */}
          <section className="py-10">
            <div className="card-white p-6 flex flex-wrap items-center justify-between gap-6">
              <div>
                <div className="font-mono text-[10px] uppercase font-bold tracking-[1.5px] text-[#FF5B35]">
                  BENCHMARKS
                </div>
                <div className="font-title-strong text-xl text-[#171916] mt-1">
                  Trained on real data. Benchmarked honestly.
                </div>
                <p className="font-mono text-[10px] text-[#7F837B] mt-1">
                  ULB creditcard 284,807 rows · 0.17% fraud · zero-leakage features
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="rounded-[11px] border border-[#E7E4DB] px-5 py-3 text-center">
                  <div className="font-mono text-2xl font-bold text-[#171916]">{roc}</div>
                  <div className="font-micro-label text-[9px] text-[#7F837B]">ROC-AUC</div>
                </div>
                <div className="rounded-[11px] border border-[#E7E4DB] px-5 py-3 text-center">
                  <div className="font-mono text-2xl font-bold text-[#171916]">{pr}</div>
                  <div className="font-micro-label text-[9px] text-[#7F837B]">PR-AUC</div>
                </div>
                <Link href="/performance" className="btn-secondary px-4 py-3 text-[10px] self-center">
                  Full observatory →
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
      <FinShieldFooter />
    </div>
  );
}

export function CommandCenter() {
  const [items, setItems] = useState<Rec[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const lastRef = useRef<string | null>(null);
  const router = useRouter();

  async function refresh() {
    try {
      const [l, m, h] = await Promise.all([api.list(), api.metrics(), api.health()]);
      const txs = (l as any).transactions ?? (l as any);
      setItems(txs);
      setMetrics(m);
      setHealth(h);
      if (txs.length) lastRef.current = txs[txs.length - 1]?.transaction?.transaction_id ?? txs[0]?.transaction?.transaction_id;
    } catch {}
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(async () => {
      const picks: (string | null)[] = ["normal", "normal", "normal", "suspicious", "ambiguous", null];
      const pick = picks[Math.floor(Math.random() * picks.length)];
      if (pick) await api.generate(pick); else await api.generate("normal");
      refresh();
    }, 1800);
    return () => clearInterval(id);
  }, [running]);

  const alerts = items.filter((r) => r.score.risk_score >= 0.6);
  const critical = items.filter((r) => r.score.risk_level === "CRITICAL");

  async function doDemoAction(a: string) {
    if (a === "suspicious") { const r: any = await api.generate("suspicious"); await refresh(); router.push(`/investigate/${r.transaction.transaction_id}`); }
    else if (a === "fraud_ring") { const r: any = await api.generate("fraud_ring"); await refresh(); router.push(`/investigate/${r.transaction.transaction_id}`); }
    else if (a === "open_last") { if (lastRef.current) router.push(`/investigate/${lastRef.current}`); else { const r: any = await api.generate("suspicious"); router.push(`/investigate/${r.transaction.transaction_id}`); } }
    else if (a === "reset") { await api.reset(); refresh(); router.push("/command-center"); }
  }

  // Manual UPI Simulation State
  const [upiSender, setUpiSender] = useState<string>("demo@okhdfc");
  const [upiReceiver, setUpiReceiver] = useState<string>("chaiwala@paytm");
  const [upiAmount, setUpiAmount] = useState<number>(50);
  const [upiNote, setUpiNote] = useState<string>("Chai & snacks");
  const [upiProcessing, setUpiProcessing] = useState<boolean>(false);
  const [upiResult, setUpiResult] = useState<Rec | null>(null);

  // Cashfree Webhook Ingestion State
  const [cfAmount, setCfAmount] = useState<number>(75);
  const [cfUpiId, setCfUpiId] = useState<string>("riddhi@okhdfcbank");
  const [cfStatus] = useState<string>("SUCCESS");
  const [cfProcessing, setCfProcessing] = useState<boolean>(false);
  const [cfResult, setCfResult] = useState<any>(null);
  const [cfCopied, setCfCopied] = useState<boolean>(false);
  const [cfOutCopied, setCfOutCopied] = useState<boolean>(false);
  const [studioTab, setStudioTab] = useState<"cashfree" | "upi" | "stream">("cashfree");
  const [showSteps, setShowSteps] = useState<boolean>(false);

  // Webhook URL resolves client-side only (SSR has no window).
  const [webhookUrl, setWebhookUrl] = useState("<YOUR-CLOUDFLARE-URL>/api/webhooks/cashfree");
  useEffect(() => {
    const o = window.location.origin;
    if (!o.includes("localhost") && !o.includes("127.0.0.1")) setWebhookUrl(`${o}/api/webhooks/cashfree`);
  }, []);

  async function handleCashfreeTest(overrideAmt?: number, overrideUpi?: string) {
    const amt = overrideAmt !== undefined ? overrideAmt : cfAmount;
    const upi = overrideUpi !== undefined ? overrideUpi : cfUpiId;
    if (overrideAmt !== undefined) setCfAmount(overrideAmt);
    if (overrideUpi !== undefined) setCfUpiId(overrideUpi);
    setCfProcessing(true);
    try {
      const res: any = await api.cashfreeSimulate({ amount: amt, status: cfStatus, upi_id: upi });
      setCfResult(res);
      await refresh();
    } catch (e: any) {
      alert("Cashfree Webhook test failed: " + e.message);
    } finally {
      setCfProcessing(false);
    }
  }

  async function handleUpiPayment(overrideAmount?: number) {
    const amt = overrideAmount !== undefined ? overrideAmount : Number(upiAmount);
    if (overrideAmount !== undefined) {
      setUpiAmount(overrideAmount);
    }
    if (!amt || amt <= 0) {
      alert("Please enter a valid UPI payment amount.");
      return;
    }
    setUpiProcessing(true);
    try {
      const isLarge = amt >= 100000;
      const isMicro = amt <= 500;
      const payload = {
        transaction_id: `UPI-${Date.now().toString().slice(-6)}`,
        user_id: upiSender,
        amount: amt,
        timestamp: new Date().toISOString(),
        merchant: upiReceiver,
        merchant_category: isMicro ? "everyday" : (isLarge ? "high_value_p2p" : "p2p"),
        device_id: "DEV-PHONE-DEMO",
        location: isLarge ? "Home City (High-Value Transfer)" : "Home City",
        velocity: 1,
        usual_amount: 500.0,
      };

      const res: any = await api.score(payload);
      setUpiResult(res);
      await refresh();
    } catch (e: any) {
      alert("UPI Transaction failed: " + e.message);
    } finally {
      setUpiProcessing(false);
    }
  }

  return (
    <div className="min-h-screen tellnova-grid text-[#171916] flex flex-col justify-between selection:bg-[#FF5B35] selection:text-white">
      <div>
        <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F2EFE7]/90 border-b border-[#D8D4CA]">
          <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-7 h-7 rounded-[7px] bg-[#171916] flex items-center justify-center text-white font-bold text-xs group-hover:bg-[#FF5B35] transition-colors">
                  F
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-bold tracking-tight text-lg text-[#171916]">FinShield</span>
                  <span className="text-[#FF5B35] font-black text-xl leading-none">.</span>
                  <span className="font-mono text-[9px] font-semibold tracking-[1.2px] text-[#7F837B] uppercase hidden sm:inline ml-1">
                    // Command Center
                  </span>
                </div>
              </Link>
            </div>

            <nav className="hidden md:flex items-center gap-6">
              <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/">← Landing Page</Link>
              <Link className="font-nav-link text-[#FF5B35] font-bold" href="/command-center">Console</Link>
              <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/paypal">Live Demo</Link>
              <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/agent">Agent</Link>
            </nav>

            <div className="flex items-center gap-2.5">
              <Src s={health ? (health.adapter === "real" ? "LIVE_MODEL" : "DEMO_FALLBACK") : "DEMO_FALLBACK"} />
              <span className="font-mono text-[9px] tracking-wider text-[#7F837B] uppercase hidden lg:inline">
                XGB {metrics?.xgboost ? `${metrics.xgboost.roc_auc.toFixed(3)} ROC • ${metrics.xgboost.pr_auc.toFixed(3)} PR` : "…"}
              </span>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          {/* Header Title */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D8D4CA] pb-4">
            <div>
              <span className="badge-pill mb-1 inline-block">Operational Cockpit</span>
              <h1 className="font-title-strong text-2xl text-[#171916]">Fraud Operations Command Center</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-[#1B5E20] flex items-center gap-1.5 bg-[#2E7D32]/10 px-3 py-1 rounded-full border border-[#2E7D32]/30">
                <span className="w-2 h-2 rounded-full bg-[#1B5E20] animate-pulse" />
                Live Telemetry Active
              </span>
            </div>
          </div>

          {/* Guided Evaluator Flow — Collapsible */}
          <Card className="border-[#D8D4CA] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-title-strong text-xs text-[#171916] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#FF5B35]"></span>
                <span>Guided Evaluator Flow</span>
                <span className="font-mono text-[10px] text-[#7F837B]">• Step {demoStep + 1} of 10</span>
              </div>
              <button
                onClick={() => setShowSteps(!showSteps)}
                className="font-mono text-[10px] text-[#555951] hover:text-[#FF5B35] font-semibold flex items-center gap-1 transition-colors"
              >
                {showSteps ? "▲ Hide Guide" : "▼ Show 10-Step Guide"}
              </button>
            </div>
            {showSteps && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[#E7E4DB]">
                {DEMO_STEPS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setDemoStep(i);
                      if (s.path) router.push(s.path);
                      else if (s.action) doDemoAction(s.action);
                    }}
                    className={`font-mono text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-[6px] border transition-all ${
                      i === demoStep
                        ? "bg-[#FF5B35] border-[#FF5B35] text-white shadow-sm"
                        : "bg-[#FFFFFF] border-[#D8D4CA] text-[#555951] hover:text-[#171916] hover:border-[#62665F]"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Metrics KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ["System", health?.status ?? "…", health?.status === "ok" ? "bg-[#1B5E20]" : "bg-[#B7791F]"],
              ["Model adapter", health?.adapter ?? "…", health?.adapter === "real" ? "bg-[#1B5E20]" : "bg-[#B7791F]"],
              ["Transactions", String(items.length), "bg-[#FF5B35]"],
              ["High-risk alerts", String(alerts.length), alerts.length ? "bg-[#C53030]" : "bg-[#92978E]"],
              ["Critical blocked", String(critical.length), critical.length ? "bg-[#FF5B35]" : "bg-[#92978E]"],
            ].map(([k, v, dot]) => (
              <Card key={k} className="p-3.5">
                <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase text-[#7F837B]">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  {k}
                </div>
                <div className="text-xl font-bold font-mono text-[#171916] mt-1">{v}</div>
              </Card>
            ))}
          </div>

          {/* Unified Transaction Ingestion & Testing Studio (3 Tabs) */}
          <div className="bg-[#171916] text-[#F2EFE7] rounded-[11px] p-5 border border-[#2B2D2A] space-y-4 shadow-sm">
            {/* Studio Header & Tab Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2B2D2A] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-[6px] bg-[#FF5B35] flex items-center justify-center text-white font-bold text-xs">
                  {studioTab === "cashfree" ? "💳" : studioTab === "upi" ? "⚡" : "🌊"}
                </div>
                <div>
                  <h2 className="font-title-strong text-sm text-[#F2EFE7]">
                    Transaction Ingestion & Testing Studio
                  </h2>
                  <p className="font-mono text-[9px] text-[#7F837B]">
                    {studioTab === "cashfree" && "Live Cashfree Webhook Ingestion • Real Gateway Events"}
                    {studioTab === "upi" && "Interactive UPI Simulator • ₹50 Safe vs ₹1L Block"}
                    {studioTab === "stream" && "Automated Continuous Traffic & Scenarios"}
                  </p>
                </div>
              </div>

              {/* Mode Tabs */}
              <div className="flex items-center gap-1 bg-[#212320] p-1 rounded-[8px] border border-[#2B2D2A]">
                <button
                  onClick={() => setStudioTab("cashfree")}
                  className={`font-mono text-[10px] font-semibold px-3 py-1.5 rounded-[6px] transition-all flex items-center gap-1.5 ${
                    studioTab === "cashfree"
                      ? "bg-[#00897B] text-white shadow-sm"
                      : "text-[#A7AAA3] hover:text-[#F2EFE7]"
                  }`}
                >
                  <span>💳 Cashfree Gateway</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#26A69A] animate-pulse" />
                </button>
                <button
                  onClick={() => setStudioTab("upi")}
                  className={`font-mono text-[10px] font-semibold px-3 py-1.5 rounded-[6px] transition-all ${
                    studioTab === "upi"
                      ? "bg-[#FF5B35] text-white shadow-sm"
                      : "text-[#A7AAA3] hover:text-[#F2EFE7]"
                  }`}
                >
                  ⚡ UPI Instant Rail
                </button>
                <button
                  onClick={() => setStudioTab("stream")}
                  className={`font-mono text-[10px] font-semibold px-3 py-1.5 rounded-[6px] transition-all ${
                    studioTab === "stream"
                      ? "bg-[#3D403C] text-white shadow-sm"
                      : "text-[#A7AAA3] hover:text-[#F2EFE7]"
                  }`}
                >
                  🌊 Traffic Stream
                </button>
              </div>
            </div>

            {/* TAB 1: CASHFREE GATEWAY */}
            {studioTab === "cashfree" && (
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Webhook Configuration & URL */}
                  <div className="bg-[#212320] p-3.5 rounded-[9px] border border-[#2B2D2A] space-y-2.5 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#A7AAA3] font-semibold text-[11px] flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00897B]"></span>
                        Live Webhook Endpoint URL
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                          setCfCopied(true);
                          setTimeout(() => setCfCopied(false), 2000);
                        }}
                        className="text-[9px] px-2 py-0.5 rounded bg-[#2B2D2A] text-[#F2EFE7] hover:bg-[#3D403C] border border-[#40443E] transition-all"
                      >
                        {cfCopied ? "✓ Copied!" : "📋 Copy URL"}
                      </button>
                    </div>
                    <code className="block bg-[#171916] p-2 rounded text-[10px] text-[#26A69A] border border-[#2B2D2A] break-all select-all">
                      {webhookUrl}
                    </code>
                    <div className="text-[10px] text-[#7F837B] space-y-1">
                      <p>• Added in Cashfree Dashboard → Developers → Webhooks</p>
                      <p>• Catches <strong className="text-[#F2EFE7]">PAYMENT_SUCCESS_WEBHOOK</strong> live</p>
                    </div>
                  </div>

                  {/* Instant Ingestion Test Box */}
                  <div className="bg-[#212320] p-3.5 rounded-[9px] border border-[#2B2D2A] space-y-2.5 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#A7AAA3] font-semibold text-[11px]">Instant Payload Ingestion</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleCashfreeTest(75, "riddhi@okhdfcbank")}
                          className="text-[9px] px-2 py-0.5 rounded bg-[#2E7D32]/20 border border-[#2E7D32]/40 text-[#4CAF50] hover:bg-[#2E7D32]/30"
                        >
                          ₹75 Safe
                        </button>
                        <button
                          onClick={() => handleCashfreeTest(100000, "crypto_mule@ybl")}
                          className="text-[9px] px-2 py-0.5 rounded bg-[#C53030]/20 border border-[#C53030]/40 text-[#EF5350] hover:bg-[#C53030]/30"
                        >
                          ₹1L Spike
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-[#7F837B] block mb-0.5">Amount (INR)</label>
                        <input
                          type="number"
                          value={cfAmount}
                          onChange={(e) => setCfAmount(Number(e.target.value))}
                          className="w-full bg-[#171916] border border-[#3D403C] rounded px-2 py-1 text-xs text-[#F2EFE7] font-mono outline-none focus:border-[#00897B]"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-[#7F837B] block mb-0.5">Payer UPI ID</label>
                        <input
                          type="text"
                          value={cfUpiId}
                          onChange={(e) => setCfUpiId(e.target.value)}
                          className="w-full bg-[#171916] border border-[#3D403C] rounded px-2 py-1 text-xs text-[#F2EFE7] font-mono outline-none focus:border-[#00897B]"
                        />
                      </div>
                    </div>

                    <button
                      disabled={cfProcessing}
                      onClick={() => handleCashfreeTest()}
                      className="w-full py-1.5 px-3 rounded-[6px] bg-[#00897B] hover:bg-[#00796B] text-white font-mono text-xs font-bold tracking-wider uppercase transition-all disabled:opacity-50"
                    >
                      {cfProcessing ? "Scoring Webhook…" : "Ingest & Score Cashfree Webhook ↗"}
                    </button>
                  </div>
                </div>

                {/* Cashfree Result Banner */}
                {cfResult && (
                  <div className="p-3 rounded-[7px] bg-[#212320] border border-[#2B2D2A] flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{cfResult.risk_score >= 0.7 ? "🚨" : "✅"}</span>
                      <div>
                        <span className="text-white font-bold">{cfResult.transaction_id}</span>
                        <span className="text-[#7F837B] ml-2">• Score: {cfResult.risk_score.toFixed(3)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge level={cfResult.risk_level} />
                      <Link href={`/investigate/${cfResult.transaction_id}`} className="btn-secondary py-1 px-2.5 text-[9px]">
                        Inspect Payload ↗
                      </Link>
                    </div>
                  </div>
                )}

                {/* Demo Output Panel: scored webhook JSON + curl */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-[#212320] p-3.5 rounded-[9px] border border-[#2B2D2A] space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#A7AAA3] font-semibold text-[11px]">
                        {cfResult ? "✓ Live Webhook Output" : "Sample Webhook Output"}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            JSON.stringify(cfResult ?? SAMPLE_CF_OUTPUT, null, 2)
                          );
                          setCfOutCopied(true);
                          setTimeout(() => setCfOutCopied(false), 2000);
                        }}
                        className="text-[9px] px-2 py-0.5 rounded bg-[#2B2D2A] text-[#F2EFE7] hover:bg-[#3D403C] border border-[#40443E] transition-all"
                      >
                        {cfOutCopied ? "✓ Copied!" : "📋 Copy JSON"}
                      </button>
                    </div>
                    <pre className="block bg-[#171916] p-2.5 rounded text-[10px] leading-relaxed text-[#A7AAA3] border border-[#2B2D2A] overflow-x-auto max-h-64 overflow-y-auto select-all">
                      {JSON.stringify(cfResult ?? SAMPLE_CF_OUTPUT, null, 2)}
                    </pre>
                    <p className="text-[10px] text-[#7F837B]">
                      {cfResult
                        ? "↑ Output of your last Ingest & Score call — also saved to the ledger."
                        : "↑ Example output. Hit “Ingest & Score” above to replace it with a live result."}
                    </p>
                  </div>

                  <div className="bg-[#212320] p-3.5 rounded-[9px] border border-[#2B2D2A] space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#A7AAA3] font-semibold text-[11px]">Fire It Yourself (curl)</span>
                    </div>
                    <pre className="block bg-[#171916] p-2.5 rounded text-[10px] leading-relaxed text-[#26A69A] border border-[#2B2D2A] overflow-x-auto whitespace-pre-wrap break-all select-all">
                      {`curl -X POST http://127.0.0.1:8000/api/webhooks/cashfree \\
  -H "Content-Type: application/json" \\
  -d '{"data":{"order":{"order_id":"ORD_DEMO_1","order_amount":75.0},"payment":{"cf_payment_id":"CF_PAY_DEMO_1","payment_status":"SUCCESS","payment_amount":75.0,"payment_method":{"upi":{"upi_id":"riddhi@okhdfcbank"}},"payment_group":"upi"},"customer_details":{"customer_phone":"+919876543210"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}'`}
                    </pre>
                    <p className="text-[10px] text-[#7F837B]">
                      • Change <span className="text-[#F2EFE7]">order_amount</span> to 125000 to watch it flip to CRITICAL.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: UPI INSTANT SIMULATOR */}
            {studioTab === "upi" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-mono text-[10px] text-[#7F837B]">Quick Amount Presets:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button onClick={() => handleUpiPayment(50)} className="font-mono text-[10px] font-semibold px-2.5 py-1 rounded-[6px] bg-[#2E7D32]/20 border border-[#2E7D32]/50 text-[#4CAF50] hover:bg-[#2E7D32]/30">☕ ₹50 Safe</button>
                    <button onClick={() => handleUpiPayment(100)} className="font-mono text-[10px] font-semibold px-2.5 py-1 rounded-[6px] bg-[#2E7D32]/20 border border-[#2E7D32]/50 text-[#4CAF50] hover:bg-[#2E7D32]/30">🍕 ₹100 Safe</button>
                    <button onClick={() => handleUpiPayment(100000)} className="font-mono text-[10px] font-semibold px-2.5 py-1 rounded-[6px] bg-[#FF5B35]/20 border border-[#FF5B35]/50 text-[#FF5B35] hover:bg-[#FF5B35]/30">🚨 ₹1,00,000 Block</button>
                    <button onClick={() => handleUpiPayment(250000)} className="font-mono text-[10px] font-semibold px-2.5 py-1 rounded-[6px] bg-[#C53030]/20 border border-[#C53030]/50 text-[#EF5350] hover:bg-[#C53030]/30">🛑 ₹2,50,000 Block</button>
                  </div>
                </div>

                <div className="grid md:grid-cols-4 gap-3">
                  <div>
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#A7AAA3] block mb-1">From (Payer UPI)</label>
                    <input type="text" value={upiSender} onChange={(e) => setUpiSender(e.target.value)} className="w-full bg-[#212320] border border-[#2B2D2A] rounded-[6px] px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-[#FF5B35]" />
                  </div>
                  <div>
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#A7AAA3] block mb-1">To (Payee / Merchant)</label>
                    <input type="text" value={upiReceiver} onChange={(e) => setUpiReceiver(e.target.value)} className="w-full bg-[#212320] border border-[#2B2D2A] rounded-[6px] px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-[#FF5B35]" />
                  </div>
                  <div>
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#A7AAA3] block mb-1">Amount (₹ INR)</label>
                    <input type="number" value={upiAmount} onChange={(e) => setUpiAmount(Number(e.target.value))} className="w-full bg-[#212320] border border-[#2B2D2A] rounded-[6px] px-2.5 py-1.5 text-xs font-mono font-bold text-white outline-none focus:border-[#FF5B35]" />
                  </div>
                  <div>
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#A7AAA3] block mb-1">Transfer Note</label>
                    <input type="text" value={upiNote} onChange={(e) => setUpiNote(e.target.value)} className="w-full bg-[#212320] border border-[#2B2D2A] rounded-[6px] px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-[#FF5B35]" />
                  </div>
                </div>

                <button onClick={() => handleUpiPayment()} disabled={upiProcessing} className="btn-primary w-full py-2.5 text-xs font-bold tracking-wider">
                  {upiProcessing ? "Evaluating Multi-Signal Graph…" : `PAY ₹${Number(upiAmount).toLocaleString("en-IN")} VIA UPI ↗`}
                </button>

                {upiResult && (
                  <div className="p-3 rounded-[7px] bg-[#212320] border border-[#2B2D2A] flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{upiResult.score.risk_score >= 0.7 ? "🚨" : "✅"}</span>
                      <div>
                        <span className={`font-bold ${upiResult.score.risk_score >= 0.7 ? "text-[#FF5B35]" : "text-[#4CAF50]"}`}>
                          {upiResult.score.risk_score >= 0.7 ? "PAYMENT BLOCKED — HIGH RISK" : "PAYMENT APPROVED & SAFE"}
                        </span>
                        <span className="text-[#7F837B] ml-2">• Score: {upiResult.score.risk_score.toFixed(3)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge level={upiResult.score.risk_level} />
                      <Link href={`/investigate/${upiResult.transaction.transaction_id}`} className="btn-secondary py-1 px-2.5 text-[9px]">
                        Forensics ↗
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TRAFFIC STREAM */}
            {studioTab === "stream" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-xs text-[#A7AAA3]">
                    Status: <strong className={running ? "text-[#4CAF50]" : "text-[#A7AAA3]"}>{running ? "● Active Stream Running" : "○ Paused"}</strong>
                  </div>
                  <button
                    onClick={() => setRunning(!running)}
                    className={`font-mono text-[10px] font-semibold uppercase px-3 py-1.5 rounded-[6px] border transition-all ${
                      running ? "bg-[#C53030]/20 border-[#C53030]/50 text-[#EF5350]" : "bg-[#2E7D32]/20 border-[#2E7D32]/50 text-[#4CAF50]"
                    }`}
                  >
                    {running ? "Pause Traffic" : "Start Continuous Stream"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#2B2D2A]">
                  <button className="btn-secondary py-1 px-2.5 text-[10px]" onClick={async () => { await api.reset(); refresh(); }}>Reset Store</button>
                  <button className="font-mono text-[10px] uppercase font-semibold px-2.5 py-1 rounded-[6px] border border-[#3D403C] bg-[#212320] hover:bg-[#2B2D2A] text-white" onClick={async () => { await api.generate("normal"); refresh(); }}>+ Ingest Normal</button>
                  <button className="font-mono text-[10px] uppercase font-semibold px-2.5 py-1 rounded-[6px] border border-[#B7791F]/50 bg-[#B7791F]/20 text-[#FFC107] hover:bg-[#B7791F]/30" onClick={async () => { await api.generate("suspicious"); refresh(); }}>+ Inject ATO Anomaly</button>
                  <button className="font-mono text-[10px] uppercase font-semibold px-2.5 py-1 rounded-[6px] border border-[#FF5B35]/50 bg-[#FF5B35]/20 text-[#FF795A] hover:bg-[#FF5B35]/30" onClick={async () => { await api.generate("fraud_ring"); refresh(); }}>+ Inject Mule Ring</button>
                  <button className="font-mono text-[10px] uppercase font-semibold px-2.5 py-1 rounded-[6px] border border-[#3D403C] bg-[#212320] hover:bg-[#2B2D2A] text-white" onClick={async () => { await api.generate("ambiguous"); refresh(); }}>+ Inject Subtle</button>
                </div>
              </div>
            )}
          </div>

          {/* Alerts & Investigations Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-2 border-[#D8D4CA]">
              <div className="font-title-strong text-sm text-[#171916] mb-3 flex items-center justify-between">
                <span>Active Risk Alerts (Risk ≥ 0.6)</span>
                <span className="font-mono text-xs text-[#C53030] font-semibold">{alerts.length} Flagged</span>
              </div>
              <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                {alerts.length === 0 ? (
                  <div className="text-xs text-[#7F837B] py-6 text-center">No active high-risk alerts. Use the UPI Simulator or click "Generate Suspicious" above.</div>
                ) : (
                  alerts.slice(0, 12).map((r) => (
                    <Link
                      key={r.transaction.transaction_id as string}
                      href={`/investigate/${r.transaction.transaction_id}`}
                      className="flex items-center justify-between border border-[#E7E4DB] rounded-[11px] p-3 hover:bg-[#FFFFFF] transition-all bg-[#F2EFE7]"
                    >
                      <div>
                        <div className="font-mono text-xs font-bold text-[#171916] flex items-center gap-2">
                          {r.transaction.transaction_id as string}
                          <Badge level={r.score.risk_level} />
                        </div>
                        <div className="text-xs text-[#555951] mt-0.5">
                          {r.transaction.merchant as string} • {r.transaction.location as string} • ₹{Number(r.transaction.amount).toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold text-[#171916]">{r.score.risk_score.toFixed(3)}</div>
                        <div className="mt-0.5"><Src s={r.score.source} /></div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </Card>

            <Card className="border-[#D8D4CA]">
              <div className="font-title-strong text-sm text-[#171916] mb-3">Recent Investigations</div>
              <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                {items.slice(0, 10).map((r) => (
                  <Link
                    key={r.transaction.transaction_id as string}
                    href={`/investigate/${r.transaction.transaction_id}`}
                    className="flex justify-between items-center font-mono text-xs border border-[#E7E4DB] rounded-[7px] p-2 hover:bg-[#FFFFFF] transition-all"
                  >
                    <span className="text-[#171916] font-semibold">{r.transaction.transaction_id as string}</span>
                    <Badge level={r.score.risk_level} />
                  </Link>
                ))}
                {items.length === 0 && <div className="text-xs text-[#7F837B]">No transactions yet.</div>}
              </div>
            </Card>
          </div>

          {/* Recent Scored Transactions Table */}
          <Card className="border-[#D8D4CA]">
            <div className="font-title-strong text-sm text-[#171916] mb-3 flex items-center justify-between">
              <span>Recent Scored Transactions Log</span>
              <span className="font-mono text-[10px] text-[#7F837B] uppercase">Showing last 20</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-left text-[#7F837B] border-b border-[#E7E4DB] pb-2">
                    <th className="py-2">Transaction ID</th>
                    <th>Amount</th>
                    <th>Merchant / Payee</th>
                    <th>Location</th>
                    <th>Device Fingerprint</th>
                    <th>Risk Level</th>
                    <th>Composite Score</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 20).map((r) => (
                    <tr key={r.transaction.transaction_id as string} className="border-b border-[#E7E4DB] hover:bg-[#FFFFFF] transition-colors">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <Link className="text-[#FF5B35] font-semibold hover:underline" href={`/investigate/${r.transaction.transaction_id}`}>
                            {r.transaction.transaction_id as string}
                          </Link>
                          {(String(r.transaction.transaction_id).startsWith("CF-") || r.transaction.gateway === "Cashfree") && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#00897B]/20 text-[#00897B] border border-[#00897B]/40">
                              CASHFREE
                            </span>
                          )}
                          {String(r.transaction.transaction_id).startsWith("UPI-") && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#FF5B35]/20 text-[#FF5B35] border border-[#FF5B35]/40">
                              UPI RAIL
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="font-bold text-[#171916]">₹{Number(r.transaction.amount).toLocaleString("en-IN")}</td>
                      <td className="text-[#555951]">{r.transaction.merchant as string}</td>
                      <td className="text-[#7F837B]">{r.transaction.location as string}</td>
                      <td className="text-[#7F837B]">{String(r.transaction.device_id).slice(0, 16)}</td>
                      <td><Badge level={r.score.risk_level} /></td>
                      <td className="font-bold">{r.score.risk_score.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </main>
      </div>

      <FinShieldFooter />
    </div>
  );
}

export const Dashboard = CommandCenter;

function ForensicEntityGraph({ graph, txnId }: { graph: any; txnId: string }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"ALL" | "ANOMALIES">("ALL");

  const nodes: any[] = useMemo(() => graph?.nodes ?? [], [graph]);
  const rawEdges: any[] = useMemo(() => graph?.edges ?? [], [graph]);

  // Auto-select critical rogue device, or transaction node, or first node
  useEffect(() => {
    if (nodes.length > 0 && !selectedNodeId) {
      const critDev = nodes.find((n: any) => n.risk === "CRITICAL" && n.type === "device");
      const critNode = nodes.find((n: any) => n.risk === "CRITICAL");
      const txnNode = nodes.find((n: any) => n.id === txnId || n.type === "transaction");
      setSelectedNodeId((critDev || critNode || txnNode || nodes[0])?.id);
    }
  }, [nodes, txnId, selectedNodeId]);

  // Deterministic 4-Column Layout Coordinates
  const coords = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    const col0: any[] = []; // Identity & Funding (Users, Accounts)
    const col1: any[] = []; // Hardware & Origin (Devices)
    const col2: any[] = []; // Transaction Execution Hub
    const col3: any[] = []; // Gateway & Counterparty Merchant

    for (const n of nodes) {
      const id = String(n.id);
      const type = String(n.type).toLowerCase();
      if (type === "user" || id.startsWith("user:") || type === "account" || id.startsWith("acct:")) {
        col0.push(n);
      } else if (type === "device" || id.startsWith("dev:")) {
        col1.push(n);
      } else if (type === "transaction" || id === txnId) {
        col2.push(n);
      } else if (type === "gateway" || id.startsWith("gw:") || type === "merchant" || id.startsWith("merch:")) {
        col3.push(n);
      } else {
        col1.push(n);
      }
    }

    const assignCol = (arr: any[], x: number) => {
      const total = arr.length;
      if (total === 1) {
        map[arr[0].id] = { x, y: 190 };
      } else if (total === 2) {
        map[arr[0].id] = { x, y: 100 };
        map[arr[1].id] = { x, y: 280 };
      } else {
        arr.forEach((item, i) => {
          const y = 80 + i * (220 / Math.max(1, total - 1));
          map[item.id] = { x, y };
        });
      }
    };

    assignCol(col0, 115);
    assignCol(col1, 350);
    assignCol(col2, 580);
    assignCol(col3, 810);

    nodes.forEach((n, i) => {
      if (!map[n.id]) {
        map[n.id] = { x: 115 + (i % 4) * 230, y: 90 + Math.floor(i / 4) * 110 };
      }
    });

    return map;
  }, [nodes, txnId]);

  const edges = useMemo(() => {
    if (filterMode === "ANOMALIES") {
      return rawEdges.filter((e: any) => e.is_suspicious);
    }
    return rawEdges;
  }, [rawEdges, filterMode]);

  const selectedNode = useMemo(() => {
    return nodes.find((n: any) => n.id === selectedNodeId) || nodes[0] || null;
  }, [nodes, selectedNodeId]);

  if (!graph || nodes.length === 0) {
    return (
      <div className="rounded-[11px] border border-[#D8D4CA] bg-[#FFFFFF] p-8 text-center text-xs font-mono text-[#7F837B]">
        No entity graph topology mapped for this transaction.
      </div>
    );
  }

  const getIcon = (type: string, risk?: string) => {
    if (risk === "CRITICAL") return "⚡";
    switch (String(type).toLowerCase()) {
      case "user": return "👤";
      case "account": return "💳";
      case "device": return "📱";
      case "transaction": return "⚡";
      case "gateway": return "🔄";
      case "merchant": return "🏢";
      default: return "🔷";
    }
  };

  const CARD_W = 154;
  const CARD_H = 54;
  const HALF_W = CARD_W / 2; // 77

  return (
    <div className="space-y-4">
      {/* Forensic Graph Canvas Container */}
      <div className="rounded-[14px] border border-[#2B2D2A] bg-[#121412] p-4 shadow-xl overflow-hidden relative">
        {/* Top Header Bar inside Canvas */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#252823] mb-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF5B35] animate-pulse" />
            <span className="text-[#F2EFE7] font-semibold tracking-wide">Multi-Hop Entity Resolution Canvas</span>
            <span className="px-2 py-0.5 rounded bg-[#1C1F1B] border border-[#3E443B] text-[10px] text-[#A7AAA3]">
              {graph.summary?.topology_type || "Graph Forensics"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterMode(filterMode === "ALL" ? "ANOMALIES" : "ALL")}
              className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all border ${
                filterMode === "ANOMALIES"
                  ? "bg-[#FF5B35]/20 border-[#FF5B35] text-[#FF5B35] font-bold shadow-[0_0_12px_rgba(255,91,53,0.3)]"
                  : "bg-[#1C1F1B] border-[#3E443B] text-[#A7AAA3] hover:text-white"
              }`}
            >
              {filterMode === "ANOMALIES" ? "▲ Anomalous Paths Only" : "● All Graph Paths"}
            </button>
          </div>
        </div>

        {/* SVG Drawing Canvas */}
        <div className="overflow-x-auto">
          <svg viewBox="0 0 940 380" className="w-full h-auto min-w-[720px] max-h-[420px] select-none">
            <defs>
              <pattern id="forensic-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="#252923" />
              </pattern>
              <marker id="arr-normal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#62665F" />
              </marker>
              <marker id="arr-alert" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#FF5B35" />
              </marker>
              <filter id="glow-danger" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#FF5B35" floodOpacity="0.6" />
              </filter>
            </defs>

            {/* Grid Pattern Background */}
            <rect width="940" height="380" fill="url(#forensic-grid)" rx="8" />

            {/* Edges with Bézier Curves */}
            {edges.map((e: any, idx: number) => {
              const c1 = coords[e.from];
              const c2 = coords[e.to];
              if (!c1 || !c2) return null;

              const isSusp = !!e.is_suspicious;
              const isVertical = Math.abs(c1.x - c2.x) < 30;

              let d = "";
              let midX = (c1.x + c2.x) / 2;
              let midY = (c1.y + c2.y) / 2;

              if (c2.x > c1.x) {
                const x1 = c1.x + HALF_W;
                const y1 = c1.y;
                const x2 = c2.x - HALF_W;
                const y2 = c2.y;
                const dx = x2 - x1;
                d = `M ${x1} ${y1} C ${x1 + dx * 0.45} ${y1}, ${x2 - dx * 0.45} ${y2}, ${x2} ${y2}`;
                midX = (x1 + x2) / 2;
                midY = (y1 + y2) / 2;
              } else if (isVertical) {
                const dir = c1.x < 450 ? -1 : 1;
                const x1 = c1.x + dir * HALF_W;
                const y1 = c1.y;
                const x2 = c2.x + dir * HALF_W;
                const y2 = c2.y;
                const arcX = c1.x + dir * (HALF_W + 36);
                d = `M ${x1} ${y1} C ${arcX} ${y1}, ${arcX} ${y2}, ${x2} ${y2}`;
                midX = arcX;
                midY = (y1 + y2) / 2;
              } else {
                const x1 = c1.x - HALF_W;
                const y1 = c1.y;
                const x2 = c2.x + HALF_W;
                const y2 = c2.y;
                const dx = x1 - x2;
                d = `M ${x1} ${y1} C ${x1 - dx * 0.45} ${y1}, ${x2 + dx * 0.45} ${y2}, ${x2} ${y2}`;
                midX = (x1 + x2) / 2;
                midY = (y1 + y2) / 2;
              }

              return (
                <g key={`edge-${idx}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isSusp ? "#FF5B35" : "#4D5248"}
                    strokeWidth={isSusp ? 2.2 : 1.5}
                    strokeDasharray={isSusp ? "6,4" : undefined}
                    markerEnd={isSusp ? "url(#arr-alert)" : "url(#arr-normal)"}
                    filter={isSusp ? "url(#glow-danger)" : undefined}
                    className="transition-all duration-300"
                  />
                  {e.label && (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x={-44}
                        y={-9}
                        width={88}
                        height={18}
                        rx={4}
                        fill="#171916"
                        stroke={isSusp ? "#FF5B35" : "#383C35"}
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fontSize={7.5}
                        fontFamily="JetBrains Mono"
                        fontWeight="600"
                        fill={isSusp ? "#FF8466" : "#A7AAA3"}
                        letterSpacing="0.4px"
                      >
                        {e.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((n: any) => {
              const pt = coords[n.id] || { x: 100, y: 100 };
              const isSelected = selectedNodeId === n.id;
              const isCrit = n.risk === "CRITICAL";
              const isSusp = n.risk === "SUSPICIOUS";
              const isSafe = n.risk === "SAFE";
              const isGw = n.type === "gateway";
              const isTxn = n.id === txnId || n.type === "transaction";

              const strokeColor = isCrit
                ? "#FF5B35"
                : isSusp
                ? "#F59E0B"
                : isTxn
                ? "#FF5B35"
                : isGw
                ? "#38BDF8"
                : isSafe
                ? "#22C55E"
                : "#454B41";

              const fillColor = isCrit
                ? "#251412"
                : isSusp
                ? "#251C13"
                : isTxn
                ? "#221714"
                : isGw
                ? "#131E24"
                : "#1A1D1A";

              const label = String(n.label || n.id);
              const displayLabel = label.length > 18 ? label.slice(0, 16) + "…" : label;

              return (
                <g
                  key={n.id}
                  transform={`translate(${pt.x}, ${pt.y})`}
                  onClick={() => setSelectedNodeId(n.id)}
                  className="cursor-pointer group"
                >
                  {/* Selection / Pulse Halo */}
                  {isSelected && (
                    <rect
                      x={-HALF_W - 4}
                      y={-CARD_H / 2 - 4}
                      width={CARD_W + 8}
                      height={CARD_H + 8}
                      rx={12}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={1.8}
                      strokeDasharray="4,4"
                      className="animate-spin"
                      style={{ animationDuration: "12s" }}
                    />
                  )}

                  {/* Card Background */}
                  <rect
                    x={-HALF_W}
                    y={-CARD_H / 2}
                    width={CARD_W}
                    height={CARD_H}
                    rx={9}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 2 : 1.4}
                    filter={isCrit || isTxn ? "url(#glow-danger)" : undefined}
                    className="transition-all duration-150 group-hover:brightness-125"
                  />

                  {/* Icon Badge */}
                  <text x={-HALF_W + 12} y={-4} fontSize={13} textAnchor="start">
                    {getIcon(n.type, n.risk)}
                  </text>

                  {/* Role / Category Header */}
                  <text
                    x={-HALF_W + 30}
                    y={-10}
                    fontSize={8}
                    fontFamily="JetBrains Mono"
                    fontWeight="700"
                    fill={isCrit ? "#FF8466" : isSusp ? "#FBBF24" : "#8E938A"}
                    letterSpacing="0.8px"
                  >
                    {String(n.role || n.type || "ENTITY").slice(0, 18).toUpperCase()}
                  </text>

                  {/* Entity Primary Label */}
                  <text
                    x={-HALF_W + 30}
                    y={5}
                    fontSize={10.5}
                    fontFamily="JetBrains Mono"
                    fontWeight="700"
                    fill="#FFFFFF"
                  >
                    {displayLabel}
                  </text>

                  {/* Risk Chip on Bottom Right */}
                  <g transform={`translate(${HALF_W - 44}, ${CARD_H / 2 - 14})`}>
                    <rect
                      x={0}
                      y={0}
                      width={38}
                      height={11}
                      rx={3}
                      fill={isCrit ? "rgba(255,91,53,0.25)" : isSusp ? "rgba(245,158,11,0.25)" : "rgba(34,197,94,0.15)"}
                      stroke={strokeColor}
                      strokeWidth={0.8}
                    />
                    <text
                      x={19}
                      y={8}
                      textAnchor="middle"
                      fontSize={6.5}
                      fontFamily="JetBrains Mono"
                      fontWeight="700"
                      fill={isCrit ? "#FF8466" : isSusp ? "#FBBF24" : "#4ADE80"}
                    >
                      {n.risk || "SAFE"}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Canvas Bottom Legend Bar */}
        <div className="mt-3 pt-3 border-t border-[#252823] flex flex-wrap items-center justify-between gap-3 text-[10.5px] font-mono text-[#8E938A]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="text-xs">👤</span> Identity Payer</span>
            <span className="flex items-center gap-1.5"><span className="text-xs">💳</span> Funding Account</span>
            <span className="flex items-center gap-1.5"><span className="text-xs">📱</span> Hardware Fingerprint</span>
            <span className="flex items-center gap-1.5"><span className="text-xs">⚡</span> Ingress Hub</span>
            <span className="flex items-center gap-1.5"><span className="text-xs">🔄</span> Gateway Switch</span>
            <span className="flex items-center gap-1.5"><span className="text-xs">🏢</span> Settlement Escrow</span>
            <span className="flex items-center gap-1.5 text-[#FF5B35]">
              <span className="w-3 border-b-2 border-dashed border-[#FF5B35] inline-block mr-0.5" /> Rogue / Anomaly Link
            </span>
          </div>
          <div className="text-[10px] text-[#A7AAA3] uppercase tracking-wider">
            Click any node to inspect forensics
          </div>
        </div>
      </div>

      {/* Interactive Entity Forensic Inspector Drawer */}
      {selectedNode && (
        <div className="rounded-[12px] border border-[#2B2D2A] bg-[#171916] text-[#F2EFE7] p-4 shadow-md space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-[#2B2D2A]">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getIcon(selectedNode.type, selectedNode.risk)}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-white tracking-wide">
                    {selectedNode.label || selectedNode.id}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded bg-[#252923] border border-[#3E443B] text-[#A7AAA3]">
                    {selectedNode.type}
                  </span>
                </div>
                <div className="font-mono text-xs text-[#8E938A]">{selectedNode.role || "Graph Entity"}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-[10px] font-bold uppercase px-2.5 py-1 rounded border ${
                  selectedNode.risk === "CRITICAL"
                    ? "bg-[#FF5B35]/20 text-[#FF5B35] border-[#FF5B35]/50"
                    : selectedNode.risk === "SUSPICIOUS"
                    ? "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/50"
                    : selectedNode.risk === "SAFE"
                    ? "bg-[#22C55E]/15 text-[#4ADE80] border-[#22C55E]/40"
                    : "bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40"
                }`}
              >
                Risk Status: {selectedNode.risk || "NEUTRAL"}
              </span>
            </div>
          </div>

          {/* Forensic Key-Value Attributes Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            {selectedNode.details ? (
              Object.entries(selectedNode.details).map(([k, v]: [string, any]) => (
                <div key={k} className="bg-[#1F221E] p-2.5 rounded-[8px] border border-[#2B2D2A]">
                  <div className="text-[9px] uppercase tracking-wider text-[#7F837B] mb-1">{k.replace(/_/g, " ")}</div>
                  <div className="text-[11px] text-[#FFFFFF] font-medium truncate" title={String(v)}>
                    {typeof v === "boolean" ? (v ? "YES" : "NO") : Array.isArray(v) ? v.join(", ") : String(v)}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-4 text-[#7F837B] text-[11px]">
                Standard entity topology mapped from transaction ingress rail.
              </div>
            )}
          </div>

          {/* Graph Note Annotation */}
          {graph.note && (
            <div className="pt-2 text-[11px] font-mono text-[#A7AAA3] border-t border-[#252823] flex items-center gap-2">
              <span className="text-[#FF5B35]">●</span>
              <span>{graph.note}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Investigation() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [rec, setRec] = useState<Rec | null>(null);
  const [copilot, setCopilot] = useState<any>(null);
  const [graph, setGraph] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      try { setRec(await api.get(id)); } catch { setRec(null); }
      try { setGraph(await api.graph(id)); } catch {}
    })();
  }, [id]);

  if (!rec) return (
    <div className="min-h-screen bg-[#F2EFE7] p-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="font-mono text-sm text-[#7F837B]">Loading transaction telemetry…</div>
        <button className="btn-secondary py-1.5 px-4" onClick={() => router.push("/")}>← Back to Command Center</button>
      </div>
    </div>
  );

  const t = rec.transaction as Record<string, any>;
  const s = rec.score;
  const shapMax = Math.max(1, ...s.signals.map((x: any) => Math.abs(x.contribution)));

  return (
    <div className="min-h-screen bg-[#F2EFE7] text-[#171916] flex flex-col justify-between">
      <div>
        <NavHeader />

        <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/">← Command Center</Link>
            <div className="flex items-center gap-2">
              <Src s={s.source} />
              <Tip label={<Badge level={s.risk_level} />} text={LEVEL_MEANINGS[s.risk_level] ?? s.risk_level} />
            </div>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#D8D4CA] pb-4">
            <div>
              <span className="badge-pill mb-2 inline-block">Forensic Workstation</span>
              <h1 className="font-title-strong text-2xl text-[#171916] font-mono">{t.transaction_id}</h1>
            </div>
            <div className="text-right">
              <div className="font-mono text-xs text-[#7F837B] uppercase">
                <Tip label="Calibrated Risk Score ⓘ" text={SCORE_MEANING} />
              </div>
              <div className={`font-mono text-3xl font-bold ${s.risk_score >= 0.6 ? "text-[#C53030]" : "text-[#1B5E20]"}`}>
                {s.risk_score.toFixed(3)}
              </div>
            </div>
          </div>

          {/* Plain-English verdict: why this decision, in one line */}
          <div className="rounded-[11px] p-4 border bg-white border-[#D8D4CA] flex items-start gap-3">
            <span className="text-xl">{s.risk_score >= 0.6 ? "🔍" : "✅"}</span>
            <div>
              <div className="font-mono text-[10px] text-[#7F837B] uppercase mb-1">In plain English</div>
              <div className="text-sm text-[#171916]">{whyFlagged(s)}</div>
            </div>
          </div>

          {s.risk_score >= 0.6 && (
            <div className="border border-[#FF5B35]/40 bg-[#FF5B35]/10 rounded-[11px] p-4 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="font-title-strong text-sm text-[#C53030]">High-Risk Security Interception — {s.risk_level}</div>
                <div className="text-xs text-[#555951]">Evidence-driven decision synthesized from XGBoost + anomaly detection + behavioral drift + rules + graph cliques.</div>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            <Card>
              <div className="font-title-strong text-sm text-[#171916] mb-3">Transaction Telemetry</div>
              <div className="space-y-2 text-xs font-mono">
                {[
                  ["Amount", `₹${Number(t.amount).toLocaleString("en-IN")}`],
                  ["Timestamp", String(t.timestamp).slice(0, 19).replace("T", " ")],
                  ["Merchant / Payee", t.merchant],
                  ["Category", t.merchant_category],
                  ["Location", t.location],
                  ["Device ID", String(t.device_id)],
                  ["Payer User", t.user_id],
                  ["Velocity (5m)", String(t.velocity)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-[#E7E4DB] py-1.5">
                    <span className="text-[#7F837B]">{k}</span>
                    <span className="text-[#171916] font-semibold">{v}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="font-title-strong text-sm text-[#171916] mb-3">5-Signal Risk Fusion</div>
              <div className="space-y-2 text-xs font-mono">
                {[
                  ["Fused Decision", s.risk_score.toFixed(3), "All 5 signals blended into the final score."],
                  ["XGBoost Score", s.xgb_score != null ? s.xgb_score.toFixed(3) : "NOT AVAILABLE", "ML model verdict from past fraud patterns."],
                  ["Isolation Forest", s.anomaly_score.toFixed(3), "How strange this looks vs normal payments."],
                  ["Behavioral Drift", s.behavioral_score.toFixed(3), "How far this is from the user's own habits."],
                  ["Graph Cluster Score", s.graph_score != null ? s.graph_score.toFixed(3) : "NOT AVAILABLE", "Whether the device links to known fraud rings."],
                ].map(([k, v, tip]) => (
                  <div key={k} className="flex justify-between border-b border-[#E7E4DB] py-1.5">
                    <span className="text-[#7F837B]"><Tip label={`${k} ⓘ`} text={tip} /></span>
                    <span className="text-[#171916] font-semibold">{String(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-b border-[#E7E4DB] py-1.5 gap-3">
                  <span className="text-[#7F837B] shrink-0"><Tip label="Active Rules ⓘ" text="Tripwires that fired. Hover any chip for what it means." /></span>
                  <span className="flex flex-wrap gap-1 justify-end">
                    {s.rules.length === 0 ? (
                      <span className="text-[#171916] font-semibold">None</span>
                    ) : (
                      s.rules.map((r: string) => (
                        <Tip key={r} label={<span className="mono text-[10px] px-2 py-0.5 rounded-full border border-[#FF5B35]/40 bg-[#FF5B35]/10 text-[#A23C27] font-semibold">{r}</span>} text={ruleMeaning(r)} />
                      ))
                    )}
                  </span>
                </div>
                <div className="pt-3 border-t border-[#E7E4DB]">
                  <div className="font-mono text-[10px] text-[#7F837B] uppercase">Engine Action</div>
                  <div className={`mt-1 font-mono text-xs font-bold px-2.5 py-1 rounded-[7px] border inline-block ${
                    s.risk_level === "CRITICAL"
                      ? "bg-[#C53030] text-white border-[#C53030]"
                      : s.risk_level === "HIGH"
                      ? "bg-[#FF5B35] text-white border-[#FF5B35]"
                      : s.risk_level === "MEDIUM"
                      ? "bg-[#B7791F]/20 text-[#B7791F] border-[#B7791F]/40"
                      : "bg-[#2E7D32]/20 text-[#1B5E20] border-[#2E7D32]/40"
                  }`}>
                    {s.risk_level === "CRITICAL" ? "BLOCK TRANSACTION" : s.risk_level === "HIGH" ? "STEP-UP AUTH / INVESTIGATE" : s.risk_level === "MEDIUM" ? "STEP-UP OTP" : "AUTO APPROVE"}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="font-title-strong text-sm text-[#171916] mb-3">Forensic Evidence Chain</div>
              <ul className="space-y-2 text-xs text-[#555951]">
                {s.evidence.map((e: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 bg-[#F2EFE7] p-2 rounded-[7px] border border-[#E7E4DB]">
                    <span className="text-[#FF5B35] font-bold">•</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 font-mono text-[10px] text-[#7F837B]">
                Synthesized directly from live ML signals.
              </div>
            </Card>
          </div>

          {/* SHAP Waterfall Attribution */}
          <Card>
            <div id="shap" className="font-title-strong text-sm text-[#171916] mb-4 flex items-center justify-between">
              <span><Tip label="SHAP Feature Attribution Waterfall ⓘ" text="Each bar = how much that factor pushed the score toward fraud (orange) or safety (green). Longer bar = bigger influence." /></span>
              <span className="font-mono text-[10px] text-[#7F837B] uppercase">Grounded Mathematical Weights</span>
            </div>
            {s.signals.length === 0 ? (
              <div className="text-xs text-[#7F837B]">No SHAP attribution signals available for this transaction.</div>
            ) : (
              <div className="space-y-2.5">
                {s.signals.slice().sort((a: any, b: any) => Math.abs(b.contribution) - Math.abs(a.contribution)).map((sig: any) => (
                  <div key={sig.name} className="flex items-center gap-3 font-mono text-xs">
                    <span className="w-40 text-[#555951] truncate"><Tip label={sig.name} text={signalMeaning(sig.name)} /></span>
                    <div className="flex-1 h-4 bg-[#E7E4DB] rounded-full overflow-hidden flex">
                      <div
                        className="h-full flex items-center justify-end pr-1 text-[9px] text-white font-bold"
                        style={{
                          width: `${(Math.abs(sig.contribution) / shapMax) * 100}%`,
                          backgroundColor: sig.contribution >= 0 ? "#FF5B35" : "#2E7D32"
                        }}
                      >
                        {sig.contribution >= 0 ? "▲" : "▼"}
                      </div>
                    </div>
                    <span className="w-20 text-right font-bold text-[#171916]">{sig.contribution >= 0 ? "+" : ""}{sig.contribution.toFixed(3)}</span>
                    <span className="w-20 text-right text-[#7F837B]">{sig.value}</span>
                  </div>
                ))}
                <div className="flex gap-6 font-mono text-xs text-[#7F837B] pt-2 border-t border-[#E7E4DB]">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#FF5B35]" /> Shifts toward Fraud (+)</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#2E7D32]" /> Shifts toward Legit (-)</span>
                </div>
              </div>
            )}
          </Card>

          {/* Graph Intelligence */}
          <Card>
            <div className="font-title-strong text-sm text-[#171916] mb-3 flex items-center justify-between">
              <span>Entity Relational Graph — {graph?.kind === "DEMO_SIMULATION" ? "SIMULATION" : "LIVE"}</span>
              <span className="font-mono text-[10px] text-[#7F837B] uppercase">Device & Account Sharing Clusters</span>
            </div>
            <ForensicEntityGraph graph={graph} txnId={t.transaction_id} />
          </Card>

          {/* Investigation Copilot */}
          <Card>
            <div id="copilot" className="font-title-strong text-sm text-[#171916] mb-1">
              AI Forensic Copilot
            </div>
            <div className="text-xs text-[#7F837B] mb-3">
              The LLM reads structured forensic telemetry and articulates rationale — it never decides or overrides the numerical risk score.
            </div>
            <button
              className="btn-primary"
              onClick={async () => {
                setLoading(true);
                try {
                  const body = {
                    transaction_amount: t.amount, usual_amount: 4200, new_device: String(t.device_id).includes("NEW") || String(t.device_id).includes("X"),
                    location_distance_km: String(t.location).includes("400") ? 400 : String(t.location).includes("120") ? 120 : 10,
                    recent_transaction_count: t.velocity, xgboost_score: s.xgb_score ?? s.risk_score, anomaly_score: s.anomaly_score,
                    triggered_rules: s.rules, graph_signals: { shared_device_accounts: s.graph_score && s.graph_score > 0.5 ? 4 : 1 },
                  };
                  setCopilot(await api.explain(body));
                } finally { setLoading(false); }
              }}
            >
              {loading ? "Generating Grounded Rationale…" : "Generate Copilot Explanation"}
            </button>

            {copilot && (
              <div className="mt-4 border border-[#D8D4CA] bg-[#F2EFE7] rounded-[11px] p-4 font-mono text-xs space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[#7F837B]">Risk Assessed:</span>
                  <Badge level={copilot.risk_level} />
                </div>
                <div><span className="text-[#7F837B]">Typology:</span> <span className="font-bold text-[#171916]">{copilot.fraud_type}</span></div>
                <div className="text-[#171916] leading-relaxed bg-[#FFFFFF] p-3 rounded-[7px] border border-[#E7E4DB]">{copilot.summary}</div>
                <div>
                  <span className="text-[#7F837B] block mb-1">Structured Evidence:</span>
                  <ul className="list-disc ml-5 space-y-0.5 text-[#555951]">
                    {(copilot.evidence ?? []).map((e: string) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
                <div className="pt-2 border-t border-[#E7E4DB]"><span className="text-[#7F837B]">Recommended Action:</span> <span className="font-bold text-[#FF5B35]">{copilot.recommended_action}</span></div>
              </div>
            )}
            {/* Raw Gateway Webhook Payload */}
            {(t.raw_payload || t.gateway === "Cashfree" || String(t.transaction_id).startsWith("CF-")) && (
              <Card>
                <div className="font-title-strong text-sm text-[#171916] mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#00897B]"></span>
                    Cashfree Gateway — Raw Webhook JSON Payload
                  </span>
                  <span className="badge-pill bg-[#00897B]/20 text-[#00897B] font-mono text-[9px]">GATEWAY PAYLOAD</span>
                </div>
                <div className="text-xs text-[#7F837B] mb-3">
                  Original structured event payload received from Cashfree Payment Gateway before 36-feature extraction.
                </div>
                <pre className="p-4 rounded-[7px] bg-[#171916] text-[#26A69A] font-mono text-xs overflow-x-auto max-h-[300px]">
                  {JSON.stringify(t.raw_payload || {
                    gateway: "Cashfree PG",
                    transaction_id: t.transaction_id,
                    amount: t.amount,
                    customer: t.user_id,
                    timestamp: t.timestamp,
                    channel: t.channel || "UPI",
                    status: "PAYMENT_SUCCESS"
                  }, null, 2)}
                </pre>
              </Card>
            )}
          </Card>
        </main>
      </div>

      <FinShieldFooter />
    </div>
  );
}

export function Performance() {
  const [m, setM] = useState<any>(null);

  useEffect(() => {
    api.metrics().then(setM).catch(() => {});
  }, []);

  if (!m) return (
    <div className="min-h-screen bg-[#F2EFE7] p-8 font-mono text-sm text-[#7F837B]">
      Loading benchmark telemetry…
    </div>
  );

  const row = (name: string, d: any) => (
    <tr className="border-b border-[#E7E4DB] font-mono text-xs">
      <td className="py-2.5 font-bold text-[#171916]">{name}</td>
      <td>{d.roc_auc.toFixed(4)}</td>
      <td>{d.pr_auc.toFixed(4)}</td>
      <td>{d.precision.toFixed(4)}</td>
      <td>{d.recall.toFixed(4)}</td>
      <td>{d.f1.toFixed(4)}</td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-[#F2EFE7] text-[#171916] flex flex-col justify-between">
      <div>
        <NavHeader />

        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/">← Command Center</Link>
          <div className="border-b border-[#D8D4CA] pb-3">
            <span className="badge-pill mb-1 inline-block">Validation Laboratory</span>
            <h1 className="font-title-strong text-2xl text-[#171916]">Model Performance & Benchmarks</h1>
          </div>

          <Card>
            <div className="font-title-strong text-sm text-[#171916] flex items-center justify-between">
              <span>Real ULB Benchmark Results</span>
              <span className="font-mono text-[10px] text-[#7F837B]">284,807 ROWS • 492 FRAUD (0.17%)</span>
            </div>
            <p className="text-xs text-[#555951] mt-1">Read directly from evaluation reports. Stratified split, scaler fitted exclusively on training set.</p>
            <table className="w-full mt-4 font-mono">
              <thead>
                <tr className="text-left text-[#7F837B] text-[10px] uppercase border-b border-[#E7E4DB] pb-2">
                  <th className="py-2">Model Architecture</th><th>ROC-AUC</th><th>PR-AUC</th><th>Precision</th><th>Recall</th><th>F1-Score</th>
                </tr>
              </thead>
              <tbody>
                {row("Logistic Regression (Baseline)", m.logistic_regression)}
                {row("XGBoost (500 Trees, Scaled)", m.xgboost)}
              </tbody>
            </table>
            <div className="mt-4 p-3 bg-[#F2EFE7] rounded-[7px] border border-[#D8D4CA] font-mono text-xs text-[#555951]">
              XGBoost Confusion Matrix @0.5 Threshold: <strong>TP {m.xgboost.confusion_matrix.tp}</strong> • <strong>FN {m.xgboost.confusion_matrix.fn}</strong> • <strong>FP {m.xgboost.confusion_matrix.fp}</strong> • <strong>TN {m.xgboost.confusion_matrix.tn}</strong>
            </div>
          </Card>

          <Card>
            <div className="font-title-strong text-sm text-[#171916] mb-1">Synthetic Robustness Stress-Testing</div>
            <p className="text-xs text-[#555951]">Evaluating model behavior under intentional feature overlap and extreme class dilution.</p>
            <table className="w-full mt-4 font-mono text-xs">
              <thead>
                <tr className="text-left text-[#7F837B] text-[10px] uppercase border-b border-[#E7E4DB] pb-2">
                  <th className="py-2">Dataset Scenario</th><th>Fraud Rate</th><th>XGB PR-AUC</th><th>Evaluation Analysis</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#E7E4DB]"><td className="py-2 font-bold">Easy Synthetic</td><td>11.5%</td><td>0.959</td><td className="text-[#7F837B]">High separability; extreme amounts</td></tr>
                <tr className="border-b border-[#E7E4DB]"><td className="py-2 font-bold">1% Diluted</td><td>1.07%</td><td>0.553</td><td className="text-[#7F837B]">Realistic imbalance test</td></tr>
                <tr className="border-b border-[#E7E4DB] bg-[#FF5B35]/10"><td className="py-2 font-bold text-[#FF5B35]">Hard Overlap</td><td>1.10%</td><td className="font-bold text-[#FF5B35]">0.373</td><td className="text-[#555951]">Feature overlap stress; 33.9× lift</td></tr>
                <tr className="border-b border-[#E7E4DB] bg-[#2E7D32]/10"><td className="py-2 font-bold text-[#1B5E20]">Real ULB Benchmark</td><td>0.17%</td><td className="font-bold text-[#1B5E20]">{m.xgboost.pr_auc.toFixed(4)}</td><td className="text-[#555951]">Primary real-world benchmark (486× lift)</td></tr>
              </tbody>
            </table>
          </Card>
        </main>
      </div>

      <FinShieldFooter />
    </div>
  );
}

export function Architecture() {
  return (
    <div className="min-h-screen bg-[#F2EFE7] text-[#171916] flex flex-col justify-between">
      <div>
        <NavHeader />

        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/">← Command Center</Link>
          <div className="border-b border-[#D8D4CA] pb-3">
            <span className="badge-pill mb-1 inline-block">System Design</span>
            <h1 className="font-title-strong text-2xl text-[#171916]">FinShield Architecture & Data Flow</h1>
          </div>

          <Card>
            <div className="font-mono text-xs text-[#555951] leading-relaxed overflow-x-auto p-4 bg-[#F2EFE7] rounded-[7px] border border-[#D8D4CA]">
              <pre>
{`                          TRANSACTION INGESTION
                                    │
                                    ▼
                          36-FEATURE EXTRACTION
                        (No Leakage, ts < t Only)
                                    │
               ┌────────────────────┼────────────────────┐
               ▼                    ▼                    ▼
       XGBoost Classifier   Behavioral Profile   Deterministic Rules
         (35% Weight)         (15% Weight)          (20% Weight)
               │                    │                    │
               └────────────────────┼────────────────────┘
                                    ▼
                         ISOLATION FOREST ANOMALY
                               (20% Weight)
                                    │
                                    ▼
                         NETWORKX GRAPH ANALYTICS
                               (10% Weight)
                                    │
                                    ▼
                            RISK FUSION ENGINE
                   (GREEN < 0.3 | YELLOW < 0.7 | RED >= 0.7)
                                    │
                                    ▼
                           SHAP TREE EXPLAINER
                       (Grounded Mathematical Proof)
                                    │
                                    ▼
                       AI FORENSIC INVESTIGATION COPILOT
                         (Explains Engine Evidence Only)
                                    │
                                    ▼
                       PRIVACY IDENTITY LAYER (SALTED SHA-256)`}
              </pre>
            </div>
          </Card>
        </main>
      </div>

      <FinShieldFooter />
    </div>
  );
}

export function Privacy() {
  const { uid } = useParams() as { uid: string };
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    if (uid) api.identity(uid).then(setD).catch(() => {});
  }, [uid]);

  return (
    <div className="min-h-screen bg-[#F2EFE7] text-[#171916] flex flex-col justify-between">
      <div>
        <NavHeader />

        <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <Link className="font-nav-link text-[#555951] hover:text-[#FF5B35] transition-colors" href="/">← Command Center</Link>
          <div className="border-b border-[#D8D4CA] pb-3">
            <span className="badge-pill mb-1 inline-block">Security Protocol</span>
            <h1 className="font-title-strong text-2xl text-[#171916]">Privacy-Preserving Identity Layer</h1>
            <p className="text-xs text-[#7F837B] mt-1 font-mono">Salted Cryptographic Hash Tokenization — PII never touches the model features.</p>
          </div>

          <Card>
            <div className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-3 gap-2 border-b border-[#E7E4DB] pb-2 text-[10px] text-[#7F837B] uppercase font-bold">
                <span>Field</span><span>Raw Ingestion</span><span>Tokenized Mask</span>
              </div>
              {[
                ["User Identity", d?.user_id ?? uid, d?.token ?? "a84f…91bc"],
                ["Phone Number", "••••••••42", d?.phone_masked ?? "••••••••42"],
                ["National ID Token", "CONFIDENTIAL", d?.id_token ?? "tok_9f3a…"],
                ["Verification Hash", "VERIFIED", d?.verification ?? "VERIFIED"],
              ].map(([k, raw, tok]) => (
                <div key={k} className="grid grid-cols-3 gap-2 border-b border-[#E7E4DB] py-2.5">
                  <span className="text-[#7F837B]">{k}</span>
                  <span className="text-[#555951]">{String(raw)}</span>
                  <span className="text-[#FF5B35] font-bold">{String(tok)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 font-mono text-[11px] text-[#7F837B]">
              Method: {d?.method ?? "Prototype Salted SHA-256 Pseudonymization"}
            </div>
          </Card>
        </main>
      </div>

      <FinShieldFooter />
    </div>
  );
}

export function Glossary() {
  return (
    <div className="min-h-screen bg-[#F2EFE7] text-[#171916] flex flex-col justify-between">
      <div>
        <NavHeader />

        <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div>
            <span className="badge-pill mb-2 inline-block">No jargon, promise</span>
            <h1 className="font-title-strong text-2xl text-[#171916]">Glossary — every term in plain English</h1>
            <p className="text-sm text-[#555951] mt-1">The same one-line meanings appear when you hover any dotted term across the app.</p>
          </div>

          <Card>
            <div className="space-y-2">
              {GLOSSARY.map((g) => (
                <div key={g.term} className="border-b border-[#E7E4DB] py-2.5 last:border-0">
                  <div className="font-mono text-xs font-bold text-[#171916]">{g.term}</div>
                  <div className="text-sm text-[#555951]">{g.meaning}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="font-title-strong text-sm text-[#171916] mb-2">Every tripwire, decoded</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(RULE_MEANINGS).map(([code, meaning]) => (
                <Tip key={code} label={<span className="mono text-[10px] px-2 py-0.5 rounded-full border border-[#FF5B35]/40 bg-[#FF5B35]/10 text-[#A23C27] font-semibold">{code}</span>} text={meaning} />
              ))}
            </div>
          </Card>
        </main>
      </div>

      <FinShieldFooter />
    </div>
  );
}
