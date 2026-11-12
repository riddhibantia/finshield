"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, type Rec } from "@/lib/api";
import {
  GLOSSARY,
  LEVEL_MEANINGS,
  RULE_MEANINGS,
  ruleMeaning,
  SCORE_MEANING,
  signalMeaning,
  whyFlagged,
} from "@/lib/plain";
import { LandingPageView } from "./landing";
import { RiskPill, SiteFooter, SourcePill, SubpageHero, Tip } from "./chrome";

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

function formatCurrency(amount: unknown, txn?: Record<string, any>) {
  const num = Number(amount || 0);
  const currency = String(txn?.currency || (txn?.channel === "PAYPAL" ? "USD" : "INR")).toUpperCase();
  if (currency === "USD") {
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${num.toLocaleString("en-IN")}`;
}

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-white">
      <LandingPageView />
      <SiteFooter flush />
    </div>
  );
}

/* ================================================================ CONSOLE */

export function CommandCenter() {
  const [items, setItems] = useState<Rec[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const lastRef = useRef<string | null>(null);

  const [upiSender, setUpiSender] = useState<string>("demo@okhdfc");
  const [upiReceiver, setUpiReceiver] = useState<string>("chaiwala@paytm");
  const [upiAmount, setUpiAmount] = useState<number>(50);
  const [upiProcessing, setUpiProcessing] = useState<boolean>(false);
  const [upiResult, setUpiResult] = useState<Rec | null>(null);

  const [cfAmount, setCfAmount] = useState<number>(75);
  const [cfUpiId, setCfUpiId] = useState<string>("riddhi@okhdfcbank");
  const [cfStatus] = useState<string>("SUCCESS");
  const [cfProcessing, setCfProcessing] = useState<boolean>(false);
  const [cfResult, setCfResult] = useState<any>(null);
  const [cfCopied, setCfCopied] = useState<boolean>(false);
  const [cfOutCopied, setCfOutCopied] = useState<boolean>(false);
  const [showWebhookDebug, setShowWebhookDebug] = useState<boolean>(false);
  const [studioTab, setStudioTab] = useState<"upi" | "cashfree" | "stream">("upi");
  const [err, setErr] = useState<string>("");

  const [webhookUrl, setWebhookUrl] = useState("<YOUR-URL>/api/webhooks/cashfree");
  useEffect(() => {
    const o = window.location.origin;
    if (!o.includes("localhost") && !o.includes("127.0.0.1")) {
      setWebhookUrl(`${o}/api/webhooks/cashfree`);
    }
  }, []);

  async function refresh() {
    try {
      const [l, m, h] = await Promise.all([api.list(), api.metrics(), api.health()]);
      const txs = (l as any).transactions ?? (l as any);
      setItems(txs);
      setMetrics(m);
      setHealth(h);
      if (txs.length) {
        lastRef.current = txs[0]?.transaction?.transaction_id ?? null;
      }
    } catch (e: any) {
      setErr((prev) => prev || e?.message || "Failed to load console data");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(async () => {
      try {
        const picks = ["normal", "normal", "normal", "suspicious", "ambiguous"];
        const pick = picks[Math.floor(Math.random() * picks.length)];
        await api.generate(pick);
        await refresh();
      } catch (e: any) {
        setErr(e?.message || "Stream generation failed");
        setRunning(false);
      }
    }, 1800);
    return () => clearInterval(id);
  }, [running]);

  async function handleCashfreeTest(overrideAmt?: number, overrideUpi?: string) {
    setErr("");
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
      setErr("Webhook test failed: " + (e?.message || String(e)));
    } finally {
      setCfProcessing(false);
    }
  }

  async function handleUpiPayment(overrideAmount?: number) {
    setErr("");
    const amt = overrideAmount !== undefined ? overrideAmount : Number(upiAmount);
    if (overrideAmount !== undefined) setUpiAmount(overrideAmount);
    if (!amt || amt <= 0) {
      setErr("Enter a valid payment amount above 0.");
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
        merchant_category: isMicro ? "everyday" : isLarge ? "high_value_p2p" : "p2p",
        device_id: "DEV-PHONE-DEMO",
        location: isLarge ? "Home City (High-Value Transfer)" : "Home City",
        velocity: 1,
        usual_amount: 500.0,
      };
      const res: any = await api.score(payload);
      setUpiResult(res);
      await refresh();
    } catch (e: any) {
      setErr("UPI scoring failed: " + (e?.message || String(e)));
    } finally {
      setUpiProcessing(false);
    }
  }

  const alerts = items.filter((r) => r.score.risk_score >= 0.6);
  const critical = items.filter((r) => r.score.risk_level === "CRITICAL");
  const visibleItems = (filter === "flagged" ? alerts : items).slice(0, 20);
  const isLiveEngine = health?.adapter === "real";

  return (
    <div className="min-h-screen bg-white text-[#111814] flex flex-col justify-between">
      <div>
        <SubpageHero
          activePath="/command-center"
          title="Operations Console (Simulator)"
          subtitle="Interactive prototype simulator: test synthetic UPI transfers or sample webhook payloads across five local risk signals and inspect any decision trail."
          rightSlot={
            <>
              {health && <SourcePill source={isLiveEngine ? "LIVE_MODEL" : "DEMO_FALLBACK"} dark />}
              <button
                type="button"
                onClick={() => setRunning((r) => !r)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-medium border transition-colors cursor-pointer ${
                  running
                    ? "bg-[#D7F46B] text-[#0D1611] border-[#D7F46B]"
                    : "bg-white/[0.09] hover:bg-white/[0.15] text-white border-white/15"
                }`}
              >
                {running && <span className="h-1.5 w-1.5 rounded-full bg-[#0D1611] fin-pulse" />}
                <span>{running ? "Pause Stream" : "Simulate Stream"}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  setErr("");
                  try {
                    await api.reset();
                    await refresh();
                  } catch (e: any) {
                    setErr("Reset failed: " + (e?.message || String(e)));
                  }
                }}
                className="rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 px-3.5 py-1.5 text-[12px] font-medium text-[#D5E1DB] hover:text-white transition-colors cursor-pointer"
              >
                Reset
              </button>
            </>
          }
        />

        <main className="max-w-[1220px] mx-auto px-6 md:px-10 py-6 space-y-8">
          {/* Flat 4-Cell Segmented Metric Bar */}
          <div className="rounded-[16px] border border-[#E3E7E5] bg-white grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
            <div className="p-5 border-b lg:border-b-0 border-r border-[#E3E7E5]">
              <div className="text-[12px] font-medium text-[#5A645F]">Transactions scored</div>
              <div className="mt-1.5 text-[28px] font-semibold tracking-tight text-[#111814] tabular-nums">
                {items.length}
              </div>
            </div>
            <div className="p-5 border-b lg:border-b-0 lg:border-r border-[#E3E7E5]">
              <div className="text-[12px] font-medium text-[#5A645F]">Flagged alerts (≥ 0.6)</div>
              <div className="mt-1.5 text-[28px] font-semibold tracking-tight text-[#B42318] tabular-nums">
                {alerts.length}
              </div>
            </div>
            <div className="p-5 border-r border-[#E3E7E5]">
              <div className="text-[12px] font-medium text-[#5A645F]">Critical blocked</div>
              <div className="mt-1.5 text-[28px] font-semibold tracking-tight text-[#111814] tabular-nums">
                {critical.length}
              </div>
            </div>
            <div className="p-5">
              <div className="text-[12px] font-medium text-[#5A645F]">ULB Benchmark (XGB)</div>
              <div className="mt-1.5 text-[28px] font-semibold tracking-tight text-[#173525] tabular-nums">
                {metrics?.xgboost?.roc_auc ? `${metrics.xgboost.roc_auc.toFixed(3)} ROC` : "0.971 ROC"}
              </div>
            </div>
          </div>

          {/* Single-Layer Transaction Simulator */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                  Transaction Simulator
                </h2>
                <p className="mt-0.5 text-[13px] text-[#5A645F]">
                  Send a test payment through the 5-signal scoring engine.
                </p>
              </div>

              <div className="inline-flex items-center rounded-full bg-[#F5F6F5] border border-[#E3E7E5] p-1">
                {[
                  { key: "upi", label: "UPI Simulator" },
                  { key: "cashfree", label: "Sample Webhook" },
                  { key: "stream", label: "Quick Scenarios" },
                ].map((tab) => (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => setStudioTab(tab.key as "upi" | "cashfree" | "stream")}
                    className={`rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                      studioTab === tab.key
                        ? "bg-[#173525] text-white"
                        : "text-[#5A645F] hover:text-[#111814]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {err && (
              <div className="rounded-[12px] bg-[#FDECEC] border border-[#F8D0D0] px-4 py-2.5 text-[13px] text-[#B42318]">
                {err}
              </div>
            )}

            <div className="rounded-[16px] bg-white border border-[#E3E7E5] p-5">
              {studioTab === "upi" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium text-[#5A645F]">One-click presets</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpiPayment(50)}
                        className="rounded-full bg-[#E8F3EB] hover:bg-[#D9ECDD] text-[#174A2B] px-3.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer"
                      >
                        ₹50 Safe
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpiPayment(100)}
                        className="rounded-full bg-[#E8F3EB] hover:bg-[#D9ECDD] text-[#174A2B] px-3.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer"
                      >
                        ₹100 Safe
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpiPayment(100000)}
                        className="rounded-full bg-[#FDECEC] hover:bg-[#FADADA] text-[#B42318] px-3.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer"
                      >
                        ₹1,00,000 High Risk
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-12 items-end">
                    <div className="md:col-span-4">
                      <label className="block text-[12px] font-medium text-[#5A645F] mb-1">Sender UPI ID</label>
                      <input
                        type="text"
                        value={upiSender}
                        onChange={(e) => setUpiSender(e.target.value)}
                        className="w-full px-3.5 py-2 text-[13.5px]"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-[12px] font-medium text-[#5A645F] mb-1">Payee / Merchant</label>
                      <input
                        type="text"
                        value={upiReceiver}
                        onChange={(e) => setUpiReceiver(e.target.value)}
                        className="w-full px-3.5 py-2 text-[13.5px]"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[12px] font-medium text-[#5A645F] mb-1">Amount (INR)</label>
                      <input
                        type="number"
                        value={upiAmount}
                        onChange={(e) => setUpiAmount(Number(e.target.value))}
                        className="w-full px-3.5 py-2 text-[13.5px] font-medium tabular-nums"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={() => handleUpiPayment()}
                        disabled={upiProcessing}
                        className="btn-primary w-full py-2.5"
                      >
                        {upiProcessing ? "Scoring…" : "Score Payment"}
                      </button>
                    </div>
                  </div>

                  {upiResult && (
                    <div className="fin-fade-up pt-3 border-t border-[#EEF1EF] flex flex-wrap items-center justify-between gap-3 text-[13px]">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <RiskPill level={upiResult.score.risk_level} />
                        <span className="font-semibold text-[#111814]">
                          {upiResult.score.risk_score >= 0.6 ? "Blocked / Held for Review" : "Approved & Safe"}
                        </span>
                        <span className="text-[#5A645F] tabular-nums">
                          Score {upiResult.score.risk_score.toFixed(3)}
                        </span>
                      </div>
                      <Link
                        href={`/investigate/${upiResult.transaction.transaction_id}`}
                        className="text-[13px] font-medium text-[#173525] hover:underline"
                      >
                        Inspect trail →
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {studioTab === "cashfree" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium text-[#5A645F]">Sample webhook payloads</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleCashfreeTest(75, "riddhi@okhdfcbank")}
                        className="rounded-full bg-[#E8F3EB] hover:bg-[#D9ECDD] text-[#174A2B] px-3.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer"
                      >
                        ₹75 Safe Webhook
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCashfreeTest(100000, "crypto_mule@ybl")}
                        className="rounded-full bg-[#FDECEC] hover:bg-[#FADADA] text-[#B42318] px-3.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer"
                      >
                        ₹1,00,000 Spike
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-12 items-end">
                    <div className="md:col-span-5">
                      <label className="block text-[12px] font-medium text-[#5A645F] mb-1">Payer UPI ID</label>
                      <input
                        type="text"
                        value={cfUpiId}
                        onChange={(e) => setCfUpiId(e.target.value)}
                        className="w-full px-3.5 py-2 text-[13.5px]"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[12px] font-medium text-[#5A645F] mb-1">Amount (INR)</label>
                      <input
                        type="number"
                        value={cfAmount}
                        onChange={(e) => setCfAmount(Number(e.target.value))}
                        className="w-full px-3.5 py-2 text-[13.5px] font-medium tabular-nums"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <button
                        type="button"
                        disabled={cfProcessing}
                        onClick={() => handleCashfreeTest()}
                        className="btn-primary w-full py-2.5"
                      >
                        {cfProcessing ? "Scoring Webhook…" : "Test Sample Webhook"}
                      </button>
                    </div>
                  </div>

                  {cfResult && (
                    <div className="fin-fade-up pt-3 border-t border-[#EEF1EF] flex flex-wrap items-center justify-between gap-3 text-[13px]">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <RiskPill level={cfResult.risk_level} />
                        <span className="mono text-[12.5px] font-medium text-[#111814]">
                          {cfResult.transaction_id}
                        </span>
                        <span className="text-[#5A645F] tabular-nums">
                          Score {Number(cfResult.risk_score).toFixed(3)}
                        </span>
                      </div>
                      <Link
                        href={`/investigate/${cfResult.transaction_id}`}
                        className="text-[13px] font-medium text-[#173525] hover:underline"
                      >
                        Inspect payload →
                      </Link>
                    </div>
                  )}

                  <div className="pt-3 border-t border-[#EEF1EF] flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                    <div className="flex flex-wrap items-center gap-2 text-[#5A645F]">
                      <span>Endpoint:</span>
                      <code className="text-[12px] text-[#173525]">{webhookUrl}</code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                          setCfCopied(true);
                          setTimeout(() => setCfCopied(false), 1800);
                        }}
                        className="text-[12px] font-medium text-[#173525] hover:underline cursor-pointer"
                      >
                        {cfCopied ? "Copied" : "Copy"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowWebhookDebug((v) => !v)}
                      className="text-[12.5px] font-medium text-[#5A645F] hover:text-[#111814] cursor-pointer"
                    >
                      {showWebhookDebug ? "Hide JSON & curl" : "Show JSON & curl"}
                    </button>
                  </div>

                  {showWebhookDebug && (
                    <div className="grid gap-4 md:grid-cols-2 pt-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[12px] font-medium text-[#111814]">
                          <span>{cfResult ? "Last Webhook Response" : "Sample Response"}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(cfResult ?? SAMPLE_CF_OUTPUT, null, 2));
                              setCfOutCopied(true);
                              setTimeout(() => setCfOutCopied(false), 1800);
                            }}
                            className="text-[#173525] hover:underline cursor-pointer"
                          >
                            {cfOutCopied ? "Copied" : "Copy JSON"}
                          </button>
                        </div>
                        <pre className="rounded-[12px] bg-[#0B120F] text-[#DCE6E0] p-3.5 text-[11px] overflow-x-auto max-h-52">
                          {JSON.stringify(cfResult ?? SAMPLE_CF_OUTPUT, null, 2)}
                        </pre>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[12px] font-medium text-[#111814]">Sample curl request</div>
                        <pre className="rounded-[12px] bg-[#0B120F] text-[#D7F46B] p-3.5 text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
                          {`curl -X POST http://127.0.0.1:8000/api/webhooks/cashfree \\
  -H "Content-Type: application/json" \\
  -d '{"data":{"order":{"order_id":"ORD_DEMO_1","order_amount":75.0},"payment":{"cf_payment_id":"CF_PAY_DEMO_1","payment_status":"SUCCESS","payment_amount":75.0,"payment_method":{"upi":{"upi_id":"riddhi@okhdfcbank"}},"payment_group":"upi"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}'`}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {studioTab === "stream" && (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { scenario: "normal", label: "+ Normal Payment" },
                      { scenario: "suspicious", label: "+ Account Takeover" },
                      { scenario: "fraud_ring", label: "+ Shared-Device Ring" },
                      { scenario: "ambiguous", label: "+ Subtle Anomaly" },
                    ].map((btn) => (
                      <button
                        key={btn.scenario}
                        type="button"
                        onClick={async () => {
                          setErr("");
                          try {
                            await api.generate(btn.scenario);
                            await refresh();
                          } catch (e: any) {
                            setErr("Scenario generation failed: " + (e?.message || String(e)));
                          }
                        }}
                        className="btn-secondary py-2 px-4 text-[12.5px]"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  <div className="text-[12.5px] text-[#5A645F]">
                    Or use <span className="font-medium text-[#111814]">Simulate Stream</span> in the top bar for synthetic traffic.
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Single-Layer Transactions Table */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                  Recent Transactions
                </h2>
                <p className="mt-0.5 text-[13px] text-[#5A645F]">
                  Select any row to inspect five-signal attribution, entity links, and AI explanation.
                </p>
              </div>

              <div className="inline-flex items-center rounded-full bg-[#F5F6F5] border border-[#E3E7E5] p-1">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={`rounded-full px-3.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                    filter === "all" ? "bg-[#173525] text-white" : "text-[#5A645F] hover:text-[#111814]"
                  }`}
                >
                  All ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("flagged")}
                  className={`rounded-full px-3.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                    filter === "flagged" ? "bg-[#B42318] text-white" : "text-[#5A645F] hover:text-[#111814]"
                  }`}
                >
                  Flagged ({alerts.length})
                </button>
              </div>
            </div>

            <div className="rounded-[16px] bg-white border border-[#E3E7E5] overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EEF1EF] text-[12px] font-medium text-[#5A645F]">
                    <th className="py-3 px-4">Transaction</th>
                    <th className="py-3 px-4">Merchant &amp; Location</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Device</th>
                    <th className="py-3 px-4">Risk</th>
                    <th className="py-3 px-4 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF1EF] text-[13px]">
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-[#5A645F]">
                        {filter === "flagged"
                          ? "No flagged alerts yet. Inject a high-risk scenario above."
                          : "No transactions scored yet."}
                      </td>
                    </tr>
                  ) : (
                    visibleItems.map((r) => {
                      const txn = r.transaction as Record<string, any>;
                      const idStr = String(txn.transaction_id);
                      const isCf = idStr.startsWith("CF-") || txn.gateway === "Cashfree";
                      const isPp = idStr.startsWith("PP-") || txn.gateway === "PayPal";
                      const isUpi = idStr.startsWith("UPI-");
                      return (
                        <tr key={idStr} className="hover:bg-[#FAFBF9] transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/investigate/${encodeURIComponent(idStr)}`}
                                className="mono text-[12.5px] font-medium text-[#173525] hover:underline"
                              >
                                {idStr}
                              </Link>
                              {isPp && <span className="badge-pill text-[10.5px]">PayPal</span>}
                              {isCf && <span className="badge-pill text-[10.5px]">Cashfree</span>}
                              {isUpi && <span className="badge-pill text-[10.5px]">UPI</span>}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-[#111814]">{String(txn.merchant || "—")}</div>
                            <div className="text-[12px] text-[#5A645F]">{String(txn.location || "—")}</div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-[#111814] tabular-nums">
                            {formatCurrency(txn.amount, txn)}
                          </td>
                          <td className="py-3.5 px-4 mono text-[12px] text-[#5A645F]">
                            {String(txn.device_id || "—").slice(0, 18)}
                          </td>
                          <td className="py-3.5 px-4">
                            <RiskPill level={r.score.risk_level} />
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-3">
                              <span className="font-semibold text-[#111814] tabular-nums">
                                {r.score.risk_score.toFixed(3)}
                              </span>
                              <Link
                                href={`/investigate/${encodeURIComponent(idStr)}`}
                                className="text-[12.5px] font-medium text-[#173525] hover:underline"
                              >
                                Inspect →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

export const Dashboard = CommandCenter;

/* ======================================================== SIMPLE ENTITY FLOW */

function EntityTypeIcon({ type }: { type?: string }) {
  const t = String(type || "").toLowerCase();
  if (t === "device") {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="4.5" y="1.8" width="7" height="12.4" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="11.8" r="0.7" fill="currentColor" />
      </svg>
    );
  }
  if (t === "transaction") {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M9.5 2L4.5 9h3.5l-1 5 5-7H8.5l1-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (t === "merchant" || t === "gateway") {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2.5 6.5h11v7h-11v-7zM4 2.5h8l1.5 4h-11l1.5-4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.2" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 13.5c0-2.3 2.2-3.8 5-3.8s5 1.5 5 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SimpleEntityFlow({ graph, txnId }: { graph: any; txnId: string }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const nodes: any[] = useMemo(() => graph?.nodes ?? [], [graph]);
  const edges: any[] = useMemo(() => graph?.edges ?? [], [graph]);

  useEffect(() => {
    if (nodes.length > 0 && !selectedNodeId) {
      const crit = nodes.find((n: any) => n.risk === "CRITICAL") || nodes.find((n: any) => n.id === txnId) || nodes[0];
      setSelectedNodeId(crit?.id ?? null);
    }
  }, [nodes, txnId, selectedNodeId]);

  if (!graph || nodes.length === 0) {
    return (
      <div className="rounded-[16px] bg-[#FAFBF9] border border-[#E3E7E5] p-6 text-center text-[13px] text-[#5A645F]">
        No entity graph mapped for this transaction.
      </div>
    );
  }

  const hasSuspicious = edges.some((e: any) => e.is_suspicious);
  const suspiciousIds = new Set(
    edges.filter((e: any) => e.is_suspicious).flatMap((e: any) => [e.from, e.to]),
  );

  const visibleNodes = flaggedOnly
    ? nodes.filter((n: any) => n.risk === "CRITICAL" || n.risk === "SUSPICIOUS" || suspiciousIds.has(n.id))
    : nodes;
  const visibleEdges = flaggedOnly ? edges.filter((e: any) => e.is_suspicious) : edges;

  const selectedNode = nodes.find((n: any) => n.id === selectedNodeId) || visibleNodes[0] || nodes[0];

  return (
    <div className="rounded-[16px] bg-white border border-[#E3E7E5] p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-[#5A645F]">
          {graph.summary?.topology_type || "Connected entity chain"} · {nodes.length} entities
        </span>
        {hasSuspicious && (
          <button
            type="button"
            onClick={() => setFlaggedOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium border transition-colors cursor-pointer ${
              flaggedOnly
                ? "bg-[#FDECEC] border-[#F8D0D0] text-[#B42318]"
                : "bg-[#F5F6F5] border-[#E3E7E5] text-[#5A645F] hover:text-[#111814]"
            }`}
          >
            {flaggedOnly ? "Showing flagged links" : "Filter flagged links"}
          </button>
        )}
      </div>

      {/* Single-Layer Node Grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visibleNodes.map((n: any) => {
          const isSelected = selectedNode?.id === n.id;
          const isCrit = n.risk === "CRITICAL";
          const isSusp = n.risk === "SUSPICIOUS";
          const badgeCls = isCrit
            ? "bg-[#FDECEC] text-[#B42318]"
            : isSusp
            ? "bg-[#FEF5E6] text-[#9A5B13]"
            : n.risk === "SAFE"
            ? "bg-[#E8F3EB] text-[#174A2B]"
            : "bg-[#F2F4F3] text-[#5A645F]";

          return (
            <button
              type="button"
              key={n.id}
              onClick={() => setSelectedNodeId(n.id)}
              className={`rounded-[12px] border p-3.5 text-left transition-colors cursor-pointer ${
                isSelected
                  ? "bg-[#F3F7F4] border-[#173525]"
                  : "bg-[#FAFBF9] border-[#E7EBE8] hover:border-[#C5CEC9]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#173525]">
                  <EntityTypeIcon type={n.type} />
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeCls}`}>
                  {n.risk || "Entity"}
                </span>
              </div>
              <div className="mt-2.5 text-[11.5px] font-medium text-[#5A645F] truncate">
                {n.role || n.type}
              </div>
              <div className="mt-0.5 text-[13.5px] font-semibold text-[#111814] truncate" title={String(n.label || n.id)}>
                {n.label || n.id}
              </div>
            </button>
          );
        })}
      </div>

      {/* Clean Relationship Chips */}
      {visibleEdges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleEdges.map((e: any, idx: number) => (
            <span
              key={idx}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] border ${
                e.is_suspicious
                  ? "bg-[#FDECEC] border-[#F8D0D0] text-[#B42318] font-medium"
                  : "bg-[#FAFBF9] border-[#E3E7E5] text-[#5A645F]"
              }`}
            >
              <span className="mono text-[11px]">{String(e.from).split(":").pop()}</span>
              <span aria-hidden="true">→</span>
              <span>{String(e.label || "link").toLowerCase().replace(/_/g, " ")}</span>
              <span aria-hidden="true">→</span>
              <span className="mono text-[11px]">{String(e.to).split(":").pop()}</span>
            </span>
          ))}
        </div>
      )}

      {/* Selected Entity Attributes (Flat Definition Grid) */}
      {selectedNode && (
        <div className="pt-4 border-t border-[#EEF1EF] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[14px] font-semibold text-[#111814]">{selectedNode.label || selectedNode.id}</div>
              <div className="text-[12px] text-[#5A645F]">{selectedNode.role || "Graph Entity"}</div>
            </div>
            <span className="badge-pill">{selectedNode.type}</span>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5 text-[12.5px]">
            {selectedNode.details ? (
              Object.entries(selectedNode.details).map(([k, v]: [string, any]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[11px] text-[#5A645F] capitalize">{k.replace(/_/g, " ")}</dt>
                  <dd className="mt-0.5 font-medium text-[#111814] truncate" title={String(v)}>
                    {typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : String(v)}
                  </dd>
                </div>
              ))
            ) : (
              <div className="col-span-3 text-[#5A645F]">
                Standard entity node mapped from transaction payload.
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

/* ============================================================= INVESTIGATION */

const SHAP_LABELS: Record<string, string> = {
  amount_deviation: "Amount deviation",
  velocity: "Velocity",
  behavioral: "Behavioral drift",
  anomaly: "Anomaly score",
  graph: "Device network",
  xgb: "XGBoost verdict",
};

export function Investigation() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [rec, setRec] = useState<Rec | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copilot, setCopilot] = useState<any>(null);
  const [copilotErr, setCopilotErr] = useState("");
  const [graph, setGraph] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showRawPayload, setShowRawPayload] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setNotFound(false);
      setCopilot(null);
      setCopilotErr("");
      try {
        setRec(await api.get(id));
      } catch {
        setRec(null);
        setNotFound(true);
      }
      try {
        setGraph(await api.graph(id));
      } catch {
        setGraph(null);
      }
    })();
  }, [id]);

  if (!rec) {
    return (
      <div className="min-h-screen bg-white text-[#111814] flex flex-col justify-between">
        <div>
          <SubpageHero
            activePath="/command-center"
            backHref="/command-center"
            backLabel="Back to Console"
            title={id || "Transaction Investigation"}
            subtitle={
              notFound
                ? "Transaction not found — it may have been cleared on demo reset or created outside this session."
                : "Loading transaction telemetry and risk breakdown…"
            }
          />
          <main className="max-w-[1220px] mx-auto px-6 md:px-10 py-8 space-y-4">
            {!notFound ? (
              <div className="fin-skeleton h-32 w-full rounded-[16px]" />
            ) : (
              <div className="rounded-[16px] bg-[#FAFBF9] border border-[#E3E7E5] p-6 text-[13.5px] text-[#5A645F]">
                No risk record matches <span className="mono font-medium text-[#111814]">{id}</span>. Return to the console or PayPal Sandbox demo to inspect a scored transaction.
              </div>
            )}
            <button type="button" className="btn-secondary" onClick={() => router.push("/command-center")}>
              Return to Console
            </button>
          </main>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const t = rec.transaction as Record<string, any>;
  const s = rec.score;
  const shapMax = Math.max(0.01, ...s.signals.map((x: any) => Math.abs(x.contribution)));

  const actionLabel =
    s.risk_level === "CRITICAL"
      ? "Block Transaction"
      : s.risk_level === "HIGH"
      ? "Hold for Analyst Review"
      : s.risk_level === "MEDIUM"
      ? "Require OTP Step-Up"
      : "Auto-Approve Payment";

  const hasRaw = Boolean(
    t.raw_payload ||
      t.gateway === "Cashfree" ||
      t.gateway === "PayPal" ||
      String(t.transaction_id).startsWith("CF-") ||
      String(t.transaction_id).startsWith("PP-"),
  );

  return (
    <div className="min-h-screen bg-white text-[#111814] flex flex-col justify-between">
      <div>
        <SubpageHero
          activePath="/command-center"
          backHref="/command-center"
          backLabel="Back to Console"
          title={String(t.transaction_id)}
          subtitle={whyFlagged(s)}
          rightSlot={
            <>
              <SourcePill source={s.source} dark />
              <RiskPill level={s.risk_level} />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.1] border border-white/15 px-3.5 py-1 text-[12.5px] font-semibold text-white tabular-nums">
                <Tip label={`Score ${s.risk_score.toFixed(3)}`} text={SCORE_MEANING} dark />
              </span>
            </>
          }
        />

        <main className="max-w-[1220px] mx-auto px-6 md:px-10 py-6 space-y-8">
          {/* Row 1: Single-Layer Telemetry + Five-Signal SHAP Attribution */}
          <div className="grid gap-8 lg:grid-cols-12 items-start">
            <section className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                  Transaction Telemetry
                </h2>
                <Link
                  href={`/privacy/${encodeURIComponent(String(t.user_id || "U-00001"))}`}
                  className="text-[12.5px] font-medium text-[#173525] hover:underline"
                >
                  Identity token →
                </Link>
              </div>

              <div className="rounded-[16px] bg-white border border-[#E3E7E5] overflow-hidden">
                <div className="divide-y divide-[#EEF1EF] px-4">
                  {[
                    ["Amount", formatCurrency(t.amount, t)],
                    ["Timestamp", String(t.timestamp || "").slice(0, 19).replace("T", " ")],
                    ["Merchant", String(t.merchant || "—")],
                    ["Category", String(t.merchant_category || "—")],
                    ["Location", String(t.location || "—")],
                    ["Device", String(t.device_id || "—")],
                    ["Account", String(t.user_id || "—")],
                    ["5m Velocity", `${t.velocity ?? 1} txns`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
                      <span className="text-[#5A645F]">{k}</span>
                      <span className="font-medium text-[#111814] text-right truncate max-w-[60%] tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-[#FAFBF9] border-t border-[#E3E7E5] px-4 py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11.5px] font-medium text-[#5A645F]">Engine recommendation</div>
                    <div className="mt-0.5 text-[14px] font-semibold text-[#111814]">{actionLabel}</div>
                  </div>
                  <Tip
                    label={<RiskPill level={s.risk_level} />}
                    text={LEVEL_MEANINGS[s.risk_level] ?? s.risk_level}
                  />
                </div>
              </div>
            </section>

            <section className="lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="shap" className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                  <Tip
                    label="SHAP Feature Attribution"
                    text="Longer bar = bigger push on the final score. Red shifts toward fraud; deep pine shifts toward safety."
                  />
                </h2>
                <span className="text-[12px] text-[#5A645F]">Grounded model weights</span>
              </div>

              <div className="rounded-[16px] bg-white border border-[#E3E7E5] p-6 space-y-5">
                {s.signals.length === 0 ? (
                  <div className="text-[13px] text-[#5A645F]">No attribution signals recorded.</div>
                ) : (
                  <div className="space-y-3">
                    {s.signals
                      .slice()
                      .sort((a: any, b: any) => Math.abs(b.contribution) - Math.abs(a.contribution))
                      .map((sig: any) => {
                        const pct = Math.max(4, Math.round((Math.abs(sig.contribution) / shapMax) * 100));
                        const pushesFraud = sig.contribution >= 0.05;
                        return (
                          <div key={sig.name} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-[13px]">
                              <span className="font-medium text-[#111814]">
                                <Tip label={SHAP_LABELS[sig.name] || sig.name} text={signalMeaning(sig.name)} />
                              </span>
                              <div className="flex items-center gap-3 tabular-nums">
                                <span className="text-[12px] text-[#5A645F]">val {sig.value}</span>
                                <span
                                  className={`font-semibold w-16 text-right ${
                                    pushesFraud ? "text-[#B42318]" : "text-[#173525]"
                                  }`}
                                >
                                  {sig.contribution >= 0 ? "+" : ""}
                                  {sig.contribution.toFixed(3)}
                                </span>
                              </div>
                            </div>
                            <div className="h-2 w-full rounded-full bg-[#ECEEED] overflow-hidden">
                              <div
                                className="fin-bar h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: pushesFraud ? "#B42318" : "#173525",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                <div className="pt-3 border-t border-[#EEF1EF] flex flex-wrap gap-5 text-[12px] text-[#5A645F]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#B42318]" /> High fraud contribution
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#173525]" /> Low / baseline weight
                  </span>
                </div>

                {/* Policy Rules & Evidence inside the same single-layer container */}
                <div className="pt-4 border-t border-[#EEF1EF] space-y-4">
                  <div>
                    <div className="text-[12.5px] font-semibold text-[#111814] mb-2">Policy rules</div>
                    {s.rules.length === 0 ? (
                      <span className="badge-pill">None triggered</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {s.rules.map((r: string) => (
                          <Tip
                            key={r}
                            label={<span className="badge-pill">{r.toLowerCase().replace(/_/g, " ")}</span>}
                            text={ruleMeaning(r)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {(s.evidence?.length ?? 0) > 0 && (
                    <div>
                      <div className="text-[12.5px] font-semibold text-[#111814] mb-2">Evidence trail</div>
                      <ul className="space-y-1.5 text-[13px] text-[#5A645F]">
                        {s.evidence.map((e: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#173525]" />
                            <span>{e}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Row 2: Simple Entity Flow + AI Copilot */}
          <div className="grid gap-8 lg:grid-cols-12 items-start">
            <section className="lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                    Entity Connections
                  </h2>
                  <p className="mt-0.5 text-[13px] text-[#5A645F]">
                    Select a node to inspect account or device attributes.
                  </p>
                </div>
                <span className="badge-pill">
                  {graph?.kind === "DEMO_SIMULATION" ? "Simulation Graph" : "Local NetworkX Graph"}
                </span>
              </div>

              <SimpleEntityFlow graph={graph} txnId={String(t.transaction_id)} />
            </section>

            <section id="copilot" className="lg:col-span-5 space-y-3">
              <div>
                <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                  AI Investigation Summary
                </h2>
                <p className="mt-0.5 text-[13px] text-[#5A645F]">
                  Summarizes structured telemetry in plain language without altering the risk score.
                </p>
              </div>

              <div className="rounded-[16px] bg-white border border-[#E3E7E5] p-5 space-y-4">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    setCopilotErr("");
                    try {
                      const currency = String(t.currency || (t.channel === "PAYPAL" ? "USD" : "INR")).toUpperCase();
                      const isUsd = currency === "USD";
                      const loc = String(t.location || "");
                      const body = {
                        transaction_amount: t.amount,
                        usual_amount: (rec.context?.usual_amount as number) || (isUsd ? 45.51 : 4200),
                        new_device:
                          Boolean(rec.context?.is_new_device) ||
                          String(t.device_id).includes("NEW") ||
                          String(t.device_id).includes("X"),
                        location_distance_km: loc.includes("400") || loc.includes("300") || loc.includes("Foreign")
                          ? 400
                          : loc.includes("120")
                          ? 120
                          : 10,
                        recent_transaction_count: t.velocity ?? 1,
                        xgboost_score: s.xgb_score ?? s.risk_score,
                        anomaly_score: s.anomaly_score,
                        triggered_rules: s.rules,
                        graph_signals: { shared_device_accounts: s.graph_score && s.graph_score > 0.5 ? 4 : 1 },
                        currency,
                        gateway: String(t.gateway || ""),
                      };
                      setCopilot(await api.explain(body));
                    } catch (e: any) {
                      setCopilotErr(e?.message || "Failed to generate investigation summary");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {loading ? "Generating Summary…" : "Explain This Decision"}
                </button>

                {copilotErr && (
                  <div className="rounded-[12px] bg-[#FDECEC] border border-[#F8D0D0] px-3.5 py-2 text-[12.5px] text-[#B42318]">
                    {copilotErr}
                  </div>
                )}

                {copilot && (
                  <div className="fin-fade-up pt-4 border-t border-[#EEF1EF] space-y-2.5 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#111814]">
                        {String(copilot.fraud_type || "").replace(/_/g, " ")}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <RiskPill level={copilot.risk_level} />
                        {copilot.source && <SourcePill source={copilot.source} />}
                      </div>
                    </div>
                    <p className="text-[#5A645F] leading-[1.6]">{copilot.summary}</p>
                    <div className="pt-1 text-[#173525] font-medium">
                      Recommended: {copilot.recommended_action}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {hasRaw && (
            <section className="rounded-[16px] bg-[#FAFBF9] border border-[#E3E7E5] p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#111814]">Gateway Webhook Payload</h2>
                  <p className="text-[12.5px] text-[#5A645F]">
                    Raw JSON received prior to 36-feature extraction.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRawPayload((v) => !v)}
                  className="btn-secondary py-1.5 px-4 text-[12.5px]"
                >
                  {showRawPayload ? "Hide Raw JSON" : "Show Raw JSON"}
                </button>
              </div>
              {showRawPayload && (
                <pre className="rounded-[12px] bg-[#0B120F] text-[#DCE6E0] p-4 text-[12px] overflow-x-auto max-h-[300px]">
                  {JSON.stringify(
                    t.raw_payload || {
                      gateway: t.gateway || "Cashfree PG",
                      transaction_id: t.transaction_id,
                      amount: t.amount,
                      customer: t.user_id,
                      timestamp: t.timestamp,
                      channel: t.channel || "UPI",
                      status: "PAYMENT_SUCCESS",
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </section>
          )}
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

/* =============================================================== PERFORMANCE */

export function Performance() {
  const [m, setM] = useState<any>(null);

  useEffect(() => {
    api.metrics().then(setM).catch(() => {});
  }, []);

  if (!m) {
    return (
      <div className="min-h-screen bg-white text-[#111814] flex flex-col justify-between">
        <div>
          <SubpageHero
            activePath="/performance"
            title="Model Observatory (Offline ULB)"
            subtitle="Loading benchmark metrics from evaluation reports…"
          />
          <main className="max-w-[1100px] mx-auto px-6 md:px-10 py-8">
            <div className="fin-skeleton h-48 w-full rounded-[16px]" />
          </main>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const row = (name: string, d: any) => (
    <tr className="border-b border-[#EEF1EF] last:border-0 text-[13px]">
      <td className="py-3.5 px-4 font-semibold text-[#111814]">{name}</td>
      <td className="py-3.5 px-4 tabular-nums">{d.roc_auc.toFixed(4)}</td>
      <td className="py-3.5 px-4 tabular-nums">{d.pr_auc.toFixed(4)}</td>
      <td className="py-3.5 px-4 tabular-nums">{d.precision.toFixed(4)}</td>
      <td className="py-3.5 px-4 tabular-nums">{d.recall.toFixed(4)}</td>
      <td className="py-3.5 px-4 tabular-nums">{d.f1.toFixed(4)}</td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-white text-[#111814] flex flex-col justify-between">
      <div>
        <SubpageHero
          activePath="/performance"
          title="Model Observatory (Offline ULB)"
          subtitle="Evaluated offline on the public ULB dataset (284,807 transactions, 0.17% fraud) with zero-leakage stratified splits and synthetic stress tests."
        />

        <main className="max-w-[1100px] mx-auto px-6 md:px-10 py-6 space-y-8">
          {/* 4 Headline Metrics Bar */}
          <div className="rounded-[16px] border border-[#E3E7E5] bg-white grid grid-cols-2 md:grid-cols-4 overflow-hidden">
            {[
              { label: "XGBoost ROC-AUC", val: m.xgboost.roc_auc.toFixed(3) },
              { label: "XGBoost PR-AUC", val: m.xgboost.pr_auc.toFixed(3) },
              { label: "Precision @0.5", val: m.xgboost.precision.toFixed(3) },
              { label: "Recall @0.5", val: m.xgboost.recall.toFixed(3) },
            ].map((item, idx) => (
              <div
                key={item.label}
                className={`p-5 ${idx < 2 ? "border-b md:border-b-0" : ""} ${
                  idx % 2 === 0 ? "border-r" : idx < 3 ? "md:border-r" : ""
                } border-[#E3E7E5]`}
              >
                <div className="text-[12px] font-medium text-[#5A645F]">{item.label}</div>
                <div className="mt-1.5 text-[28px] font-semibold tracking-tight text-[#111814] tabular-nums">
                  {item.val}
                </div>
              </div>
            ))}
          </div>

          {/* Offline ULB Benchmark */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                  Offline ULB Benchmark
                </h2>
                <p className="mt-0.5 text-[13px] text-[#5A645F]">
                  284,807 rows · 492 fraud cases (0.17%) · scaler fitted exclusively on training split.
                </p>
              </div>
              <Link href="/architecture" className="text-[13px] font-medium text-[#173525] hover:underline">
                View System Architecture →
              </Link>
            </div>

            <div className="rounded-[16px] bg-white border border-[#E3E7E5] overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EEF1EF] text-[12px] font-medium text-[#5A645F]">
                    <th className="py-3 px-4">Model</th>
                    <th className="py-3 px-4">ROC-AUC</th>
                    <th className="py-3 px-4">PR-AUC</th>
                    <th className="py-3 px-4">Precision</th>
                    <th className="py-3 px-4">Recall</th>
                    <th className="py-3 px-4">F1 Score</th>
                  </tr>
                </thead>
                <tbody>
                  {row("Logistic Regression (Baseline)", m.logistic_regression)}
                  {row("XGBoost (500 Trees, Scaled)", m.xgboost)}
                </tbody>
              </table>

              <div className="border-t border-[#E3E7E5] bg-[#FAFBF9] grid grid-cols-2 sm:grid-cols-4 text-[13px]">
                {[
                  ["True Positives (TP)", m.xgboost.confusion_matrix.tp],
                  ["False Negatives (FN)", m.xgboost.confusion_matrix.fn],
                  ["False Positives (FP)", m.xgboost.confusion_matrix.fp],
                  ["True Negatives (TN)", m.xgboost.confusion_matrix.tn],
                ].map(([k, v], idx) => (
                  <div
                    key={String(k)}
                    className={`px-4 py-3 border-[#E3E7E5] ${idx < 2 ? "border-b sm:border-b-0" : ""} ${
                      idx % 2 === 0 ? "border-r" : idx < 3 ? "sm:border-r" : ""
                    }`}
                  >
                    <div className="text-[11.5px] text-[#5A645F]">{k}</div>
                    <div className="mt-0.5 text-[16px] font-semibold text-[#111814] tabular-nums">
                      {Number(v).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Synthetic Robustness Stress-Testing */}
          <section className="space-y-3">
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
                Stress-Test Scenarios
              </h2>
              <p className="mt-0.5 text-[13px] text-[#5A645F]">
                Model behavior under class dilution and deliberate feature overlap.
              </p>
            </div>

            <div className="rounded-[16px] bg-white border border-[#E3E7E5] overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EEF1EF] text-[12px] font-medium text-[#5A645F]">
                    <th className="py-3 px-4">Dataset Scenario</th>
                    <th className="py-3 px-4">Fraud Rate</th>
                    <th className="py-3 px-4">XGB PR-AUC</th>
                    <th className="py-3 px-4">Takeaway</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF1EF] text-[13px]">
                  <tr>
                    <td className="py-3 px-4 font-medium">Easy Synthetic</td>
                    <td className="py-3 px-4 tabular-nums">11.5%</td>
                    <td className="py-3 px-4 tabular-nums">0.959</td>
                    <td className="py-3 px-4 text-[#5A645F]">High separability across large amounts</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium">1% Diluted</td>
                    <td className="py-3 px-4 tabular-nums">1.07%</td>
                    <td className="py-3 px-4 tabular-nums">0.553</td>
                    <td className="py-3 px-4 text-[#5A645F]">Realistic imbalance degradation test</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium">Hard Overlap</td>
                    <td className="py-3 px-4 tabular-nums">1.10%</td>
                    <td className="py-3 px-4 font-semibold text-[#173525] tabular-nums">0.373</td>
                    <td className="py-3 px-4 text-[#5A645F]">Overlapping features stress test (33.9× lift)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-[#173525]">Real ULB Benchmark</td>
                    <td className="py-3 px-4 tabular-nums">0.17%</td>
                    <td className="py-3 px-4 font-semibold text-[#173525] tabular-nums">
                      {m.xgboost.pr_auc.toFixed(4)}
                    </td>
                    <td className="py-3 px-4 text-[#5A645F]">Primary offline benchmark (486× lift)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

/* ============================================================== ARCHITECTURE */

const PIPELINE_STAGES = [
  {
    step: "Stage 1",
    title: "Zero-Leakage Features & Tokenization",
    summary: "Every transaction builds 36 point-in-time features strictly from events prior to timestamp t.",
    details: [
      "Personal IDs are pseudonymized with salted SHA-256 before feature extraction.",
      "Computes amount ratios, 5m velocity bursts, geo jumps, and device novelty.",
    ],
  },
  {
    step: "Stage 2",
    title: "Five Independent Risk Signals",
    summary: "No single model decides alone — five heterogeneous detectors evaluate every payment.",
    details: [
      "XGBoost Classifier (35%): Trained on 284,807 real ULB rows.",
      "Isolation Forest (20%) & Deterministic Rules (20%): Catches novel outliers and 8 hard policy tripwires.",
      "Behavioral Profile (15%) & NetworkX Graph (10%): Flags personal habit drift and shared hardware cliques.",
    ],
  },
  {
    step: "Stage 3",
    title: "Calibrated Fusion & Fulfilment Gate",
    summary: "Blends all five signals into one 0–1 score that gates digital delivery automatically.",
    details: [
      "Under 0.30 → Auto-Capture immediately.",
      "0.30 to 0.60 → Hold for OTP step-up verification.",
      "0.60 to 0.85 → Route to human analyst review; above 0.85 → Auto-Void before shipping.",
    ],
  },
  {
    step: "Stage 4",
    title: "SHAP Explainability & Human-Approved Copilot",
    summary: "Mathematical SHAP attribution explains the verdict while proposals wait in a human queue.",
    details: [
      "TreeExplainer decomposes exactly which features raised or lowered the score.",
      "Analyst agent drafts simulated dispute evidence and proposes sandbox voids or refunds — never auto-executing.",
    ],
  },
];

export function Architecture() {
  return (
    <div className="min-h-screen bg-white text-[#111814] flex flex-col justify-between">
      <div>
        <SubpageHero
          activePath="/performance"
          backHref="/performance"
          backLabel="Back to Benchmarks"
          title="Prototype System Architecture"
          subtitle="How the hackathon prototype extracts 36 zero-leakage features, fuses five local signals, and keeps humans in control of every PayPal Sandbox decision."
        />

        <main className="max-w-[1100px] mx-auto px-6 md:px-10 py-6">
          <div className="grid gap-5 md:grid-cols-2">
            {PIPELINE_STAGES.map((stage) => (
              <div
                key={stage.step}
                className="rounded-[18px] bg-[#F5F6F5] border border-[#E3E7E5] p-6 flex flex-col justify-between gap-5"
              >
                <div>
                  <span className="text-[12px] font-semibold text-[#173525]">{stage.step}</span>
                  <h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.015em] text-[#111814]">
                    {stage.title}
                  </h2>
                  <p className="mt-1.5 text-[13.5px] leading-[1.55] text-[#5A645F]">{stage.summary}</p>
                </div>

                <ul className="border-t border-[#E2E6E3] pt-4 space-y-2 text-[13px] text-[#5A645F]">
                  {stage.details.map((d) => (
                    <li key={d} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#173525]" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

/* =================================================================== PRIVACY */

export function Privacy() {
  const { uid } = useParams() as { uid: string };
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!uid) return;
    setErr("");
    api
      .identity(uid)
      .then(setD)
      .catch((e: any) => setErr(e?.message || "Failed to load identity token"));
  }, [uid]);

  return (
    <div className="min-h-screen bg-white text-[#111814] flex flex-col justify-between">
      <div>
        <SubpageHero
          activePath="/command-center"
          backHref="/command-center"
          backLabel="Back to Console"
          title="Privacy & Identity Tokenization"
          subtitle="Salted SHA-256 pseudonymization ensures raw personal identifiers never enter ML features or entity graphs."
        />

        <main className="max-w-[920px] mx-auto px-6 md:px-10 py-6 space-y-3">
          {err && (
            <div className="rounded-[12px] bg-[#FDECEC] border border-[#F8D0D0] px-4 py-2.5 text-[12.5px] text-[#B42318]">
              {err}
            </div>
          )}

          <div className="rounded-[16px] bg-white border border-[#E3E7E5] overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EEF1EF] text-[12px] font-medium text-[#5A645F]">
                  <th className="py-3 px-4">Field</th>
                  <th className="py-3 px-4">Raw Ingestion</th>
                  <th className="py-3 px-4">Tokenized Output</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1EF] text-[13px]">
                {[
                  ["User Identity", d?.user_id ?? uid, d ? (d.user_token ?? d.token ?? "—") : err ? "Unavailable" : "Loading…"],
                  ["Phone Number", "••••••••42", d ? (d.phone ?? d.phone_masked ?? "••••••••42") : "—"],
                  ["National ID Token", "Confidential", d ? (d.document ?? d.id_token ?? "TOKENIZED") : "—"],
                  ["Verification Status", "Verified", d ? (d.status ?? d.verification ?? "VERIFIED") : "—"],
                ].map(([k, raw, tok]) => (
                  <tr key={k}>
                    <td className="py-3.5 px-4 font-medium text-[#5A645F]">{k}</td>
                    <td className="py-3.5 px-4 mono text-[12.5px] text-[#111814]">{String(raw)}</td>
                    <td className="py-3.5 px-4 mono text-[12.5px] font-semibold text-[#173525]">
                      {String(tok)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[12.5px] text-[#5A645F]">
            Method: <span className="font-medium text-[#111814]">{d?.method ?? "Prototype Salted SHA-256 Pseudonymization"}</span>
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

/* ================================================================== GLOSSARY */

export function Glossary() {
  return (
    <div className="min-h-screen bg-white text-[#111814] flex flex-col justify-between">
      <div>
        <SubpageHero
          activePath="/performance"
          title="Plain-English Glossary"
          subtitle="Every fraud, ML, and risk-engine term used across FinShield explained clearly in one sentence."
        />

        <main className="max-w-[1100px] mx-auto px-6 md:px-10 py-6 space-y-8">
          <section className="space-y-3">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
              Core concepts
            </h2>
            <div className="rounded-[16px] bg-white border border-[#E3E7E5] grid md:grid-cols-2 overflow-hidden">
              {GLOSSARY.map((g, i) => {
                const lastRowStart = GLOSSARY.length - (GLOSSARY.length % 2 === 0 ? 2 : 1);
                return (
                  <div
                    key={g.term}
                    className={`p-4 border-[#EEF1EF] ${i % 2 === 0 ? "md:border-r" : ""} ${
                      i < lastRowStart ? "border-b" : i < GLOSSARY.length - 1 ? "border-b md:border-b-0" : ""
                    }`}
                  >
                    <div className="text-[14px] font-semibold text-[#111814]">{g.term}</div>
                    <p className="mt-1 text-[13px] leading-[1.55] text-[#5A645F]">{g.meaning}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#111814]">
              Deterministic policy rules
            </h2>
            <div className="rounded-[16px] bg-white border border-[#E3E7E5] divide-y divide-[#EEF1EF] overflow-hidden">
              {Object.entries(RULE_MEANINGS).map(([code, meaning]) => (
                <div key={code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
                  <span className="mono text-[12px] font-medium text-[#173525]">{code}</span>
                  <span className="text-[#5A645F]">{meaning}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
