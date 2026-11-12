"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { RiskPill, SiteFooter, SourcePill, StatusPill, SubpageHero } from "./chrome";

const SCENARIO_LABELS: Record<string, string> = {
  clean: "Clean Buyer",
  friendly_fraud: "Friendly Fraud",
  review: "Needs Review",
  stolen_account: "Stolen Account",
};

const SIGNAL_LABELS: Record<string, string> = {
  amount_deviation: "Amount deviation",
  velocity: "Transaction velocity",
  behavioral: "Behavioral drift",
  anomaly: "Anomaly detector",
  graph: "Device network",
  xgb: "XGBoost classifier",
};

const Icon = {
  check: (c: string) => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke={c} strokeWidth="1.5" />
      <path d="M5 8.2l2 2L11.5 6" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  x: (c: string) => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke={c} strokeWidth="1.5" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  lock: (c: string) => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.6" stroke={c} strokeWidth="1.5" />
      <path d="M5.5 7V5.4a2.5 2.5 0 015 0V7" stroke={c} strokeWidth="1.5" />
    </svg>
  ),
  shield: (c: string) => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5l5.2 2v4.3c0 3.2-2.1 5.5-5.2 6.7-3.1-1.2-5.2-3.5-5.2-6.7V3.5L8 1.5z" stroke={c} strokeWidth="1.5" />
      <path d="M5.8 8l1.7 1.7L10.4 6.6" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  refund: (c: string) => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.7 1.8v3h-3" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

type PayPalConfigData = { environment: string; sdk_url: string; client_id: string; enabled: boolean };

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
  { key: "clean", label: "Clean returning buyer", amount: "$42.00", blurb: "Known device, usual spend → auto-capture" },
  { key: "friendly_fraud", label: "Friendly-fraudster", amount: "$220.00", blurb: "Off-profile amount → OTP step-up" },
  { key: "review", label: "Suspicious pattern", amount: "$180.00", blurb: "New device + activity spike → analyst review" },
  { key: "stolen_account", label: "Stolen account", amount: "$4,800.00", blurb: "High value + shared device → auto-void" },
];

function SignalBars({ signals }: { signals: DecisionData["signals"] }) {
  const rows = signals || [];
  if (!rows.length) return null;
  return (
    <div className="space-y-3">
      {rows.map((s, i) => {
        const contrib = Number(s.contribution || 0);
        const pct = Math.min(100, Math.round((Math.abs(contrib) / 0.35) * 100));
        const isHigh = contrib >= 0.15;
        return (
          <div key={s.name} className="fin-fade-up" style={{ animationDelay: `${i * 45}ms` }}>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="font-medium text-[#2A3530]">{SIGNAL_LABELS[s.name] || s.name}</span>
              <span className="text-[#5A645F] tabular-nums">
                value {s.value} · impact +{contrib.toFixed(3)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#ECEEED] overflow-hidden">
              <div
                className="fin-bar h-full rounded-full"
                style={{
                  width: `${Math.max(pct, 4)}%`,
                  backgroundColor: isHigh ? "#B42318" : "#173525",
                  animationDelay: `${i * 45}ms`,
                }}
              />
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
  const scoreVal = typeof decision.risk_score === "number" ? decision.risk_score.toFixed(3) : String(decision.risk_score ?? "—");

  const headline = captured ? "Captured" : voided ? "Voided Before Delivery" : "Held for Verification";
  const subcopy = captured
    ? "Payment captured cleanly — digital goods ready to deliver."
    : voided
    ? "Authorization voided before delivery — nothing shipped and zero chargeback risk."
    : status === "HELD_STEP_UP"
    ? "Funds locked by PayPal — confirm one-time buyer verification before releasing."
    : "Funds locked by PayPal — waiting on analyst approval in the queue.";

  return (
    <div className="fin-fade-up rounded-[16px] bg-white border border-[#E3E7E5] p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#EEF1EF]">
        <div>
          <StatusPill status={status} />
          <h3 className="mt-2.5 text-[24px] font-medium leading-[1.15] tracking-[-0.025em] text-[#111814]">
            {headline}
          </h3>
          <p className="mt-1.5 text-[13.5px] leading-[1.55] text-[#5A645F] max-w-md">{subcopy}</p>
        </div>

        <div className="text-right">
          <div className="text-[12px] font-medium text-[#5A645F]">Risk score</div>
          <div className="mt-0.5 text-[30px] font-semibold tracking-tight text-[#111814] tabular-nums">
            {scoreVal}
          </div>
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <RiskPill level={decision.risk_level} />
            <SourcePill source={decision.source} />
          </div>
        </div>
      </div>

      {captured && (
        <div className="flex items-center gap-2.5 rounded-[10px] bg-[#E8F3EB] px-3.5 py-2.5 text-[12.5px] text-[#174A2B]">
          {Icon.check("#174A2B")}
          <span>
            Capture <span className="mono font-medium">{decision.capture_id || "confirmed"}</span> · Auth{" "}
            <span className="mono font-medium">{decision.authorization_id || "—"}</span>
          </span>
        </div>
      )}

      {voided && (
        <div className="flex items-center gap-2.5 rounded-[10px] bg-[#FDECEC] px-3.5 py-2.5 text-[12.5px] text-[#B42318]">
          {Icon.x("#B42318")}
          <span>Authorization released before delivery — nothing was captured or fulfilled.</span>
        </div>
      )}

      <div>
        <div className="text-[12.5px] font-semibold text-[#111814] mb-2">Policy checks</div>
        {decision.rule_messages?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {decision.rule_messages.map((m, i) => (
              <span key={i} className="badge-pill">
                {m}
              </span>
            ))}
          </div>
        ) : (
          <span className="badge-pill">No policy tripwires — within normal buyer profile</span>
        )}
      </div>

      <div>
        <div className="text-[12.5px] font-semibold text-[#111814] mb-3">Five-signal breakdown</div>
        <SignalBars signals={decision.signals} />
      </div>

      {(decision.evidence?.length ?? 0) > 0 && (
        <div className="pt-4 border-t border-[#EEF1EF]">
          <div className="text-[12.5px] font-semibold text-[#111814] mb-2">Decision evidence</div>
          <ul className="space-y-1.5 text-[13px] text-[#5A645F]">
            {(decision.evidence || []).map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#173525]" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {decision.intent_id && (
        <div className="pt-3 border-t border-[#EEF1EF] flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <span className="text-[#5A645F]">Full SHAP breakdown &amp; entity connections</span>
          <Link
            href={`/investigate/${encodeURIComponent(decision.intent_id)}`}
            className="font-medium text-[#173525] hover:underline"
          >
            Inspect full trail →
          </Link>
        </div>
      )}
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
  const [notice, setNotice] = useState("");
  const [otp, setOtp] = useState("");
  const [intents, setIntents] = useState<IntentRow[] | null>(null);
  const pendingOrderRef = useRef<{ paypal_order_id: string; amount: string; currency: string } | null>(null);
  const sessionRef = useRef<{ start: (mode: Record<string, unknown>, createOrder: () => Promise<string> | string) => Promise<unknown> } | null>(null);

  const refreshIntents = useCallback(async () => {
    try {
      const data = (await api.paypalIntents()) as { intents?: IntentRow[] };
      setIntents((data.intents || []).slice(0, 8));
    } catch (e: any) {
      setErr((prev) => prev || e?.message || "Failed to load PayPal intents");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedToken = params.get("token");
    const cancelled = params.get("cancelled") === "1" || params.get("cancel") === "1";
    if (!returnedToken && !cancelled) return;
    window.history.replaceState({}, "", "/paypal");
    try {
      const savedScenario = window.sessionStorage.getItem("finshield_pp_scenario");
      if (savedScenario && SCENARIOS.some((s) => s.key === savedScenario)) {
        setScenario(savedScenario);
      }
    } catch {}
    setBusy(true);
    (async () => {
      try {
        if (cancelled) {
          if (returnedToken) await api.paypalCancel(returnedToken);
          await refreshIntents();
          setNotice("Buyer cancelled PayPal checkout before approving funds.");
        } else if (returnedToken) {
          const d = (await api.paypalAuthorize(returnedToken, {})) as DecisionData;
          setDecision(d);
          await refreshIntents();
        }
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const c = (await api.paypalConfig()) as PayPalConfigData;
        setCfg(c);
        await refreshIntents();
        if (!c.enabled || c.environment !== "sandbox" || !c.client_id) return;
        const existing = document.querySelector<HTMLScriptElement>("script[data-finshield-paypal]");
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
              void finish(pendingOrderRef.current?.paypal_order_id);
            },
            onCancel: () => {
              const oid = pendingOrderRef.current?.paypal_order_id;
              if (oid) {
                void api.paypalCancel(oid).then(refreshIntents).catch(() => {});
              }
              setNotice("Buyer cancelled the PayPal popup.");
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
      } catch (e: any) {
        setErr((prev) => prev || e?.message || "Failed to load PayPal configuration");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish(orderId?: string) {
    const targetId = orderId || pendingOrderRef.current?.paypal_order_id || order?.paypal_order_id;
    if (!targetId) return;
    setBusy(true);
    try {
      const d = (await api.paypalAuthorize(targetId, {})) as DecisionData;
      setDecision(d);
      await refreshIntents();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    setErr("");
    setNotice("");
    setDecision(null);

    let normalizedAmount: string | undefined;
    const trimmedAmt = customAmount.trim();
    if (trimmedAmt !== "") {
      const num = Number(trimmedAmt);
      if (!Number.isFinite(num) || num <= 0) {
        setErr("Enter a valid positive USD amount (for example 42.00).");
        return;
      }
      normalizedAmount = num.toFixed(2);
    }

    setBusy(true);
    try {
      const o = (await api.paypalCreateOrder({
        scenario,
        amount: normalizedAmount,
        currency: "USD",
        return_url: `${window.location.origin}/paypal`,
      })) as { paypal_order_id?: string; amount?: string; currency?: string; approve_url?: string };
      if (!o?.paypal_order_id) {
        setErr("PayPal API offline — start the FastAPI server to create real sandbox orders.");
        setBusy(false);
        return;
      }
      const createdOrder = {
        paypal_order_id: o.paypal_order_id,
        amount: o.amount || scenarioMeta.amount.replace("$", ""),
        currency: o.currency || "USD",
      };
      pendingOrderRef.current = createdOrder;
      setOrder(createdOrder);
      try {
        window.sessionStorage.setItem("finshield_pp_scenario", scenario);
      } catch {}
      if (o.approve_url) {
        window.location.href = o.approve_url;
        return;
      }
      if (sessionRef.current) {
        await sessionRef.current.start({ presentationMode: "auto" }, async () => o.paypal_order_id!);
      } else {
        await finish(o.paypal_order_id);
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  }

  async function submitOtp(pass: boolean) {
    if (!decision?.intent_id) return;
    setErr("");
    setNotice("");
    setBusy(true);
    try {
      const code = pass ? otp.trim() || "123456" : "000000";
      const res = (await api.paypalVerifyOtp(decision.intent_id, code)) as any;
      if (res?.verified === false) {
        setDecision({
          ...decision,
          status: "VOIDED",
          decision: "AUTO_VOID",
          void_status: res?.result?.void_status || "VOIDED",
        });
        setNotice(
          pass
            ? "Entered OTP did not match demo code 123456 — authorization voided before delivery."
            : "Step-up verification failed — authorization voided before delivery.",
        );
      } else {
        setDecision({
          ...decision,
          status: "CAPTURED",
          decision: "AUTO_CAPTURE",
          capture_id: res?.capture_id || decision.capture_id,
        });
      }
      await refreshIntents();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function analyst(action: "capture" | "void") {
    if (!decision?.intent_id) return;
    setErr("");
    setNotice("");
    setBusy(true);
    try {
      const res = (await api.paypalApprove(decision.intent_id, action, "analyst")) as any;
      setDecision({
        ...decision,
        status: action === "capture" ? "CAPTURED" : "VOIDED",
        decision: action === "capture" ? "AUTO_CAPTURE" : "AUTO_VOID",
        capture_id: res?.capture_id || decision.capture_id,
        void_status: res?.void_status || decision.void_status,
      });
      await refreshIntents();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const scenarioMeta = SCENARIOS.find((s) => s.key === scenario)!;
  const offline = cfg !== null && !cfg.enabled;

  return (
    <div className="min-h-screen bg-white text-[#111814] flex flex-col justify-between">
      <div>
        <SubpageHero
          activePath="/paypal"
          title="PayPal Sandbox Shield"
          subtitle="Interactive hackathon prototype: a buyer authorizes funds in PayPal Sandbox, then our local 5-signal engine gates digital delivery with auto-capture, OTP step-up, review, or void."
          rightSlot={
            <>
              <span className="inline-flex items-center rounded-full bg-white/[0.08] border border-white/15 px-3 py-1.5 text-[12px] font-medium text-[#E6ECE8]">
                {cfg?.environment ? `PayPal ${cfg.environment} mode` : "Checking backend…"}
              </span>
              {decision?.source && <SourcePill source={decision.source} dark />}
            </>
          }
        />

        <main className="max-w-[1220px] mx-auto px-6 md:px-10 py-6 space-y-6">
          {/* Quiet Flow Line */}
          <div className="border-b border-[#E3E7E5] pb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[#5A645F]">
            <span className="font-semibold text-[#111814]">Gate flow</span>
            <span>Authorize hold in PayPal Sandbox</span>
            <span aria-hidden="true">→</span>
            <span>Score 5 local risk signals</span>
            <span aria-hidden="true">→</span>
            <span>Capture, OTP step-up, or void before delivery</span>
          </div>

          {offline && (
            <div className="rounded-[12px] bg-[#FEF5E6] border border-[#F4DFBA] px-4 py-3 text-[13px] text-[#9A5B13]">
              PayPal Sandbox API is offline — sandbox orders require the local FastAPI backend with configured PayPal sandbox credentials.
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-12 items-start">
            {/* Left: Single-Layer Sandbox Checkout Control */}
            <section className="lg:col-span-5 space-y-4">
              <div>
                <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                  Sandbox checkout scenario
                </h2>
                <p className="mt-1 text-[13px] text-[#5A645F]">
                  Choose a simulated buyer profile to test how FinShield gates the authorization hold.
                </p>
              </div>

              <div className="rounded-[16px] border border-[#E3E7E5] bg-white divide-y divide-[#EEF1EF] overflow-hidden">
                {SCENARIOS.map((s) => {
                  const selected = scenario === s.key;
                  return (
                    <button
                      type="button"
                      key={s.key}
                      onClick={() => setScenario(s.key)}
                      className={`w-full px-4 py-3.5 text-left transition-colors cursor-pointer ${
                        selected ? "bg-[#F3F7F4]" : "bg-white hover:bg-[#FAFBF9]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-[14px] font-semibold text-[#111814]">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              selected ? "bg-[#173525]" : "bg-[#CBD3CE]"
                            }`}
                          />
                          <span>{s.label}</span>
                        </span>
                        <span className="text-[13.5px] font-semibold text-[#173525] tabular-nums">{s.amount}</span>
                      </div>
                      <div className="mt-1 pl-4 text-[12.5px] text-[#5A645F]">{s.blurb}</div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-[16px] bg-[#F5F6F5] border border-[#E3E7E5] p-5 space-y-4">
                <div>
                  <label className="block text-[12.5px] font-medium text-[#2A3530] mb-1.5">
                    Custom USD amount (optional)
                  </label>
                  <input
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="e.g. 4200.00"
                    className="w-full px-3.5 py-2.5 text-[13.5px] tabular-nums"
                  />
                </div>

                <button
                  type="button"
                  onClick={pay}
                  disabled={busy}
                  className="w-full rounded-full bg-[#173525] hover:bg-[#1F4732] text-white py-3.5 px-6 text-[13.5px] font-medium tracking-[-0.01em] transition-colors shadow-[0_8px_20px_rgba(23,53,37,0.16)] cursor-pointer disabled:opacity-55"
                >
                  {busy
                    ? "Opening PayPal Sandbox…"
                    : `Authorize ${customAmount ? `$${customAmount}` : scenarioMeta.amount} in PayPal Sandbox`}
                </button>
                <p className="text-[12px] text-[#5A645F] text-center">
                  {sdkReady
                    ? "PayPal JS SDK v6 Sandbox active — test checkout ready."
                    : "Redirects to PayPal Sandbox approval and scores automatically on return."}
                </p>
              </div>

              {order && (
                <div className="rounded-[12px] bg-[#F5F6F5] border border-[#E3E7E5] px-4 py-2.5 text-[12.5px] text-[#5A645F]">
                  Order <span className="mono font-medium text-[#111814]">{order.paypal_order_id}</span> ({order.amount} {order.currency})
                </div>
              )}
              {notice && (
                <div className="rounded-[12px] bg-[#FEF5E6] border border-[#F4DFBA] px-4 py-2.5 text-[12.5px] text-[#9A5B13]">
                  {notice}
                </div>
              )}
              {err && (
                <div className="rounded-[12px] bg-[#FDECEC] border border-[#F8D0D0] px-4 py-2.5 text-[12.5px] text-[#B42318]">
                  {err}
                </div>
              )}
            </section>

            {/* Right: Fulfilment Verdict + Single-Layer Authorizations Ledger */}
            <section className="lg:col-span-7 space-y-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                    Fulfilment verdict
                  </h2>
                  {decision?.intent_id && (
                    <span className="mono text-[12px] text-[#5A645F]">{decision.intent_id}</span>
                  )}
                </div>

                {!decision && !busy && (
                  <div className="rounded-[16px] border border-dashed border-[#CBD3CE] bg-[#FAFBF9] p-8 text-center">
                    <div className="text-[14.5px] font-semibold text-[#111814]">
                      No authorization scored yet
                    </div>
                    <p className="mt-1.5 text-[13px] text-[#5A645F] max-w-md mx-auto">
                      Select a scenario and run a PayPal Sandbox checkout to see the calibrated score, five-signal breakdown, and capture/void decision here.
                    </p>
                  </div>
                )}

                {busy && !decision && (
                  <div className="rounded-[16px] bg-white border border-[#E3E7E5] p-6 space-y-3">
                    <div className="fin-skeleton h-8 w-1/3 rounded-lg" />
                    <div className="fin-skeleton h-4 w-3/4 rounded-md" />
                    <div className="fin-skeleton h-4 w-2/3 rounded-md" />
                    <div className="fin-skeleton h-20 w-full rounded-lg" />
                  </div>
                )}

                {decision && <VerdictPanel decision={decision} />}

                {decision && decision.status === "HELD_STEP_UP" && (
                  <div className="fin-fade-up rounded-[16px] bg-[#F5F6F5] border border-[#E3E7E5] p-5 space-y-3">
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-[#111814]">
                      {Icon.lock("#9A5B13")}
                      <span>Buyer OTP verification</span>
                    </div>
                    <p className="text-[13px] text-[#5A645F]">
                      Demo OTP code is <span className="mono font-semibold text-[#111814]">123456</span>. Verified captures funds; failed voids before delivery.
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      <input
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="123456"
                        className="w-32 px-3.5 py-2 text-[13px] mono tabular-nums"
                      />
                      <button type="button" onClick={() => submitOtp(true)} disabled={busy} className="btn-primary">
                        Verify &amp; Capture
                      </button>
                      <button type="button" onClick={() => submitOtp(false)} disabled={busy} className="btn-secondary">
                        Fail &amp; Void
                      </button>
                    </div>
                  </div>
                )}

                {decision && decision.status === "HELD_REVIEW" && (
                  <div className="fin-fade-up rounded-[16px] bg-[#F5F6F5] border border-[#E3E7E5] p-5 space-y-3">
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-[#111814]">
                      {Icon.lock("#9A5B13")}
                      <span>Analyst decision required</span>
                    </div>
                    <p className="text-[13px] text-[#5A645F]">
                      Human review gate — approve capture to deliver or void the authorization safely.
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      <button type="button" onClick={() => analyst("capture")} disabled={busy} className="btn-primary">
                        Approve Capture
                      </button>
                      <button type="button" onClick={() => analyst("void")} disabled={busy} className="btn-secondary">
                        Void Before Delivery
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                    Recent sandbox authorizations
                  </h2>
                  <button
                    type="button"
                    onClick={refreshIntents}
                    className="text-[12.5px] font-medium text-[#173525] hover:underline cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>

                {intents === null ? (
                  <div className="fin-skeleton h-14 w-full rounded-[14px]" />
                ) : intents.length === 0 ? (
                  <div className="rounded-[16px] bg-[#FAFBF9] border border-[#E3E7E5] p-5 text-[13px] text-[#5A645F]">
                    No PayPal Sandbox authorizations recorded yet.
                  </div>
                ) : (
                  <div className="rounded-[16px] bg-white border border-[#E3E7E5] divide-y divide-[#EEF1EF] overflow-hidden">
                    {intents.map((it) => {
                      const scored = it.status && !["ORDER_CREATED", "CANCELLED"].includes(it.status);
                      return (
                        <div key={it.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="badge-pill">
                              {SCENARIO_LABELS[it.scenario || ""] || it.scenario || "Checkout"}
                            </span>
                            <span className="mono text-[12px] font-medium text-[#111814]">
                              {it.paypal_order_id}
                            </span>
                            <span className="text-[#5A645F] tabular-nums">
                              {it.amount} {it.currency}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {it.risk_level && <RiskPill level={it.risk_level} />}
                            <StatusPill status={it.status} />
                            {scored && (
                              <Link
                                href={`/investigate/${encodeURIComponent(it.id)}`}
                                className="text-[12px] font-medium text-[#173525] hover:underline ml-1"
                              >
                                Inspect →
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------ Analyst Agent Console */

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

type DisputeRow = {
  dispute_id?: string;
  status?: string;
  reason?: string;
  disputed_amount?: { value?: string; currency_code?: string };
};

type Brief = { summary?: string; sections?: { title: string; points: string[] }[] };

const KIND_META: Record<string, { icon: (c: string) => ReactNode; color: string; label: string }> = {
  CAPTURE: { icon: Icon.check, color: "#174A2B", label: "Capture authorization" },
  VOID: { icon: Icon.x, color: "#B42318", label: "Void authorization" },
  REFUND: { icon: Icon.refund, color: "#0F5E6B", label: "Refund capture" },
  DISPUTE_EVIDENCE: { icon: Icon.shield, color: "#173525", label: "Dispute evidence" },
};

const QUICK_PROMPTS = [
  "Review the queue and propose voids for anything critical",
  "Refund the last capture",
  "Summarize recent disputes",
];

function formatActionOutcome(payload: unknown): string | null {
  if (!payload) return null;
  let obj: any = payload;
  if (typeof payload === "string") {
    try {
      obj = JSON.parse(payload);
    } catch {
      return payload;
    }
  }
  if (typeof obj !== "object" || !obj) return null;
  if (obj.error) return String(obj.error);
  const parts: string[] = [];
  if (obj.status) parts.push(String(obj.status));
  if (obj.id) parts.push(`id ${obj.id}`);
  if (obj.dispute_id && !parts.includes(String(obj.dispute_id))) parts.push(`dispute ${obj.dispute_id}`);
  if (obj.simulated) parts.push("simulated");
  return parts.length ? parts.join(" · ") : null;
}

export function AgentConsole() {
  const [health, setHealth] = useState<{ source: string; llm_configured: boolean; model?: string } | null>(null);
  const [messages, setMessages] = useState<{ role: "user" | "agent"; text: string; source?: string }[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [actions, setActions] = useState<ActionRow[] | null>(null);
  const [disputes, setDisputes] = useState<DisputeRow[] | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [h, a, d] = await Promise.all([
        api.agentHealth() as Promise<{ source: string; llm_configured: boolean; model?: string }>,
        api.agentActions() as Promise<{ actions?: ActionRow[] }>,
        api.paypalDisputes() as Promise<{ disputes?: DisputeRow[] }>,
      ]);
      setHealth(h);
      setActions((a.actions || []).slice(0, 12));
      setDisputes((d.disputes || []).slice(0, 8));
    } catch (e: any) {
      setErr((prev) => prev || e?.message || "Failed to load analyst queue");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || thinking) return;
    setErr("");
    const history = messages.map((m) => ({
      role: m.role === "agent" ? "assistant" : "user",
      content: m.text,
    }));
    setMessages((m) => [...m, { role: "user", text }]);
    if (!override) setInput("");
    setThinking(true);
    try {
      const r = (await api.agentChat(text, history)) as { reply?: string; source?: string };
      setMessages((m) => [...m, { role: "agent", text: r.reply || "(no reply)", source: r.source }]);
      await refresh();
    } catch (e: any) {
      const msg = e?.message || String(e);
      setErr(msg);
      setMessages((m) => [...m, { role: "agent", text: `Error: ${msg}` }]);
    } finally {
      setThinking(false);
    }
  }

  async function decide(id: string, approve: boolean) {
    setErr("");
    setBusy(true);
    try {
      if (approve) await api.agentApprove(id, "analyst");
      else await api.agentReject(id, "analyst");
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function simulateDispute() {
    setErr("");
    setBusy(true);
    try {
      await api.paypalSimulateDispute({});
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function draftEvidence(disputeId: string) {
    if (!disputeId) return;
    setErr("");
    setBusy(true);
    try {
      const b = (await api.paypalDraftEvidence(disputeId)) as Brief;
      setBrief(b);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#111814] flex flex-col justify-between">
      <div>
        <SubpageHero
          activePath="/agent"
          title="Analyst Agent (Prototype)"
          subtitle="Prototype human-in-the-loop copilot: investigates flagged sandbox authorizations and drafts dispute evidence. Every capture, void, or refund waits in an approval queue — the agent never moves money alone."
          rightSlot={
            <>
              {health && <SourcePill source={health.source} dark />}
              <button
                type="button"
                onClick={simulateDispute}
                disabled={busy}
                className="rounded-full bg-white/[0.1] hover:bg-white/[0.16] border border-white/15 px-4 py-1.5 text-[12px] font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Simulate Dispute
              </button>
            </>
          }
        />

        <main className="max-w-[1220px] mx-auto px-6 md:px-10 py-6 space-y-5">
          {err && (
            <div className="rounded-[12px] bg-[#FDECEC] border border-[#F8D0D0] px-4 py-2.5 text-[12.5px] text-[#B42318] flex items-center justify-between gap-3">
              <span>{err}</span>
              <button type="button" onClick={() => setErr("")} className="font-medium underline cursor-pointer shrink-0">
                Dismiss
              </button>
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-12 items-start">
            {/* Left: Single-Layer Analyst Chat */}
          <section className="lg:col-span-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                Investigate with agent
              </h2>
              {health?.model && <span className="text-[12px] text-[#5A645F]">{health.model}</span>}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((q) => (
                <button
                  type="button"
                  key={q}
                  onClick={() => send(q)}
                  disabled={thinking}
                  className="rounded-full bg-[#F5F6F5] border border-[#E3E7E5] hover:border-[#173525] px-3 py-1.5 text-[12px] font-medium text-[#2A3530] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="rounded-[16px] bg-white border border-[#E3E7E5] overflow-hidden">
              <div className="p-4 min-h-[300px] max-h-[420px] overflow-y-auto flex flex-col gap-3">
                {messages.length === 0 && (
                  <div className="my-auto text-center px-6 py-8">
                    <div className="text-[14px] font-medium text-[#111814]">
                      Ask the analyst to review queued payments
                    </div>
                    <p className="mt-1 text-[13px] text-[#5A645F]">
                      Select a quick prompt above or ask a question. Proposals land in the approval queue on the right.
                    </p>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={i} className={`fin-fade-up flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] px-4 py-2.5 text-[13.5px] leading-[1.55] ${
                        m.role === "user"
                          ? "bg-[#173525] text-white rounded-[14px] rounded-tr-[4px]"
                          : "bg-[#F5F6F5] text-[#111814] rounded-[14px] rounded-tl-[4px]"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.text}</div>
                      {m.source && m.role === "agent" && (
                        <div className="mt-1.5 text-[11px] text-[#5A645F]">
                          {m.source === "LIVE_LLM" ? "Connected LLM" : "Deterministic fallback"}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {thinking && (
                  <div className="fin-pulse text-[13px] text-[#5A645F] px-1">
                    Inspecting transactions and composing proposal…
                  </div>
                )}
              </div>

              <div className="bg-[#FAFBF9] border-t border-[#E3E7E5] p-3 flex gap-2.5">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Ask the analyst agent…"
                  className="flex-1 px-3.5 py-2 text-[13.5px]"
                />
                <button type="button" onClick={() => send()} disabled={thinking} className="btn-primary px-5">
                  Send
                </button>
              </div>
            </div>
          </section>

          {/* Right: Single-Layer Approval Queue + Disputes */}
          <section className="lg:col-span-6 space-y-8">
            <div className="space-y-3">
              <div>
                <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                  Human approval queue
                </h2>
                <p className="mt-0.5 text-[13px] text-[#5A645F]">
                  Nothing moves money until an analyst approves it.
                </p>
              </div>

              {actions === null ? (
                <div className="fin-skeleton h-16 w-full rounded-[14px]" />
              ) : actions.length === 0 ? (
                <div className="rounded-[16px] bg-[#FAFBF9] border border-dashed border-[#CBD3CE] p-5 text-[13px] text-[#5A645F]">
                  No pending proposals yet. Ask the agent to review the queue on the left.
                </div>
              ) : (
                <div className="rounded-[16px] bg-white border border-[#E3E7E5] divide-y divide-[#EEF1EF] overflow-hidden">
                  {actions.map((a) => {
                    const meta = KIND_META[a.kind] || KIND_META.DISPUTE_EVIDENCE;
                    return (
                      <div key={a.id} className="fin-fade-up p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: meta.color }}>
                            {meta.icon(meta.color)}
                            <span>{meta.label}</span>
                          </span>
                          <StatusPill status={a.status} />
                        </div>

                        <div className="text-[12.5px] text-[#5A645F]">
                          {a.dispute_id && <span className="mono mr-2">Dispute {a.dispute_id}</span>}
                          {a.capture_id && <span className="mono mr-2">Capture {a.capture_id}</span>}
                          {a.authorization_id && <span className="mono mr-2">Auth {a.authorization_id}</span>}
                          {a.amount && <span className="font-semibold text-[#111814] tabular-nums">{a.amount} {a.currency || ""}</span>}
                        </div>

                        {a.reason && <p className="text-[13px] text-[#5A645F]">{a.reason}</p>}

                        {(a.status === "EXECUTED" || a.status === "FAILED") && formatActionOutcome(a.result_payload) && (
                          <div
                            className={`text-[12px] mono ${
                              a.status === "FAILED" ? "text-[#B42318]" : "text-[#174A2B]"
                            }`}
                          >
                            {formatActionOutcome(a.result_payload)}
                          </div>
                        )}

                        {a.status === "PENDING" && (
                          <div className="pt-1 flex flex-wrap gap-2">
                            <button type="button" onClick={() => decide(a.id, true)} disabled={busy} className="btn-primary py-2 px-4 text-[12.5px]">
                              Approve &amp; Execute
                            </button>
                            <button type="button" onClick={() => decide(a.id, false)} disabled={busy} className="btn-secondary py-2 px-4 text-[12.5px]">
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                  PayPal Sandbox disputes
                </h2>
                <span className="text-[12px] text-[#5A645F]">Simulated evidence drafts</span>
              </div>

              {disputes === null ? (
                <div className="fin-skeleton h-12 w-full rounded-[14px]" />
              ) : disputes.length === 0 ? (
                <div className="rounded-[16px] bg-[#FAFBF9] border border-[#E3E7E5] p-5 text-[13px] text-[#5A645F]">
                  No disputes on file. Use “Simulate Dispute” in the top bar to create one.
                </div>
              ) : (
                <div className="rounded-[16px] bg-white border border-[#E3E7E5] divide-y divide-[#EEF1EF] overflow-hidden">
                  {disputes.map((d) => (
                    <div key={d.dispute_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
                      <div className="space-y-0.5">
                        <div className="mono text-[12.5px] font-medium text-[#111814]">{d.dispute_id}</div>
                        <div className="text-[12px] text-[#5A645F]">
                          {d.reason} · {d.disputed_amount?.value} {d.disputed_amount?.currency_code}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => draftEvidence(d.dispute_id!)}
                        disabled={busy}
                        className="btn-secondary py-1.5 px-3.5 text-[12px]"
                      >
                        Draft Evidence
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {brief && (
                <div className="fin-fade-up rounded-[16px] bg-[#FAFBF9] border border-[#E3E7E5] p-5 space-y-3">
                  <div className="text-[14px] font-semibold text-[#111814]">
                    Evidence brief {brief.summary ? "" : "(no matching decision trail)"}
                  </div>
                  {brief.summary && <p className="text-[13px] leading-[1.6] text-[#5A645F]">{brief.summary}</p>}
                  {(brief.sections || []).map((s) => (
                    <div key={s.title} className="pt-2 border-t border-[#E3E7E5]">
                      <div className="text-[12px] font-semibold text-[#111814] mb-1">{s.title}</div>
                      <ul className="space-y-1 text-[12.5px] text-[#5A645F]">
                        {s.points.map((p, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#173525]" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
