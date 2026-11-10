"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";

/* ------------------------------------------------------------------ shared */

const CREAM = "#F2EFE7";

function PageHeader({ badge, title, sub }: { badge: string; title: string; sub: string }) {
  return (
    <div className="border-b border-[#D8D4CA] pb-3">
      <Link href="/command-center" className="mb-2 block w-fit font-mono text-[10px] text-[#555951] hover:text-[#FF5B35]">
        ← Command Center
      </Link>
      <span className="badge-pill mb-1 inline-block">{badge}</span>
      <h1 className="font-title-strong text-2xl text-[#171916]">{title}</h1>
      <p className="mt-1 text-xs text-[#7F837B]">{sub}</p>
    </div>
  );
}

function LevelChip({ level }: { level?: string }) {
  if (!level) return null;
  return <span className={`risk-${level} mono`}>{level}</span>;
}

function SrcChip({ s }: { s?: string }) {
  if (!s) return null;
  return <span className={`src-${s === "LIVE_MODEL" || s === "LIVE_LLM" ? "LIVE_MODEL" : "DEMO_FALLBACK"} mono text-[9px]`}>{s}</span>;
}

const SCENARIO_LABELS: Record<string, string> = {
  clean: "CLEAN",
  friendly_fraud: "FRIENDLY FRAUD",
  review: "REVIEW",
  stolen_account: "STOLEN ACCT",
};

const STATUS_COLORS: Record<string, string> = {
  CAPTURED: "#2E7D32",
  VOIDED: "#C53030",
  HELD_STEP_UP: "#B7791F",
  HELD_REVIEW: "#B7791F",
  AUTHORIZED: "#555951",
  ORDER_CREATED: "#7F837B",
  FAILED: "#C53030",
  REFUNDED: "#00897B",
};

function StatusPill({ status }: { status?: string | null }) {
  if (!status) return null;
  return (
    <span className="mono inline-block rounded-full px-2 py-[2px] text-[9px] font-bold"
      style={{ background: `${STATUS_COLORS[status] || "#7F837B"}18`, color: STATUS_COLORS[status] || "#7F837B" }}>
      {status}
    </span>
  );
}

/* small inline icon set — no icon library */
const Icon = {
  check: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke={c} strokeWidth="1.6" /><path d="M5 8.2l2 2L11.5 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  x: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke={c} strokeWidth="1.6" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke={c} strokeWidth="1.8" strokeLinecap="round" /></svg>
  ),
  lock: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3.5" y="7" width="9" height="6.5" rx="1.6" stroke={c} strokeWidth="1.6" /><path d="M5.5 7V5.4a2.5 2.5 0 015 0V7" stroke={c} strokeWidth="1.6" /></svg>
  ),
  shield: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l5.2 2v4.3c0 3.2-2.1 5.5-5.2 6.7-3.1-1.2-5.2-3.5-5.2-6.7V3.5L8 1.5z" stroke={c} strokeWidth="1.5" /><path d="M5.8 8l1.7 1.7L10.4 6.6" stroke={c} strokeWidth="1.6" strokeLinecap="round" /></svg>
  ),
  refund: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 11-1.6-3.9" stroke={c} strokeWidth="1.6" strokeLinecap="round" /><path d="M13.7 1.8v3h-3" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
};

type PayPalConfigData = { environment: string; sdk_url: string; client_id: string; enabled: boolean };

/* ---------------------------------------------- PayPal fulfilment shield page */

type DecisionData = {
  intent_id?: string;
  decision?: string;
  risk_score?: number;
  risk_level?: string;
  source?: string;
  status?: string;
  rules?: string[];
  rule_messages?: string[];
  evidence?: string[];
  signals?: { name: string; value: number; contribution: number }[];
  authorization_id?: string;
  capture_id?: string;
  void_status?: string;
  buyer?: Record<string, unknown>;
};

type IntentRow = {
  id: string;
  paypal_order_id: string | null;
  status: string | null;
  decision: string | null;
  risk_score: number | null;
  risk_level: string | null;
  amount: string | null;
  currency: string | null;
  scenario: string | null;
};

const SCENARIOS = [
  { key: "clean", label: "Clean returning buyer", amount: "$42.00", blurb: "Known device, usual amount → auto-capture" },
  { key: "friendly_fraud", label: "Friendly-fraudster", amount: "$220.00", blurb: "Amount far off profile → OTP step-up" },
  { key: "review", label: "Suspicious pattern", amount: "$180.00", blurb: "New device + activity spike → analyst review" },
  { key: "stolen_account", label: "Stolen account", amount: "$4,800.00", blurb: "High value + shared device → auto-void" },
];

const SIGNAL_COLORS: Record<string, string> = {
  amount_deviation: "#FF5B35",
  velocity: "#FF795A",
  behavioral: "#B7791F",
  anomaly: "#00897B",
  graph: "#555951",
  xgb: "#171916",
};

function SignalBars({ signals }: { signals: DecisionData["signals"] }) {
  const rows = signals || [];
  if (!rows.length) return null;
  return (
    <div className="space-y-1.5">
      {rows.map((s, i) => {
        const pct = Math.min(100, Math.round(((s.contribution || 0) / 0.35) * 100));
        const color = SIGNAL_COLORS[s.name] || "#FF5B35";
        return (
          <div key={s.name} className="fin-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] text-[#555951]">{s.name}</span>
              <span className="font-mono text-[9px] text-[#7F837B]">value {s.value} · contrib {s.contribution}</span>
            </div>
            <div className="mt-[2px] h-[6px] w-full rounded-full bg-[#E7E4DB]">
              <div className="fin-bar h-[6px] rounded-full" style={{ width: `${Math.max(pct, 3)}%`, background: color, animationDelay: `${i * 60}ms` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VerdictPanel({ decision }: { decision: DecisionData }) {
  const status = decision.status || "";
  const captured = status === "CAPTURED";
  const voided = status === "VOIDED";
  const held = status === "HELD_STEP_UP" || status === "HELD_REVIEW";
  const level = decision.risk_level || "";
  const levelColor = { LOW: "#2E7D32", MEDIUM: "#B7791F", HIGH: "#B7791F", CRITICAL: "#C53030" }[level] || "#555951";

  return (
    <div className={`fin-fade-up rounded-[14px] border p-5 ${
      captured ? "border-[#4CAF50] bg-[#E8F5E9]" : voided ? "border-[#C53030] bg-[#FDECEC]" : "border-[#B7791F] bg-[#FFF8E7]"
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] tracking-[1.5px] text-[#7F837B]">FULFILMENT VERDICT</div>
          <div className={`font-display-hero text-4xl leading-tight ${captured ? "text-[#1B5E20]" : voided ? "text-[#C53030]" : "text-[#7B341E]"}`}>
            {captured ? "CAPTURED" : voided ? "VOIDED" : "HELD"}
          </div>
          <div className="font-micro-label mt-1 text-[11px] text-[#555951]">
            {captured && "Payment captured — digital good delivered. Receipt below."}
            {voided && "Authorization voided before delivery — nothing shipped, nothing to dispute."}
            {status === "HELD_STEP_UP" && "Funds locked by PayPal — verify this buyer before the good ships."}
            {status === "HELD_REVIEW" && "Funds locked by PayPal — an analyst decides; the agent can only propose."}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold" style={{ color: levelColor }}>{decision.risk_score}</div>
          <div className="mt-1 flex items-center justify-end gap-1">
            <LevelChip level={level} />
            <SrcChip s={decision.source} />
          </div>
        </div>
      </div>

      {voided && (
        <div className="fin-stamp mt-3 w-fit rounded-[7px] border-[2.5px] border-dashed border-[#C53030] px-4 py-1.5">
          <span className="font-mono text-sm font-bold tracking-[2px] text-[#C53030]">VOIDED BEFORE DELIVERY</span>
        </div>
      )}
      {captured && (
        <div className="fin-fade-up mt-3 flex items-center gap-2 rounded-[7px] bg-white/70 px-3 py-2">
          {Icon.check("#2E7D32")}
          <span className="mono text-[10px] text-[#2E7D32]">capture {decision.capture_id || "—"} · authorization {decision.authorization_id || "—"}</span>
        </div>
      )}

      {(decision.rule_messages?.length) ? (
        <div className="mt-4">
          <div className="font-micro-label text-[10px] text-[#7F837B]">POLICY TRIGGERS</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {decision.rule_messages.map((m, i) => (
              <span key={i} className="badge-pill text-[9px]">{m}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="font-micro-label text-[10px] text-[#7F837B]">POLICY TRIGGERS</div>
          <span className="badge-pill text-[9px]">No rule triggers — within profile</span>
        </div>
      )}

      <div className="mt-4">
        <div className="font-micro-label text-[10px] text-[#7F837B]">SIGNAL CONTRIBUTIONS</div>
        <div className="mt-2"><SignalBars signals={decision.signals} /></div>
      </div>

      <div className="mt-4">
        <div className="font-micro-label text-[10px] text-[#7F837B]">EVIDENCE TRAIL</div>
        <ul className="mt-1 space-y-1">
          {(decision.evidence || []).map((e, i) => (
            <li key={i} className="fin-fade-up font-mono text-[10px] text-[#555951]" style={{ animationDelay: `${i * 50}ms` }}>· {e}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StepStrip() {
  const steps = [
    { n: "1", title: "AUTHORIZE", body: "Buyer completes PayPal checkout — PayPal locks the funds." },
    { n: "2", title: "SCORE", body: "5-signal engine + XGBoost score the authorization with SHAP-grade evidence." },
    { n: "3", title: "GATE", body: "Capture, verify, review — or void before anything ships." },
  ];
  return (
    <div className="mt-5 grid gap-2 md:grid-cols-3">
      {steps.map((s) => (
        <div key={s.n} className="card-white flex items-start gap-3 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#171916] font-mono text-xs font-bold text-[#F2EFE7]">{s.n}</div>
          <div>
            <div className="font-label-caps text-[10px] text-[#FF5B35]">{s.title}</div>
            <div className="mt-[2px] text-[11px] leading-snug text-[#555951]">{s.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PayPalShield() {
  const [cfg, setCfg] = useState<PayPalConfigData | null>(null);
  const [scenario, setScenario] = useState("clean");
  const [customAmount, setCustomAmount] = useState("");
  const [order, setOrder] = useState<{ paypal_order_id: string; amount: string; currency: string } | null>(null);
  const [decision, setDecision] = useState<DecisionData | null>(null);
  const [busy, setBusy] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [err, setErr] = useState("");
  const [otp, setOtp] = useState("");
  const [intents, setIntents] = useState<IntentRow[] | null>(null);
  const sessionRef = useRef<{ start: (mode: Record<string, unknown>, createOrder: () => Promise<string> | string) => Promise<unknown> } | null>(null);

  const refreshIntents = useCallback(async () => {
    const data = (await api.paypalIntents()) as { intents?: IntentRow[] };
    setIntents((data.intents || []).slice(0, 8));
  }, []);

  // Redirect-return: PayPal bounces back here with ?token=<order_id>&PayerID=...
  // after the buyer pays — auto-run the authorization gate immediately.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedToken = params.get("token");
    if (!returnedToken) return;
    window.history.replaceState({}, "", "/paypal");
    setBusy(true);
    (async () => {
      try {
        const d = (await api.paypalAuthorize(returnedToken, { device_id: "DEV-KNOWN-PAYPAL" })) as DecisionData;
        setDecision(d);
        refreshIntents();
      } catch (e) {
        setErr(String(e));
      }
      setBusy(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      const c = (await api.paypalConfig()) as PayPalConfigData;
      setCfg(c);
      refreshIntents();
      if (!c.enabled || c.environment !== "sandbox" || !c.client_id) return;
      // Load PayPal JS SDK v6 and create the one-time payment session.
      const existing = document.querySelector<HTMLScriptElement>('script[data-finshield-paypal]');
      const load = new Promise<void>((resolve, reject) => {
        if ((window as unknown as Window).paypal) return resolve();
        const script = existing ?? document.createElement("script");
        script.dataset.finshieldPaypal = "1";
        script.src = c.sdk_url;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("SDK load failed"));
        if (!existing) document.body.appendChild(script);
      });
      try {
        await load;
        const instance = await (window as unknown as Window).paypal!.createInstance({
          clientId: c.client_id,
          components: ["paypal-payments"],
          pageType: "checkout",
        });
        const session = instance.createPayPalOneTimePaymentSession({
          onApprove: () => {
            void finish();
          },
          onCancel: () => {
            setErr("Buyer cancelled the PayPal popup.");
            setBusy(false);
          },
          onError: () => {
            setErr("PayPal popup reported an error.");
            setBusy(false);
          },
        });
        sessionRef.current = session;
        setSdkReady(true);
      } catch {
        setSdkReady(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish() {
    if (!order) return;
    setBusy(true);
    try {
      const d = (await api.paypalAuthorize(order.paypal_order_id, { device_id: "DEV-KNOWN-PAYPAL" })) as DecisionData;
      setDecision(d);
      refreshIntents();
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  }

  async function pay() {
    setErr("");
    setDecision(null);
    setBusy(true);
    try {
      const o = (await api.paypalCreateOrder({
        scenario,
        amount: customAmount || undefined,
        currency: "USD",
        return_url: `${window.location.origin}/paypal`,
      })) as { paypal_order_id: string; amount: string; currency: string; approve_url?: string };
      setOrder(o);
      if (o.approve_url) {
        // Redirect approval (Orders v2 approve link, same tab) — works in every
        // browser; PayPal returns to /paypal?token=<order_id> and the gate runs.
        window.location.href = o.approve_url;
        return;
      }
      if (sessionRef.current) {
        await sessionRef.current.start({ presentationMode: "auto" }, async () => o.paypal_order_id);
      } else {
        await finish();
      }
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  async function submitOtp(pass: boolean) {
    if (!decision?.intent_id) return;
    setBusy(true);
    if (!pass) {
      await api.paypalVerifyOtp(decision.intent_id, "000000");
      setDecision({ ...decision, status: "VOIDED", decision: "AUTO_VOID" });
      setBusy(false);
      refreshIntents();
      return;
    }
    await api.paypalVerifyOtp(decision.intent_id, otp || "123456");
    setDecision({ ...decision, status: "CAPTURED", decision: "AUTO_CAPTURE" });
    setBusy(false);
    refreshIntents();
  }

  async function analyst(action: "capture" | "void") {
    if (!decision?.intent_id) return;
    setBusy(true);
    await api.paypalApprove(decision.intent_id, action, "analyst");
    setDecision({
      ...decision,
      status: action === "capture" ? "CAPTURED" : "VOIDED",
      decision: action === "capture" ? "AUTO_CAPTURE" : "AUTO_VOID",
    });
    setBusy(false);
    refreshIntents();
  }

  const scenarioMeta = SCENARIOS.find((s) => s.key === scenario)!;
  const offline = !cfg?.enabled;

  return (
    <div style={{ background: CREAM }} className="min-h-screen px-6 py-8 md:px-14">
      <PageHeader
        badge="FINSHIELD FULFILMENT SHIELD FOR PAYPAL"
        title="Authorize → score → capture, hold, or void before delivery"
        sub="The buyer always completes PayPal checkout. FinShield scores the authorization, then gates fulfilment: auto-capture, OTP step-up, analyst review, or auto-void — nothing risky ever ships."
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="badge-pill mono text-[9px]">ENV: {cfg?.environment?.toUpperCase() || "…"}</span>
        {decision?.source && <SrcChip s={decision.source} />}
        {offline && (
          <span className="risk-HIGH mono text-[9px]">⚠ API OFFLINE — simulated decisions, never fake PayPal orders</span>
        )}
      </div>

      <StepStrip />

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        {/* scenario picker + checkout */}
        <section className="card-white p-5 lg:col-span-5">
          <div className="font-label-caps mb-3 text-[10px]">1 · PICK A DEMO SCENARIO</div>
          <div className="space-y-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.key}
                onClick={() => setScenario(s.key)}
                className={`w-full rounded-[11px] border p-3 text-left transition-colors ${
                  scenario === s.key ? "border-[#FF5B35] bg-[#FFF3EF]" : "border-[#E7E4DB] hover:border-[#555951]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-title-md text-sm text-[#171916]">{s.label}</span>
                  <span className="font-mono text-xs text-[#7F837B]">{s.amount}</span>
                </div>
                <div className="font-micro-label mt-1 text-[10px] text-[#7F837B]">{s.blurb}</div>
              </button>
            ))}
          </div>
          <div className="mt-3">
            <label className="font-micro-label text-[10px] text-[#7F837B]">Custom USD amount (optional)</label>
            <input
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="e.g. 4200.00"
              className="mt-1 w-full rounded-[7px] border border-[#D8D4CA] bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[#FF5B35]"
            />
          </div>

          <div className="font-label-caps mb-3 mt-6 text-[10px]">2 · CHECKOUT (PAYPAL SANDBOX)</div>
          <button
            onClick={pay}
            disabled={busy}
            className="w-full rounded-[11px] bg-[#FFC439] py-3.5 text-xs font-bold text-[#171916] shadow-sm transition-transform hover:brightness-105 active:scale-[.99]"
          >
            {busy ? (
              <span className="fin-pulse">Working…</span>
            ) : (
              `Pay ${customAmount || scenarioMeta.amount} with PayPal`
            )}
          </button>
          <p className="font-micro-label mt-2 text-[10px] text-[#7F837B]">
            {sdkReady ? "SDK v6 session ready — real sandbox popup." : "Redirects to PayPal's sandbox checkout, then the gate runs on return."}
          </p>
          {order && (
            <p className="font-micro-label mt-2 text-[10px] text-[#7F837B]">
              Order <span className="mono">{order.paypal_order_id}</span> created ({order.amount} {order.currency}, intent AUTHORIZE).
            </p>
          )}
          {err && <p className="mono mt-2 text-[10px] text-[#C53030]">{err}</p>}
        </section>

        {/* decision panel */}
        <section className="lg:col-span-7">
          <div className="card-white p-5">
            <div className="font-label-caps mb-3 text-[10px]">3 · FULFILMENT DECISION</div>
            {!decision && !busy && (
              <div className="rounded-[11px] border border-dashed border-[#D8D4CA] p-8 text-center">
                <div className="mx-auto w-fit">{Icon.shield("#C9C5BA")}</div>
                <div className="font-title-md mt-2 text-xs text-[#555951]">Run a checkout — the verdict lands here</div>
                <div className="font-micro-label mt-1 text-[10px] text-[#7F837B]">score · signals · evidence · what happens to the money</div>
              </div>
            )}
            {busy && !decision && (
              <div className="space-y-2">
                <div className="fin-skeleton h-12 w-1/2 rounded-[11px]" />
                <div className="fin-skeleton h-4 w-3/4 rounded-[7px]" />
                <div className="fin-skeleton h-4 w-2/3 rounded-[7px]" />
                <div className="fin-skeleton h-20 w-full rounded-[11px]" />
              </div>
            )}
            {decision && <VerdictPanel decision={decision} />}

            {decision && decision.status === "HELD_STEP_UP" && (
              <div className="fin-fade-up mt-3 rounded-[11px] border border-[#B7791F] bg-[#FFF8E7] p-4">
                <div className="flex items-center gap-2">
                  {Icon.lock("#B7791F")}
                  <span className="font-title-md text-sm text-[#7B341E]">Step-up verification</span>
                </div>
                <div className="font-micro-label mt-1 text-[10px] text-[#7F837B]">Demo OTP is 123456. Pass → capture, fail → void before delivery.</div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="OTP"
                    className="w-28 rounded-[7px] border border-[#D8D4CA] px-3 py-2 font-mono text-xs outline-none focus:border-[#FF5B35]"
                  />
                  <button onClick={() => submitOtp(true)} disabled={busy} className="btn-primary px-3 py-2 text-[10px]">Verify & capture</button>
                  <button onClick={() => submitOtp(false)} disabled={busy} className="btn-secondary px-3 py-2 text-[10px]">Fail → void</button>
                </div>
              </div>
            )}

            {decision && decision.status === "HELD_REVIEW" && (
              <div className="fin-fade-up mt-3 rounded-[11px] border border-[#B7791F] bg-[#FFF8E7] p-4">
                <div className="flex items-center gap-2">
                  {Icon.lock("#B7791F")}
                  <span className="font-title-md text-sm text-[#7B341E]">Analyst review</span>
                </div>
                <div className="font-micro-label mt-1 text-[10px] text-[#7F837B]">A human decides; the agent can only propose.</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => analyst("capture")} disabled={busy} className="btn-primary px-3 py-2 text-[10px]">Approve capture</button>
                  <button onClick={() => analyst("void")} disabled={busy} className="btn-secondary px-3 py-2 text-[10px]">Void before delivery</button>
                </div>
              </div>
            )}
          </div>

          {/* intent ledger */}
          <div className="card-white mt-4 p-5">
            <div className="flex items-center justify-between">
              <div className="font-label-caps text-[10px]">FULFILMENT LEDGER (LIVE)</div>
              <button onClick={refreshIntents} className="font-mono text-[10px] text-[#FF5B35] hover:underline">refresh</button>
            </div>
            <div className="mt-2 space-y-1">
              {intents === null && <div className="fin-skeleton h-9 w-full rounded-[7px]" />}
              {intents !== null && intents.length === 0 && (
                <div className="font-micro-label text-[10px] text-[#7F837B]">No intents yet.</div>
              )}
              {(intents || []).map((it) => (
                <div key={it.id} className="fin-fade-up flex flex-wrap items-center justify-between gap-2 rounded-[7px] border border-[#E7E4DB] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="badge-pill mono text-[8px]">{SCENARIO_LABELS[it.scenario || ""] || it.scenario}</span>
                    <span className="font-mono text-[10px] text-[#171916]">{it.paypal_order_id}</span>
                    <span className="font-mono text-[10px] text-[#7F837B]">{it.amount} {it.currency}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <LevelChip level={it.risk_level || undefined} />
                    <StatusPill status={it.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ analyst agent page */

type ActionRow = {
  id: string;
  kind: string;
  status: string;
  capture_id?: string | null;
  authorization_id?: string | null;
  dispute_id?: string | null;
  amount?: string | null;
  currency?: string | null;
  reason?: string | null;
  result_payload?: unknown;
};

type DisputeRow = { dispute_id?: string; status?: string; reason?: string; disputed_amount?: { value?: string; currency_code?: string } };

type Brief = { summary?: string; sections?: { title: string; points: string[] }[] };

const KIND_META: Record<string, { icon: (c: string) => ReactNode; color: string; label: string }> = {
  CAPTURE: { icon: Icon.check, color: "#2E7D32", label: "CAPTURE AUTHORIZATION" },
  VOID: { icon: Icon.x, color: "#C53030", label: "VOID AUTHORIZATION" },
  REFUND: { icon: Icon.refund, color: "#00897B", label: "REFUND CAPTURE" },
  DISPUTE_EVIDENCE: { icon: Icon.shield, color: "#FF5B35", label: "DISPUTE EVIDENCE" },
};

export function AgentConsole() {
  const [health, setHealth] = useState<{ source: string; llm_configured: boolean; model?: string } | null>(null);
  const [messages, setMessages] = useState<{ role: "user" | "agent"; text: string; source?: string }[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [actions, setActions] = useState<ActionRow[] | null>(null);
  const [disputes, setDisputes] = useState<DisputeRow[] | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const h = (await api.agentHealth()) as { source: string; llm_configured: boolean; model?: string };
    setHealth(h);
    const a = (await api.agentActions()) as { actions?: ActionRow[] };
    setActions((a.actions || []).slice(0, 12));
    const d = (await api.paypalDisputes()) as { disputes?: DisputeRow[] };
    setDisputes((d.disputes || []).slice(0, 8));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setThinking(true);
    const r = (await api.agentChat(text)) as { reply?: string; source?: string };
    setMessages((m) => [...m, { role: "agent", text: r.reply || "(no reply)", source: r.source }]);
    setThinking(false);
    refresh();
  }

  async function decide(id: string, approve: boolean) {
    setBusy(true);
    if (approve) await api.agentApprove(id, "riddhi");
    else await api.agentReject(id, "riddhi");
    setBusy(false);
    refresh();
  }

  async function simulateDispute() {
    setBusy(true);
    await api.paypalSimulateDispute({});
    setBusy(false);
    refresh();
  }

  async function draftEvidence(disputeId: string) {
    setBusy(true);
    const b = (await api.paypalDraftEvidence(disputeId)) as Brief;
    setBrief(b);
    setBusy(false);
  }

  return (
    <div style={{ background: CREAM }} className="min-h-screen px-6 py-8 md:px-14">
      <PageHeader
        badge="FINSHIELD ANALYST AGENT — HUMAN IN THE LOOP"
        title="The agent investigates and proposes. A human approves anything that touches money."
        sub="Tool-calling agent (OpenAI-compatible, deterministic fallback). Every money-moving proposal lands in the approval queue as PENDING — the agent never executes alone."
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {health && (
          <>
            <span className="badge-pill mono text-[9px]">AGENT SOURCE: {health.source}</span>
            {health.model && <span className="font-mono text-[10px] text-[#7F837B]">{health.model}</span>}
          </>
        )}
        <button onClick={simulateDispute} disabled={busy} className="btn-secondary px-3 py-1.5 text-[10px]">
          Simulate dispute (sandbox has no buyer-side disputes)
        </button>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-12">
        {/* chat */}
        <section className="card-white p-5 lg:col-span-6">
          <div className="font-label-caps mb-3 text-[10px]">ANALYST CHAT</div>
          <div className="flex max-h-[430px] min-h-[240px] flex-col gap-2 overflow-y-auto rounded-[11px] bg-[#171916] p-3 text-[#F2EFE7]">
            {messages.length === 0 && (
              <div className="mono text-[10px] text-[#A7AAA3]">
                Try: &quot;review the queue and propose voids for anything critical&quot; or &quot;refund the last capture&quot;.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`fin-fade-up flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-[11px] px-3 py-2 ${
                  m.role === "user" ? "bg-[#FF5B35]/20 text-right" : "bg-[#2B2D2A]"
                }`}>
                  <div className="mono whitespace-pre-wrap text-[11px] leading-snug">{m.text}</div>
                  {m.source && <div className="mono mt-1 text-[8px] text-[#A7AAA3]">{m.source}</div>}
                </div>
              </div>
            ))}
            {thinking && <div className="mono fin-pulse text-[10px] text-[#A7AAA3]">agent working…</div>}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask the analyst…"
              className="flex-1 rounded-[7px] border border-[#D8D4CA] bg-white px-3 py-2 text-xs outline-none focus:border-[#FF5B35]"
            />
            <button onClick={send} disabled={thinking} className="btn-primary px-4 py-2 text-[10px]">Send</button>
          </div>
        </section>

        {/* approval queue + disputes */}
        <section className="card-white p-5 lg:col-span-6">
          <div className="font-label-caps mb-3 text-[10px]">APPROVAL QUEUE — NOTHING MOVES WITHOUT A CLICK</div>
          <div className="space-y-2">
            {actions === null && <div className="fin-skeleton h-14 w-full rounded-[11px]" />}
            {actions !== null && actions.length === 0 && (
              <div className="font-micro-label text-[10px] text-[#7F837B]">No agent proposals yet.</div>
            )}
            {(actions || []).map((a) => {
              const meta = KIND_META[a.kind] || KIND_META.DISPUTE_EVIDENCE;
              return (
                <div key={a.id} className="fin-fade-up rounded-[11px] border border-[#E7E4DB] p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold" style={{ color: meta.color }}>
                      {meta.icon(meta.color)} {meta.label}
                    </span>
                    <StatusPill status={a.status} />
                  </div>
                  <div className="mono mt-1 text-[10px] text-[#555951]">
                    {a.dispute_id ? `dispute ${a.dispute_id}` : ""}
                    {a.capture_id ? `capture ${a.capture_id}` : ""}
                    {a.authorization_id ? `authorization ${a.authorization_id}` : ""}
                    {a.amount ? ` · ${a.amount} ${a.currency || ""}` : ""}
                  </div>
                  {a.reason && <div className="font-micro-label mt-1 text-[10px] text-[#7F837B]">{a.reason}</div>}
                  {a.status === "PENDING" && (
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => decide(a.id, true)} disabled={busy} className="btn-primary px-3 py-1.5 text-[9px]">Approve & execute</button>
                      <button onClick={() => decide(a.id, false)} disabled={busy} className="btn-secondary px-3 py-1.5 text-[9px]">Reject</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="font-label-caps mb-2 mt-6 text-[10px]">DISPUTES</div>
          <div className="space-y-1">
            {disputes === null && <div className="fin-skeleton h-9 w-full rounded-[7px]" />}
            {disputes !== null && disputes.length === 0 && (
              <div className="font-micro-label text-[10px] text-[#7F837B]">No disputes on file. Use “Simulate dispute”.</div>
            )}
            {(disputes || []).map((d) => (
              <div key={d.dispute_id} className="flex items-center justify-between rounded-[7px] border border-[#E7E4DB] px-3 py-2">
                <div className="mono text-[10px] text-[#171916]">
                  {d.dispute_id} · {d.reason} · {d.disputed_amount?.value} {d.disputed_amount?.currency_code}
                </div>
                <button onClick={() => draftEvidence(d.dispute_id!)} disabled={busy} className="font-mono text-[10px] text-[#FF5B35] hover:underline">
                  draft evidence
                </button>
              </div>
            ))}
          </div>
          {brief && (
            <div className="fin-fade-up mt-3 rounded-[11px] border border-[#D8D4CA] bg-[#FFFDF7] p-3">
              <div className="font-title-md text-xs text-[#171916]">EVIDENCE BRIEF {brief.summary ? "" : "(no matching decision trail)"}</div>
              {brief.summary && <p className="mt-1 text-[10px] text-[#555951]">{brief.summary}</p>}
              {(brief.sections || []).map((s) => (
                <div key={s.title} className="mt-2">
                  <div className="font-micro-label text-[9px] text-[#7F837B]">{s.title.toUpperCase()}</div>
                  {s.points.map((p, i) => (
                    <div key={i} className="mono text-[10px] text-[#555951]">· {p}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
