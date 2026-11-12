// Plain-language dictionary: every jargon term in the UI explained in one line.
// Used by tooltips, the why-flagged box, and the Glossary page.

export const RULE_MEANINGS: Record<string, string> = {
  BURST_VELOCITY: "8+ payments in 5 minutes — classic card-testing burst.",
  HIGH_VELOCITY: "5+ payments in 5 minutes — unusually fast spending.",
  NEW_DEVICE_HIGH_VALUE: "Big payment from a device never seen before.",
  NEW_DEVICE: "Payment from an unrecognized device.",
  SHARED_DEVICE_MULTI_ACCOUNT: "One device used by several accounts — possible fraud ring.",
  UNUSUAL_AMOUNT: "Amount far above this user's normal spending.",
  OFFHOURS_HIGH_VALUE: "Large payment in the middle of the night (12–6am).",
  UNUSUAL_LOCATION: "Payment ~300km+ from the user's usual place.",
  HIGH_RISK_MERCHANT_CATEGORY: "Crypto, gambling or electronics with a large amount.",
  UPI_HIGH_VALUE_ANOMALY: "₹1,00,000+ in one UPI payment — over the normal limit.",
  EXCEEDS_SINGLE_TRANSACTION_LIMIT: "Single payment above the ₹1 Lakh UPI cap.",
  MODERATE_VELOCITY: "Slightly fast pace — suspicious only with other signals.",
  SLIGHT_AMOUNT_DEVIATION: "A bit above usual — suspicious only with other signals.",
  HIGH_VALUE_SPIKE: "High-value spike far above the buyer's usual order profile.",
  AMOUNT_LIMIT_EXCEEDED: "Single order exceeds standard authorization threshold.",
  LINKED_DEVICE_CLUSTER: "Multiple buyer accounts observed behind the same device hardware.",
  VELOCITY_BURST: "8+ attempts in 5 minutes — classic card-testing or automation burst.",
  HIGH_ACTIVITY: "5+ attempts in 5 minutes — unusually fast ordering pace.",
  AMOUNT_DEVIATION: "Order amount far exceeds this buyer's historical baseline.",
  LOCATION_ANOMALY: "Checkout originated ~300km+ from the buyer's usual region.",
  HIGH_RISK_CATEGORY: "High-risk digital goods or electronics category with elevated amount.",
};

export const SIGNAL_MEANINGS: Record<string, string> = {
  amount_deviation: "How far this amount is from the user's usual spend.",
  velocity: "How many payments happened in the last few minutes.",
  behavioral: "How much this breaks the user's normal habits.",
  anomaly: "How strange this looks vs all past legitimate payments.",
  graph: "Whether the device/account links to known fraud rings.",
  xgb: "XGBoost model verdict, trained on 284,807 real transactions.",
};

export const LEVEL_MEANINGS: Record<string, string> = {
  LOW: "Looks normal — approved automatically.",
  MEDIUM: "Slightly odd — extra OTP check before approving.",
  HIGH: "Strongly suspicious — investigate before releasing money.",
  CRITICAL: "Fraud pattern confirmed — blocked immediately.",
};

export const SCORE_MEANING =
  "0 = safe, 1 = certain fraud. Under 0.30 auto-approves, 0.30–0.60 asks for OTP, 0.60–0.85 goes to an analyst, above 0.85 blocks.";

export function ruleMeaning(code: string): string {
  return RULE_MEANINGS[code] ?? "Engine flag — see evidence chain for details.";
}

export function signalMeaning(name: string): string {
  return SIGNAL_MEANINGS[name] ?? "One input the engine weighed for this score.";
}

/** One-or-two-sentence plain verdict for the why-flagged box. */
export function whyFlagged(score: {
  risk_score: number;
  risk_level: string;
  rules: string[];
}): string {
  if (!score.rules.length)
    return "Nothing looked wrong: normal amount, known device, calm pace. That's why it was approved.";
  const top = score.rules
    .slice(0, 2)
    .map((r) => ruleMeaning(r).replace(/\.$/, "").toLowerCase());
  const reason =
    top.length === 1
      ? `mainly because ${top[0]}`
      : `mainly because ${top[0]} and ${top[1]}`;
  const action =
    score.risk_level === "CRITICAL"
      ? "So the payment was blocked."
      : score.risk_level === "HIGH"
        ? "So an analyst must review it before money moves."
        : "So an extra OTP check was requested.";
  return `This was flagged ${reason}. ${action}`;
}

/** Deterministic offline copilot: mirrors backend /api/investigation/explain. */
export function offlineExplain(body: {
  transaction_amount: number;
  usual_amount: number;
  new_device: boolean;
  location_distance_km: number;
  recent_transaction_count: number;
  xgboost_score: number;
  anomaly_score: number;
  triggered_rules: string[];
  currency?: string;
  gateway?: string;
}): {
  risk_level: string;
  fraud_type: string;
  summary: string;
  evidence: string[];
  recommended_action: string;
  source: "DEMO_FALLBACK";
} {
  const usual = body.usual_amount > 0 ? body.usual_amount : 1;
  const currency = String(body.currency || "INR").toUpperCase();
  const fmt = (n: number) =>
    currency === "USD"
      ? `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `₹${Number(n || 0).toLocaleString("en-IN")}`;
  let fraud_type = "BEHAVIORAL_ANOMALY";
  if (body.transaction_amount > usual * 3 && body.new_device) fraud_type = "ACCOUNT_TAKEOVER";
  else if (body.recent_transaction_count >= 5) fraud_type = "VELOCITY_ABUSE";
  else if (body.new_device) fraud_type = "DEVICE_COMPROMISE";
  else if (body.location_distance_km > 300) fraud_type = "GEO_ANOMALY";
  const xgb = body.xgboost_score;
  const risk_level =
    xgb >= 0.7 || body.triggered_rules.length >= 2
      ? "HIGH"
      : xgb >= 0.4 || body.anomaly_score >= 0.4 || body.triggered_rules.length > 0
      ? "MEDIUM"
      : "LOW";
  const recommended_action =
    risk_level === "HIGH"
      ? "BLOCK / VOID and investigate — multiple strong signals"
      : risk_level === "MEDIUM"
      ? "STEP-UP verification (OTP / analyst check)"
      : "APPROVE — no further action";
  const gwPrefix = body.gateway ? `${body.gateway} ` : "";
  return {
    risk_level,
    fraud_type,
    summary:
      `This ${gwPrefix}transaction (${fmt(body.transaction_amount)}) was evaluated because amount deviation is ${(body.transaction_amount / usual).toFixed(1)}× vs usual (${fmt(body.usual_amount)}), ` +
      `device is ${body.new_device ? "new" : "known"}, location distance ${Math.round(body.location_distance_km)}km, ` +
      `velocity ${body.recent_transaction_count} recent, XGB ${xgb.toFixed(3)}, anomaly ${body.anomaly_score.toFixed(2)}. ` +
      `Rules: ${body.triggered_rules.length ? body.triggered_rules.join(", ") : "none"}. ` +
      `This explanation does not set the risk score — the risk engine does.`,
    evidence: [
      `Amount ${fmt(body.transaction_amount)} vs usual ${fmt(body.usual_amount)}`,
      `Device ${body.new_device ? "new" : "known"}`,
      `Velocity ${body.recent_transaction_count}`,
      `XGB ${xgb.toFixed(3)}, Anomaly ${body.anomaly_score.toFixed(2)}`,
    ],
    recommended_action,
    source: "DEMO_FALLBACK",
  };
}

/** Deterministic offline identity: mirrors backend tokenize() shape the Privacy page reads. */
export function offlineIdentity(uid: string): {
  user_id: string;
  user_token: string;
  token: string;
  phone: string;
  phone_masked: string;
  document: string;
  id_token: string;
  status: string;
  verification: string;
  method: string;
  kind: string;
} {
  let h1 = 0;
  const s = `finsheild-salt::${uid}`;
  for (let i = 0; i < s.length; i++) h1 = (h1 * 31 + s.charCodeAt(i)) >>> 0;
  const hex = h1.toString(16).padStart(8, "0");
  const tok = `${hex.slice(0, 4)}...${hex.slice(-4)}`;
  return {
    user_id: uid,
    user_token: tok,
    token: tok,
    phone: "••••••••42",
    phone_masked: "••••••••42",
    document: "TOKENIZED",
    id_token: `tok_${hex.slice(0, 4)}...`,
    status: "Verified",
    verification: "VERIFIED",
    method: "Prototype Salted SHA-256 Pseudonymization (offline simulation)",
    kind: "DEMO_SIMULATION",
  };
}

export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "Risk score", meaning: "One number 0–1 for the whole payment. Under 0.30 approves, over 0.85 blocks." },
  { term: "Risk level", meaning: "The score in words: LOW, MEDIUM, HIGH, CRITICAL. Each maps to an action." },
  { term: "XGBoost", meaning: "The main ML model — 500 decision trees trained on past fraud." },
  { term: "Isolation Forest", meaning: "Catches brand-new fraud by spotting payments unlike normal ones." },
  { term: "Behavioral profile", meaning: "Your usual spending habits; deviations raise the score." },
  { term: "Deterministic rules", meaning: "8 fixed tripwires, e.g. 5+ payments in 5 minutes." },
  { term: "Entity graph", meaning: "Map of users, devices and merchants — exposes rings sharing one device." },
  { term: "SHAP", meaning: "Math that shows exactly how much each factor pushed the score up or down." },
  { term: "Velocity", meaning: "Payment pace — how many transactions in the last minutes." },
  { term: "Mule account", meaning: "An account criminals use to quietly move stolen money." },
  { term: "Step-up", meaning: "Extra OTP/biometric check before an odd-looking payment is approved." },
  { term: "Tokenization", meaning: "Real IDs are swapped for salted hashes, so the engine never sees personal data." },
  { term: "PR-AUC / ROC-AUC", meaning: "Model grades: 0.97 ROC means near-perfect fraud separation on real data." },
  { term: "LIVE_MODEL / DEMO_FALLBACK", meaning: "Internal status indicating whether the local Python ML backend or deterministic offline fallback scored the request." },
];
