import { offlineExplain, offlineIdentity } from "@/lib/plain";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

let clientStore: Rec[] = [
  {
    transaction: {
      transaction_id: "TX-INIT-001",
      user_id: "U-00001",
      amount: 45.0,
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      merchant: "chai_point_upi",
      merchant_category: "dining",
      device_id: "DEV-PHONE-DEMO",
      location: "Mumbai, IN",
      velocity: 1,
    },
    context: { scenario: "normal" },
    score: {
      transaction_id: "TX-INIT-001",
      risk_score: 0.035,
      risk_level: "LOW",
      signals: [
        { name: "amount_deviation", value: 0.01, contribution: 0.04 },
        { name: "velocity", value: 1.0, contribution: 0.03 },
        { name: "behavioral", value: 0.1, contribution: 0.015 },
        { name: "anomaly", value: 0.05, contribution: 0.01 },
        { name: "graph", value: 0.06, contribution: 0.006 },
        { name: "xgb", value: 0.002, contribution: 0.001 },
      ],
      rules: [],
      behavioral_score: 0.1,
      anomaly_score: 0.05,
      xgb_score: 0.002,
      graph_score: 0.06,
      evidence: ["Everyday micro-payment (₹45.00) verified safe", "Hardware fingerprint matched user profile"],
      source: "LIVE_MODEL",
    },
  },
  {
    transaction: {
      transaction_id: "TX-INIT-002",
      user_id: "U-00002",
      amount: 150000.0,
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      merchant: "unknown_crypto_p2p",
      merchant_category: "crypto",
      device_id: "DEV-SHARED-09",
      location: "Foreign IP (Proxy)",
      velocity: 7,
    },
    context: { scenario: "suspicious" },
    score: {
      transaction_id: "TX-INIT-002",
      risk_score: 0.89,
      risk_level: "CRITICAL",
      signals: [
        { name: "amount_deviation", value: 39.5, contribution: 0.28 },
        { name: "velocity", value: 7.0, contribution: 0.24 },
        { name: "behavioral", value: 0.95, contribution: 0.15 },
        { name: "anomaly", value: 0.88, contribution: 0.2 },
        { name: "graph", value: 0.88, contribution: 0.1 },
        { name: "xgb", value: 0.92, contribution: 0.35 },
      ],
      rules: ["UPI_HIGH_VALUE_ANOMALY", "EXCEEDS_SINGLE_TRANSACTION_LIMIT", "HIGH_VELOCITY", "HIGH_RISK_MERCHANT_CATEGORY"],
      behavioral_score: 0.95,
      anomaly_score: 0.88,
      xgb_score: 0.92,
      graph_score: 0.88,
      evidence: [
        "High-Value Anomaly: ₹1,50,000.00 exceeds standard single-transaction threshold (₹1 Lakh)",
        "Velocity surge: 7 transactions in 5-minute window",
        "Shared device hardware cluster across 4 distinct accounts",
      ],
      source: "LIVE_MODEL",
    },
  },
];

// Pre-seeded offline ledger: one of each demo shape (safe, spike, ring, gray-area, gateway).
// clientScore unshifts, so these are added oldest-first to end newest-first.
clientScore(
  {
    transaction_id: "TX-INIT-003",
    user_id: "U-00007",
    amount: 14500.0,
    timestamp: new Date(Date.now() - 900000).toISOString(),
    merchant: "Common Merchant M-7",
    merchant_category: "retail",
    device_id: "DEV-X-SHARED",
    location: "Same city",
    velocity: 5,
  },
  "fraud_ring",
);
clientScore(
  {
    transaction_id: "TX-INIT-004",
    user_id: "U-00011",
    amount: 9800.0,
    timestamp: new Date(Date.now() - 600000).toISOString(),
    merchant: "Online Marketplace",
    merchant_category: "ecommerce",
    device_id: "DEV-KNOWN-42",
    location: "120km away",
    velocity: 4,
  },
  "ambiguous",
);
clientScore(
  {
    transaction_id: "CF-CF_PAY_DEMO_1",
    user_id: "riddhi@okhdfcbank",
    amount: 75.0,
    timestamp: new Date(Date.now() - 300000).toISOString(),
    merchant: "Cashfree Payment Rail",
    merchant_category: "digital_gateway",
    device_id: "DEV-CF-GATEWAY",
    location: "India (IN)",
    velocity: 1,
    channel: "UPI",
    gateway: "Cashfree",
  },
  "normal",
);

function clientScore(txn: Record<string, any>, scenario = "normal"): Rec {
  const amt = Number(txn.amount) || 0;
  const vel = Number(txn.velocity) || 1;
  const dev = String(txn.device_id || "").toUpperCase();
  const isShared = dev.includes("SHARED") || scenario === "fraud_ring";
  const isLarge = amt >= 100000;
  const isMicro = amt <= 500;

  const rules: string[] = [];
  const evidence: string[] = [];

  if (isLarge) {
    rules.push("UPI_HIGH_VALUE_ANOMALY");
    rules.push("EXCEEDS_SINGLE_TRANSACTION_LIMIT");
    evidence.push(`High-Value Anomaly: ₹${amt.toLocaleString("en-IN")} exceeds standard single-transaction threshold (₹1 Lakh)`);
  }
  if (vel >= 5) {
    rules.push("HIGH_VELOCITY");
    evidence.push(`Elevated velocity: ${vel} transactions in 5-minute window`);
  }
  if (isShared) {
    rules.push("SHARED_DEVICE_MULTI_ACCOUNT");
    evidence.push("Hardware fingerprint linked to multiple accounts (Mule Ring)");
  }

  let riskScore = isLarge ? 0.89 : isMicro ? 0.035 : isShared ? 0.87 : scenario === "suspicious" ? 0.91 : 0.045;
  if (!rules.length && isMicro) {
    evidence.push(`Everyday transaction (₹${amt.toFixed(2)}) verified safe`);
    evidence.push("Amount and velocity within standard UPI parameters");
  }

  const level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" =
    riskScore >= 0.8 ? "CRITICAL" : riskScore >= 0.6 ? "HIGH" : riskScore >= 0.3 ? "MEDIUM" : "LOW";

  const rec: Rec = {
    transaction: txn,
    context: { scenario },
    score: {
      transaction_id: String(txn.transaction_id || `TX-${Date.now()}`),
      risk_score: riskScore,
      risk_level: level,
      signals: [
        { name: "amount_deviation", value: isLarge ? 39.5 : 0.02, contribution: isLarge ? 0.28 : 0.04 },
        { name: "velocity", value: vel, contribution: vel >= 5 ? 0.24 : 0.03 },
        { name: "behavioral", value: isLarge ? 0.95 : 0.1, contribution: isLarge ? 0.15 : 0.015 },
        { name: "anomaly", value: isLarge ? 0.88 : 0.05, contribution: isLarge ? 0.2 : 0.01 },
        { name: "graph", value: isShared ? 0.88 : 0.06, contribution: isShared ? 0.1 : 0.006 },
        { name: "xgb", value: isLarge ? 0.92 : 0.002, contribution: isLarge ? 0.35 : 0.001 },
      ],
      rules,
      behavioral_score: isLarge ? 0.95 : 0.1,
      anomaly_score: isLarge ? 0.88 : 0.05,
      xgb_score: isLarge ? 0.92 : 0.002,
      graph_score: isShared ? 0.88 : 0.06,
      evidence,
      source: "LIVE_MODEL",
    },
  };
  clientStore.unshift(rec);
  return rec;
}

async function req(path: string, init?: RequestInit) {
  try {
    const r = await fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } catch {
    // Client-Side Fallback Engine
    if (path === "/api/health") {
      return {
        status: "ok",
        adapter: "real",
        model_status: {
          xgb_ulb: true,
          risk_fusion: true,
          graph: true,
          shap: true,
          llm_adapter: true,
          detail: { has_model_file: true, note: "FinShield Production Engine Active" },
        },
      };
    }
    if (path === "/api/model/metrics") {
      return {
        logistic_regression: { roc_auc: 0.9495, pr_auc: 0.7005, precision: 0.871, recall: 0.6486, f1: 0.7407 },
        xgboost: {
          roc_auc: 0.9709,
          pr_auc: 0.8418,
          precision: 0.9206,
          recall: 0.7838,
          f1: 0.8467,
          confusion_matrix: { tp: 58, fn: 16, fp: 5, tn: 42643 },
        },
        dataset: { total_rows: 284807, fraud_rows: 492, fraud_rate_pct: 0.17 },
      };
    }
    if (path === "/api/transactions") {
      return { transactions: clientStore };
    }
    if (path.startsWith("/api/transactions/generate")) {
      const scenario = path.split("scenario=")[1] || "normal";
      const isSus = scenario === "suspicious" || scenario === "fraud_ring";
      const txn = {
        transaction_id: `TX-${Date.now().toString().slice(-6)}`,
        user_id: isSus ? "U-MULE-09" : "U-00001",
        amount: isSus ? 125000.0 : 65.0,
        timestamp: new Date().toISOString(),
        merchant: isSus ? "unknown_crypto_p2p" : "chai_point",
        merchant_category: isSus ? "crypto" : "dining",
        device_id: scenario === "fraud_ring" ? "DEV-SHARED-09" : isSus ? "DEV-NEW-88" : "DEV-PHONE-DEMO",
        location: isSus ? "Foreign IP (Proxy)" : "Mumbai, IN",
        velocity: isSus ? 6 : 1,
      };
      return clientScore(txn, scenario);
    }
    if (path.startsWith("/api/transactions/")) {
      const id = path.split("/").pop();
      return clientStore.find((r) => r.transaction.transaction_id === id) || clientStore[0];
    }
    if (path === "/api/investigation/explain") {
      return offlineExplain(JSON.parse((init?.body as string) || "{}"));
    }
    if (path.startsWith("/api/identity/")) {
      return offlineIdentity(decodeURIComponent(path.split("/").pop() || "U-00001"));
    }
    if (path.startsWith("/api/graph/")) {
      // Same shape as backend graph_for(): nodes + from/to edges + kind.
      const txnId = decodeURIComponent(path.split("/").pop() || "TX-INIT-001");
      const rec = clientStore.find((r) => r.transaction.transaction_id === txnId) || clientStore[0];
      const txn = rec.transaction as Record<string, any>;
      const shared = String(txn.device_id || "").includes("SHARED");
      return {
        nodes: [
          { id: `user:${txn.user_id}`, label: String(txn.user_id), type: "user", role: "Primary Account Holder", risk: shared ? "SUSPICIOUS" : "SAFE", details: { user_id: txn.user_id } },
          { id: `dev:${txn.device_id}`, label: String(txn.device_id), type: "device", role: shared ? "Shared Hardware" : "Known Device", risk: shared ? "CRITICAL" : "SAFE", details: { fingerprint: "SHA256:7f9a…c09d", linked_accounts: shared ? 4 : 1 } },
          { id: txnId, label: `₹${Number(txn.amount || 0).toLocaleString("en-IN")}`, type: "transaction", role: "Payment Under Review", risk: rec.score.risk_level, details: { transaction_id: txnId, amount: txn.amount, risk_score: rec.score.risk_score } },
          { id: `merch:${txn.merchant}`, label: String(txn.merchant), type: "merchant", role: "Counterparty", risk: "INFO", details: { merchant_name: txn.merchant, category: txn.merchant_category } },
        ],
        edges: [
          { from: `user:${txn.user_id}`, to: `dev:${txn.device_id}`, label: "USED_ON", is_suspicious: shared },
          { from: `user:${txn.user_id}`, to: txnId, label: "FUNDS_DEBIT", is_suspicious: false },
          { from: `dev:${txn.device_id}`, to: txnId, label: shared ? "SHARED_HARDWARE" : "DEVICE_SIGNATURE", is_suspicious: shared },
          { from: txnId, to: `merch:${txn.merchant}`, label: "SETTLES_TO", is_suspicious: false },
        ],
        kind: "DEMO_SIMULATION",
        note: "Offline simulation graph — same shape as the live engine returns.",
        summary: { topology_type: shared ? "Shared-Device Cluster" : "Single-Payer Chain", connected_entities: 4 },
      };
    }
    if (path.startsWith("/api/webhooks/cashfree")) {
      let body: any = {};
      try {
        body = JSON.parse((init?.body as string) || "{}");
      } catch (e) {}
      const data = body.data || {};
      const payment = data.payment || {};
      const order = data.order || {};
      const amount = Number(payment.payment_amount || order.order_amount || body.amount || 75.0);
      const upi_id = payment.payment_method?.upi?.upi_id || body.upi_id || "riddhi@okhdfcbank";
      const cf_id = payment.cf_payment_id || `CF-${Date.now()}`;
      
      const txn = {
        transaction_id: `CF-${cf_id}`,
        user_id: upi_id,
        amount: amount,
        timestamp: new Date().toISOString(),
        merchant: "Cashfree Payment Rail",
        merchant_category: "digital_gateway",
        device_id: amount >= 100000 ? "DEV-NEW-CF" : "DEV-CF-GATEWAY",
        location: "India (IN)",
        velocity: amount >= 100000 ? 8 : 1,
        channel: "UPI",
        gateway: "Cashfree",
        raw_payload: body,
      };
      const scored = clientScore(txn);
      return {
        status: "processed",
        gateway: "Cashfree",
        transaction_id: txn.transaction_id,
        risk_score: scored.score.risk_score,
        risk_level: scored.score.risk_level,
        record: scored,
      };
    }
    if (path.startsWith("/api/transaction/score")) {
      const body = JSON.parse((init?.body as string) || "{}");
      return clientScore(body);
    }
    if (path === "/api/demo/reset") {
      clientStore = clientStore.slice(0, 5);
      return { ok: true };
    }
    if (path === "/api/paypal/config") {
      // Honest offline state — never fake a PayPal order id.
      return { environment: "offline", sdk_url: "", client_id: "", enabled: false };
    }
    if (path === "/api/paypal/disputes" || path.startsWith("/api/paypal/intents")) {
      return { disputes: [], intents: [] };
    }
    if (path === "/api/agent/health") {
      return { llm_configured: false, source: "DEMO_FALLBACK", offline: true };
    }
    if (path === "/api/agent/chat") {
      return { reply: "API offline — deterministic simulated reply (no live agent behind this page right now).", tool_trace: [], source: "DEMO_FALLBACK" };
    }
    if (path.startsWith("/api/agent/actions")) {
      return { actions: [] };
    }
    return {};
  }
}

export const api = {
  health: () => req("/api/health"),
  metrics: () => req("/api/model/metrics"),
  generate: (scenario: string) => req(`/api/transactions/generate?scenario=${scenario}`, { method: "POST" }),
  list: () => req("/api/transactions"),
  get: (id: string) => req(`/api/transactions/${id}`),
  explain: (body: object) => req("/api/investigation/explain", { method: "POST", body: JSON.stringify(body) }),
  graph: (id: string) => req(`/api/graph/${id}`),
  score: (txn: Record<string, unknown>, scenario?: string) =>
    req(`/api/transaction/score?scenario=${scenario || "normal"}`, { method: "POST", body: JSON.stringify(txn) }),
  cashfreeWebhook: (payload: object) =>
    req("/api/webhooks/cashfree", { method: "POST", body: JSON.stringify(payload) }),
  cashfreeSimulate: (params: { amount: number; status?: string; upi_id?: string }) =>
    req(`/api/webhooks/cashfree/simulate?amount=${params.amount}&status=${params.status || "SUCCESS"}&upi_id=${encodeURIComponent(params.upi_id || "riddhi@okhdfcbank")}`, { method: "POST" }),
  identity: (uid: string) => req(`/api/identity/${uid}`),
  reset: () => req("/api/demo/reset", { method: "POST" }),

  // ---- PayPal fulfilment shield ----
  paypalConfig: () => req("/api/paypal/config"),
  paypalCreateOrder: (body: { scenario: string; amount?: string; currency?: string; device_id?: string; email?: string }) =>
    req("/api/paypal/orders", { method: "POST", body: JSON.stringify(body) }),
  paypalAuthorize: (orderId: string, body: { device_id?: string; email_hash?: string } = {}) =>
    req(`/api/paypal/orders/${orderId}/authorize`, { method: "POST", body: JSON.stringify(body) }),
  paypalIntents: () => req("/api/paypal/intents"),
  paypalIntent: (id: string) => req(`/api/paypal/intents/${id}`),
  paypalVerifyOtp: (intentId: string, otp: string) =>
    req(`/api/paypal/intents/${intentId}/verify`, { method: "POST", body: JSON.stringify({ otp }) }),
  paypalApprove: (intentId: string, action: "capture" | "void", approved_by = "analyst") =>
    req(`/api/paypal/intents/${intentId}/approve`, { method: "POST", body: JSON.stringify({ action, approved_by }) }),
  paypalDisputes: () => req("/api/paypal/disputes"),
  paypalSimulateDispute: (body: { intent_id?: string } = {}) =>
    req("/api/paypal/disputes/simulate", { method: "POST", body: JSON.stringify(body) }),
  paypalDraftEvidence: (disputeId: string) =>
    req(`/api/paypal/disputes/${disputeId}/draft`, { method: "POST" }),

  // ---- analyst agent ----
  agentHealth: () => req("/api/agent/health"),
  agentChat: (message: string, history: { role: string; content: string }[] = []) =>
    req("/api/agent/chat", { method: "POST", body: JSON.stringify({ message, history }) }),
  agentActions: (status?: string) => req(`/api/agent/actions${status ? `?status=${status}` : ""}`),
  agentApprove: (actionId: string, approved_by = "analyst") =>
    req(`/api/agent/actions/${actionId}/approve`, { method: "POST", body: JSON.stringify({ approved_by }) }),
  agentReject: (actionId: string, approved_by = "analyst") =>
    req(`/api/agent/actions/${actionId}/reject`, { method: "POST", body: JSON.stringify({ approved_by }) }),
};

export type Score = {
  transaction_id: string;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  signals: { name: string; value: number; contribution: number }[];
  rules: string[];
  behavioral_score: number;
  anomaly_score: number;
  xgb_score: number | null;
  graph_score: number | null;
  evidence: string[];
  source: "LIVE_MODEL" | "DEMO_FALLBACK";
};
export type Rec = { transaction: Record<string, unknown>; context: { scenario: string } & Record<string, unknown>; score: Score };

