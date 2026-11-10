"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/* ------------------------------------------------------------------ shared */

const CREAM = "#F2EFE7";
const INK = "#171916";
const ORANGE = "#FF5B35";
const MUTED = "#7F837B";
const BORDER = "#D8D4CA";

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
  { key: "clean", label: "Clean returning buyer", amount: "$42.00", blurb: "Known device, usual amount → auto-capture", hint: "green" },
  { key: "friendly_fraud", label: "Friendly-fraudster", amount: "$220.00", blurb: "Amount far off profile → OTP step-up", hint: "amber" },
  { key: "review", label: "Suspicious pattern", amount: "$180.00", blurb: "New device + activity spike → analyst review", hint: "amber" },
  { key: "stolen_account", label: "Stolen account", amount: "$4,800.00", blurb: "High value + shared device → auto-void", hint: "red" },
];

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
  const [intents, setIntents] = useState<IntentRow[]>([]);
  const sessionRef = useRef<{ start: (mode: Record<string, unknown>, orderPromise: Promise<string>) => Promise<unknown> } | null>(null);

  const refreshIntents = useCallback(async () => {
    const data = (await api.paypalIntents()) as { intents?: IntentRow[] };
    setIntents((data.intents || []).slice(0, 8));
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
      })) as { paypal_order_id: string; amount: string; currency: string };
      setOrder(o);
      if (sessionRef.current) {
        // SDK v6 expects an order-creation CALLBACK (async fn returning the id),
        // not a bare promise — passing a promise leaves the popup spinning.
        await sessionRef.current.start({ presentationMode: "auto" }, async () => o.paypal_order_id);
      } else {
        // stub / offline mode: no popup — straight to the authorization gate
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
      const r = await api.paypalVerifyOtp(decision.intent_id, "000000");
      setDecision({ ...decision, status: "VOIDED", decision: "AUTO_VOID", void_status: "VOIDED" });
      setBusy(false);
      void r;
      return;
    }
    const r = (await api.paypalVerifyOtp(decision.intent_id, otp || "123456")) as { action?: string; status?: string };
    setDecision({ ...decision, status: "CAPTURED", decision: "AUTO_CAPTURE" });
    setBusy(false);
    refreshIntents();
    void r;
  }

  async function analyst(action: "capture" | "void") {
    if (!decision?.intent_id) return;
    setBusy(true);
    const r = (await api.paypalApprove(decision.intent_id, action, "analyst")) as Record<string, unknown>;
    setDecision({
      ...decision,
      status: action === "capture" ? "CAPTURED" : "VOIDED",
      decision: action === "capture" ? "AUTO_CAPTURE" : "AUTO_VOID",
    });
    setBusy(false);
    refreshIntents();
    void r;
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

      <div className="mt-3 flex items-center gap-2">
        <span className="badge-pill mono text-[9px]">ENV: {cfg?.environment?.toUpperCase() || "…"}</span>
        {decision?.source && <SrcChip s={decision.source} />}
        {offline && (
          <span className="risk-HIGH mono text-[9px]">API OFFLINE — simulated decisions, never fake PayPal orders</span>
        )}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-12">
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
            className="btn-primary w-full py-3 text-xs font-bold"
            style={{ background: "#FFC439", color: "#171916" }}
          >
            {busy ? "Working…" : sdkReady ? `Pay ${customAmount || scenarioMeta.amount} with PayPal` : `Simulate buyer approval → authorization gate`}
          </button>
          {sdkReady && <p className="font-micro-label mt-2 text-[10px] text-[#7F837B]">Real sandbox popup — sign in as the personal sandbox buyer.</p>}
          {order && !sdkReady && (
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
            {!decision && (
              <div className="rounded-[11px] border border-dashed border-[#D8D4CA] p-6 text-center text-xs text-[#7F837B]">
                Run a checkout — the decision lands here: score, signals, evidence and what happens to the money.
              </div>
            )}
            {decision && (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <LevelChip level={decision.risk_level} />
                  <span className="badge-pill mono text-[10px]">{decision.decision}</span>
                  <span className="font-mono text-xs text-[#171916]">score {decision.risk_score}</span>
                  {decision.status && <span className="badge-pill mono text-[9px]">{decision.status}</span>}
                </div>

                {decision.decision === "AUTO_CAPTURE" && (
                  <div className="mt-3 rounded-[11px] border border-[#4CAF50] bg-[#E8F5E9] p-4">
                    <div className="font-title-md text-sm text-[#1B5E20]">Captured — digital good delivered</div>
                    <div className="mono mt-1 text-[10px] text-[#2E7D32]">
                      capture {decision.capture_id || "—"} · authorization {decision.authorization_id || "—"}
                    </div>
                  </div>
                )}

                {decision.status === "HELD_STEP_UP" && (
                  <div className="mt-3 rounded-[11px] border border-[#B7791F] bg-[#FFF8E7] p-4">
                    <div className="font-title-md text-sm text-[#7B341E]">Held — step-up verification required</div>
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

                {decision.status === "HELD_REVIEW" && (
                  <div className="mt-3 rounded-[11px] border border-[#B7791F] bg-[#FFF8E7] p-4">
                    <div className="font-title-md text-sm text-[#7B341E]">Held — analyst reviewing</div>
                    <div className="font-micro-label mt-1 text-[10px] text-[#7F837B]">A human decides; the agent can only propose. Approve or reject below.</div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => analyst("capture")} disabled={busy} className="btn-primary px-3 py-2 text-[10px]">Approve capture</button>
                      <button onClick={() => analyst("void")} disabled={busy} className="btn-secondary px-3 py-2 text-[10px]">Void before delivery</button>
                    </div>
                  </div>
                )}

                {decision.status === "VOIDED" && (
                  <div className="mt-3 rounded-[11px] border border-[#C53030] bg-[#FDECEC] p-4">
                    <div className="font-title-md text-sm text-[#C53030]">Authorization voided before delivery</div>
                    <div className="font-micro-label mt-1 text-[10px] text-[#C53030]">
                      Nothing shipped, nothing to dispute — no chargeback fees, no lost goods.
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <div className="font-micro-label text-[10px] text-[#7F837B]">POLICY TRIGGERS</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(decision.rule_messages?.length ? decision.rule_messages : ["No rule triggers — within profile"]).map((m, i) => (
                      <span key={i} className="badge-pill text-[9px]">{m}</span>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="font-micro-label text-[10px] text-[#7F837B]">EVIDENCE TRAIL</div>
                  <ul className="mt-1 space-y-1">
                    {(decision.evidence || []).map((e, i) => (
                      <li key={i} className="font-mono text-[10px] text-[#555951]">· {e}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-1 md:grid-cols-3">
                  {(decision.signals || []).map((s) => (
                    <div key={s.name} className="rounded-[7px] border border-[#E7E4DB] p-2">
                      <div className="font-micro-label text-[9px] text-[#7F837B]">{s.name}</div>
                      <div className="mono text-[10px] text-[#171916]">{s.value} · contrib {s.contribution}</div>
                    </div>
                  ))}
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
              {intents.length === 0 && <div className="font-micro-label text-[10px] text-[#7F837B]">No intents yet.</div>}
              {intents.map((it) => (
                <div key={it.id} className="flex items-center justify-between rounded-[7px] border border-[#E7E4DB] px-3 py-2">
                  <div className="font-mono text-[10px] text-[#171916]">
                    {it.paypal_order_id} · {it.amount} {it.currency} · {it.scenario}
                  </div>
                  <div className="flex items-center gap-1">
                    <LevelChip level={it.risk_level || undefined} />
                    <span className="badge-pill mono text-[9px]">{it.status}</span>
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

export function AgentConsole() {
  const [health, setHealth] = useState<{ source: string; llm_configured: boolean; model?: string } | null>(null);
  const [messages, setMessages] = useState<{ role: "user" | "agent"; text: string; source?: string }[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
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
    await approve ? api.agentApprove(id, "riddhi") : api.agentReject(id, "riddhi");
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
      <div className="mt-3 flex items-center gap-2">
        {health && (
          <>
            <span className={`badge-pill mono text-[9px]`}>AGENT SOURCE: {health.source}</span>
            {health.model && <span className="font-mono text-[10px] text-[#7F837B]">{health.model}</span>}
          </>
        )}
        <button onClick={simulateDispute} disabled={busy} className="btn-secondary px-3 py-1 text-[10px]">Simulate dispute (sandbox has no buyer-side disputes)</button>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-12">
        {/* chat */}
        <section className="card-white p-5 lg:col-span-6">
          <div className="font-label-caps mb-3 text-[10px]">ANALYST CHAT</div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-[11px] bg-[#171916] p-3 text-[#F2EFE7]">
            {messages.length === 0 && (
              <div className="mono text-[10px] text-[#A7AAA3]">
                Try: &quot;review the queue and propose voids for anything critical&quot; or &quot;refund the last capture&quot;.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div className={`mono whitespace-pre-wrap text-[11px] ${m.role === "user" ? "text-[#FF795A]" : "text-[#F2EFE7]"}`}>{m.text}</div>
                {m.source && <div className="mono text-[8px] text-[#A7AAA3]">{m.source}</div>}
              </div>
            ))}
            {thinking && <div className="mono text-[10px] text-[#A7AAA3]">agent working…</div>}
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

        {/* approval queue */}
        <section className="card-white p-5 lg:col-span-6">
          <div className="font-label-caps mb-3 text-[10px]">APPROVAL QUEUE — NOTHING MOVES WITHOUT A CLICK</div>
          <div className="space-y-2">
            {actions.length === 0 && <div className="font-micro-label text-[10px] text-[#7F837B]">No agent proposals yet.</div>}
            {actions.map((a) => (
              <div key={a.id} className="rounded-[11px] border border-[#E7E4DB] p-3">
                <div className="flex items-center justify-between">
                  <span className="badge-pill mono text-[9px]">{a.kind}</span>
                  <span className={`badge-pill mono text-[9px] ${a.status === "PENDING" ? "" : ""}`}>{a.status}</span>
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
                    <button onClick={() => decide(a.id, true)} disabled={busy} className="btn-primary px-3 py-1 text-[9px]">Approve & execute</button>
                    <button onClick={() => decide(a.id, false)} disabled={busy} className="btn-secondary px-3 py-1 text-[9px]">Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="font-label-caps mb-2 mt-6 text-[10px]">DISPUTES</div>
          <div className="space-y-1">
            {disputes.length === 0 && <div className="font-micro-label text-[10px] text-[#7F837B]">No disputes on file. Use “Simulate dispute”.</div>}
            {disputes.map((d) => (
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
            <div className="mt-3 rounded-[11px] border border-[#D8D4CA] bg-[#FFFDF7] p-3">
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

export { INK, MUTED, BORDER, ORANGE };
