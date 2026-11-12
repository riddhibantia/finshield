"""In-memory demo store + deterministic scenario generator."""
from __future__ import annotations

import hashlib
import itertools
import json
import random
from datetime import datetime, timezone

from ..paypal import store as pp_store
from ..paypal.mapper import SCENARIOS as PP_SCENARIOS, evidence_for
from ..paypal.reasons import public_rules
from ..schemas import Transaction

_counter = itertools.count(10042)
_store: dict[str, dict] = {}


def _uid(prefix: str, n: int) -> str:
    return f"{prefix}-{n:05d}"


SCENARIOS = ("normal", "suspicious", "fraud_ring", "ambiguous")


def make_transaction(scenario: str = "normal", seed: int | None = None) -> tuple[Transaction, dict]:
    rng = random.Random(seed if seed is not None else int(next(_counter)))
    i = next(_counter)
    txn_id = f"TXN-{i}"
    if scenario == "suspicious":
        txn = Transaction(
            transaction_id=txn_id, user_id=_uid("U", rng.randint(1, 500)),
            amount=50000.0, timestamp=datetime.now(timezone.utc).isoformat(),
            merchant="High-Value Electronics", merchant_category="electronics",
            device_id="DEV-NEW-" + str(rng.randint(100, 999)), location="400km from home",
            velocity=8,
        )
        ctx = {"scenario": "suspicious", "amount_deviation": 4.2, "recent_transaction_count": 8}
    elif scenario == "fraud_ring":
        dev = "DEV-X-SHARED"
        txn = Transaction(
            transaction_id=txn_id, user_id=_uid("U", rng.randint(1, 50)),
            amount=float(rng.choice([9200, 14500, 22100])), timestamp=datetime.now(timezone.utc).isoformat(),
            merchant="Common Merchant M-7", merchant_category="retail",
            device_id=dev, location="Same city", velocity=5,
        )
        ctx = {"scenario": "fraud_ring", "amount_deviation": 2.1, "recent_transaction_count": 5,
               "shared_device_accounts": 4}
    elif scenario == "ambiguous":
        txn = Transaction(
            transaction_id=txn_id, user_id=_uid("U", rng.randint(1, 500)),
            amount=9800.0, timestamp=datetime.now(timezone.utc).isoformat(),
            merchant="Online Marketplace", merchant_category="ecommerce",
            device_id="DEV-KNOWN-" + str(rng.randint(10, 99)), location="120km away",
            velocity=4,
        )
        ctx = {"scenario": "ambiguous", "amount_deviation": 1.6, "recent_transaction_count": 4}
    else:
        txn = Transaction(
            transaction_id=txn_id, user_id=_uid("U", rng.randint(1, 2000)),
            amount=float(rng.choice([1200, 2500, 4200, 3100])), timestamp=datetime.now(timezone.utc).isoformat(),
            merchant=rng.choice(["Grocery Store", "Fuel Station", "Pharmacy", "Cafe"]),
            merchant_category="everyday", device_id="DEV-KNOWN-" + str(rng.randint(10, 99)),
            location="Home city", velocity=rng.randint(1, 2),
        )
        ctx = {"scenario": "normal", "amount_deviation": 0.3, "recent_transaction_count": txn.velocity}
    return txn, ctx


def save_scored(txn: Transaction, ctx: dict, score: dict) -> dict:
    rec = {"transaction": txn.model_dump(), "context": ctx, "score": score}
    _store[txn.transaction_id] = rec
    return rec


def get(txn_id: str) -> dict | None:
    return _store.get(txn_id)


def _fmt_currency(amount: float, currency: str = "INR") -> str:
    cur = (currency or "INR").upper()
    if cur == "USD":
        return f"${amount:,.2f} USD"
    if cur == "INR":
        return f"₹{amount:,.2f}"
    return f"{amount:,.2f} {cur}"


def paypal_intent_to_record(intent: dict, include_unscored: bool = False) -> dict | None:
    """Convert a SQLite paypal_intents row into the standard {transaction, context, score} contract."""
    if not intent:
        return None
    raw_score = intent.get("score_payload")
    score_dict: dict = {}
    if isinstance(raw_score, str) and raw_score:
        try:
            score_dict = json.loads(raw_score)
        except Exception:
            score_dict = {}
    elif isinstance(raw_score, dict):
        score_dict = dict(raw_score)

    has_score = bool(score_dict) or (intent.get("risk_score") is not None)
    if not has_score and not include_unscored:
        return None

    req_raw = intent.get("request_payload")
    req_payload: dict = {}
    if isinstance(req_raw, str) and req_raw:
        try:
            req_payload = json.loads(req_raw)
        except Exception:
            req_payload = {}
    elif isinstance(req_raw, dict):
        req_payload = req_raw

    tx_id = str(intent.get("id") or f"PP-{intent.get('paypal_order_id') or 'INTENT'}")
    scenario = str(intent.get("scenario") or "clean")
    base_sc = PP_SCENARIOS.get(scenario, PP_SCENARIOS["clean"])
    telemetry = score_dict.get("_telemetry") if isinstance(score_dict.get("_telemetry"), dict) else {}
    buyer = telemetry.get("buyer") if isinstance(telemetry.get("buyer"), dict) else {}

    amt = float(intent.get("amount") or base_sc.get("amount") or 0.0)
    currency = str(intent.get("currency") or "USD").upper()
    dev_id = str(
        telemetry.get("device_id")
        or req_payload.get("device_id")
        or ("DEV-NEW-PAYPAL" if base_sc.get("is_new_device") else "DEV-KNOWN-PAYPAL")
    )
    is_new = bool(base_sc.get("is_new_device") or "NEW" in dev_id.upper())
    is_shared = bool(base_sc.get("is_shared_device") or "SHARED" in dev_id.upper())
    location = str(
        telemetry.get("location")
        or ("400km from home" if float(base_sc.get("distance_km", 0) or 0) >= 300 else "Verified PayPal Region")
    )
    velocity = int(telemetry.get("velocity") or base_sc.get("recent_transaction_count") or 1)
    user_id = str(
        buyer.get("email")
        or buyer.get("payer_id")
        or req_payload.get("email")
        or req_payload.get("user_id")
        or f"PAYPAL-{str(intent.get('paypal_order_id') or tx_id)[-6:]}"
    )

    risk_score = float(
        score_dict.get("risk_score")
        if score_dict.get("risk_score") is not None
        else (intent.get("risk_score") or 0.05)
    )
    risk_level = str(
        score_dict.get("risk_level")
        or intent.get("risk_level")
        or ("CRITICAL" if risk_score >= 0.8 else "HIGH" if risk_score >= 0.6 else "MEDIUM" if risk_score >= 0.3 else "LOW")
    )
    sanitized_rules = public_rules(list(score_dict.get("rules") or []))
    sanitized_evidence = evidence_for(score_dict, amt, currency) if score_dict else [
        f"PayPal order {intent.get('paypal_order_id')} status: {intent.get('status') or 'ORDER_CREATED'}"
    ]
    # Avoid duplicating FX note if score_dict already has sanitized evidence from an earlier read
    if score_dict and any("normalised at demo rate" in str(x) for x in (score_dict.get("evidence") or [])):
        sanitized_evidence = sanitized_evidence[:-1]

    signals = list(score_dict.get("signals") or [
        {"name": "amount_deviation", "value": float(base_sc.get("amount_deviation", 0.3)), "contribution": round(min(0.35, risk_score * 0.35), 3)},
        {"name": "velocity", "value": float(velocity), "contribution": 0.24 if velocity >= 5 else 0.03},
    ])

    raw_payload = {
        "gateway": "PayPal",
        "intent_id": tx_id,
        "paypal_order_id": intent.get("paypal_order_id"),
        "authorization_id": intent.get("authorization_id"),
        "capture_id": intent.get("capture_id"),
        "status": intent.get("status"),
        "decision": intent.get("decision"),
        "scenario": scenario,
        "amount": intent.get("amount"),
        "currency": currency,
        "buyer": buyer,
        "device_id": dev_id,
    }

    sim_scenario = "fraud_ring" if is_shared else ("suspicious" if scenario in ("review", "stolen_account") else "normal")

    return {
        "transaction": {
            "transaction_id": tx_id,
            "user_id": user_id,
            "amount": amt,
            "currency": currency,
            "timestamp": str(intent.get("updated_at") or intent.get("created_at") or ""),
            "merchant": "FinShield Digital Goods",
            "merchant_category": str(telemetry.get("merchant_category") or base_sc.get("merchant_category") or "digital_gateway"),
            "device_id": dev_id,
            "location": location,
            "velocity": velocity,
            "channel": "PAYPAL",
            "gateway": "PayPal",
            "raw_payload": raw_payload,
        },
        "context": {
            "scenario": sim_scenario,
            "paypal_scenario": scenario,
            "gateway": "PayPal",
            "paypal_order_id": intent.get("paypal_order_id"),
            "authorization_id": intent.get("authorization_id"),
            "capture_id": intent.get("capture_id"),
            "status": intent.get("status"),
            "decision": intent.get("decision"),
            "is_new_device": is_new,
            "is_shared_device": is_shared,
            "shared_device_accounts": 4 if is_shared else 1,
            "buyer": buyer,
            "usual_amount": round(3800.0 / 83.5, 2) if currency == "USD" else 3800.0,
        },
        "score": {
            "transaction_id": tx_id,
            "risk_score": round(risk_score, 3),
            "risk_level": risk_level,
            "signals": signals,
            "rules": sanitized_rules,
            "behavioral_score": float(score_dict.get("behavioral_score") or 0.1),
            "anomaly_score": float(score_dict.get("anomaly_score") or 0.1),
            "xgb_score": score_dict.get("xgb_score"),
            "graph_score": score_dict.get("graph_score"),
            "evidence": sanitized_evidence,
            "source": str(score_dict.get("source") or "DEMO_FALLBACK"),
        },
    }


def get_any(txn_id: str) -> dict | None:
    rec = _store.get(txn_id)
    if rec:
        return rec
    intent = pp_store.get_intent(txn_id) or pp_store.get_intent_by_order(txn_id)
    if not intent and txn_id.startswith("PP-"):
        intent = pp_store.get_intent_by_order(txn_id[3:])
    if intent:
        return paypal_intent_to_record(intent, include_unscored=True)
    return None


def list_all(limit: int = 50) -> list[dict]:
    return list(reversed(list(_store.values())))[:limit]


def list_combined(limit: int = 50) -> list[dict]:
    seen: set[str] = set()
    rows: list[dict] = []
    for intent in pp_store.list_intents(limit):
        rec = paypal_intent_to_record(intent, include_unscored=False)
        if rec:
            tid = str(rec["transaction"]["transaction_id"])
            if tid not in seen:
                seen.add(tid)
                rows.append(rec)
    for rec in list_all(limit):
        tid = str((rec.get("transaction") or {}).get("transaction_id") or "")
        if tid and tid not in seen:
            seen.add(tid)
            rows.append(rec)
    rows.sort(key=lambda r: str((r.get("transaction") or {}).get("timestamp") or ""), reverse=True)
    return rows[:limit]


def reset() -> None:
    _store.clear()


def tokenize(user_id: str) -> dict:
    h = hashlib.sha256(("finsheild-salt::" + user_id).encode()).hexdigest()
    short_tok = f"{h[:4]}...{h[-4:]}"
    return {
        "user_id": user_id,
        "user_token": short_tok,
        "token": short_tok,
        "phone": "••••••••42",
        "phone_masked": "••••••••42",
        "document": "TOKENIZED",
        "id_token": f"tok_{h[:6]}...",
        "status": "Verified",
        "verification": "VERIFIED",
        "method": "Prototype identity tokenization (salted SHA-256, NOT a zero-knowledge proof)",
        "kind": "DEMO_SIMULATION",
    }


def graph_for(txn_id: str) -> dict:
    rec = get_any(txn_id)
    ctx = (rec or {}).get("context", {})
    txn = (rec or {}).get("transaction", {})
    score = (rec or {}).get("score", {})
    scenario = ctx.get("scenario", "normal")

    u = str(txn.get("user_id") or "USER-EXAMPLE")
    dev_id = str(txn.get("device_id") or "DEV-01")
    merch = str(txn.get("merchant") or "Cashfree Payment Rail")
    merch_cat = str(txn.get("merchant_category") or "digital_gateway")
    amt = float(txn.get("amount") or 100.0)
    currency = str(txn.get("currency") or "INR").upper()
    channel = str(txn.get("channel") or "UPI")
    gateway = str(txn.get("gateway") or "Cashfree")
    is_paypal = gateway == "PayPal" or channel == "PAYPAL" or str(txn_id).startswith("PP-")
    amt_str = _fmt_currency(amt, currency)
    risk_level = str(score.get("risk_level") or ("CRITICAL" if amt >= 100000 else "LOW"))
    risk_score = float(score.get("risk_score") or (0.89 if amt >= 100000 else 0.035))
    is_new = bool(ctx.get("is_new_device") or ("NEW" in dev_id) or ("CF" in dev_id))
    is_shared = bool(ctx.get("is_shared_device") or ("SHARED" in dev_id) or ("DEV-X" in dev_id) or scenario == "fraud_ring")
    velocity = int(txn.get("velocity") or 1)

    if is_paypal:
        buyer = ctx.get("buyer") or {}
        pp_status = str(ctx.get("status") or "AUTHORIZED")
        pp_decision = str(ctx.get("decision") or "HOLD_FOR_REVIEW")
        order_id = str(ctx.get("paypal_order_id") or str(txn_id).replace("PP-", ""))
        auth_id = str(ctx.get("authorization_id") or "PENDING")
        cap_id = str(ctx.get("capture_id") or "")
        rules = list(score.get("rules") or [])
        if is_shared or is_new or risk_score >= 0.6:
            nodes = [
                {
                    "id": f"user:{u}",
                    "label": u,
                    "type": "user",
                    "role": "PayPal Buyer Account",
                    "risk": "SUSPICIOUS" if risk_score >= 0.6 else "SAFE",
                    "details": {
                        "buyer_handle": u,
                        "payer_id": buyer.get("payer_id") or "SANDBOX_BUYER",
                        "country": buyer.get("country") or "US",
                        "profile_baseline": "$45.51 USD typical order",
                    },
                },
                {
                    "id": f"dev:{dev_id}",
                    "label": dev_id,
                    "type": "device",
                    "role": "Shared Cluster Hardware" if is_shared else "Unrecognized Device",
                    "risk": "CRITICAL",
                    "details": {
                        "device_id": dev_id,
                        "linked_accounts": 4 if is_shared else 1,
                        "burst_velocity": f"{velocity} attempts / 5m",
                        "status": "SHARED_CLUSTER" if is_shared else "NEW_FINGERPRINT",
                    },
                },
                {
                    "id": "dev:BASELINE-PAYPAL",
                    "label": "DEV-KNOWN-PAYPAL",
                    "type": "device",
                    "role": "Prior Trusted Device",
                    "risk": "SAFE",
                    "details": {
                        "device_id": "DEV-KNOWN-PAYPAL",
                        "status": "DORMANT (Bypassed on this order)",
                    },
                },
                {
                    "id": txn_id,
                    "label": amt_str,
                    "type": "transaction",
                    "role": f"PayPal Hold ({risk_level})",
                    "risk": risk_level,
                    "details": {
                        "intent_id": txn_id,
                        "paypal_order_id": order_id,
                        "authorization_id": auth_id,
                        "amount": amt_str,
                        "risk_score": risk_score,
                        "decision": pp_decision,
                        "fulfilment_status": pp_status,
                        "rules": rules or ["HIGH_RISK_PATTERN"],
                    },
                },
                {
                    "id": "gw:PayPal",
                    "label": "PayPal Orders v2 Switch",
                    "type": "gateway",
                    "role": "Authorization Hold Rail",
                    "risk": "INFO",
                    "details": {
                        "gateway": "PayPal",
                        "protocol": "Orders v2 (AUTHORIZE)",
                        "paypal_order_id": order_id,
                        "authorization_status": pp_status,
                    },
                },
                {
                    "id": f"merch:{merch[:14]}",
                    "label": merch,
                    "type": "merchant",
                    "role": "Digital Storefront",
                    "risk": "SAFE",
                    "details": {
                        "merchant_name": merch,
                        "category": merch_cat,
                        "digital_delivery": "Voided / Held before delivery" if pp_status != "CAPTURED" else "Delivered after capture",
                    },
                },
            ]
            if is_shared:
                nodes.append({
                    "id": "acct:CLUSTER-2",
                    "label": "LINKED-ACCT-02",
                    "type": "account",
                    "role": "Shared Device Peer",
                    "risk": "CRITICAL",
                    "details": {
                        "device_overlap": dev_id,
                        "linked_order_volume": "$14,200.00 USD / 24h",
                        "status": "WATCHLIST",
                    },
                })
            edges = [
                {"from": f"user:{u}", "to": txn_id, "label": "AUTHORIZES_HOLD", "is_suspicious": False},
                {"from": f"user:{u}", "to": "dev:BASELINE-PAYPAL", "label": "USUAL_DEVICE", "is_suspicious": False},
                {"from": f"dev:{dev_id}", "to": txn_id, "label": "SHARED_HARDWARE" if is_shared else "NEW_DEVICE_SESSION", "is_suspicious": True},
                {"from": f"dev:{dev_id}", "to": "dev:BASELINE-PAYPAL", "label": "DEVICE_MISMATCH", "is_suspicious": True},
                {"from": txn_id, "to": "gw:PayPal", "label": "HELD_AT_PAYPAL", "is_suspicious": False},
                {"from": "gw:PayPal", "to": f"merch:{merch[:14]}", "label": f"GATE_{pp_decision}", "is_suspicious": pp_status == "VOIDED"},
            ]
            if is_shared:
                edges.append({"from": "acct:CLUSTER-2", "to": f"dev:{dev_id}", "label": "CO_SHARED_DEVICE", "is_suspicious": True})
            return {
                "nodes": nodes,
                "edges": edges,
                "kind": "DEMO_SIMULATION",
                "note": f"PayPal Fulfilment Topology: {pp_decision} gated order {order_id} ({amt_str}) before digital delivery.",
                "summary": {
                    "topology_type": "PayPal Shared-Device Cluster" if is_shared else "PayPal New-Device Hold",
                    "connected_entities": len(nodes),
                    "anomalous_edges": sum(1 for e in edges if e["is_suspicious"]),
                    "shared_clique_detected": is_shared,
                },
            }

        return {
            "nodes": [
                {
                    "id": f"user:{u}",
                    "label": u,
                    "type": "user",
                    "role": "Verified PayPal Buyer",
                    "risk": "SAFE" if risk_score < 0.3 else "SUSPICIOUS",
                    "details": {
                        "buyer_handle": u,
                        "payer_id": buyer.get("payer_id") or "SANDBOX_BUYER",
                        "country": buyer.get("country") or "US",
                        "status": "VERIFIED",
                    },
                },
                {
                    "id": f"dev:{dev_id}",
                    "label": dev_id,
                    "type": "device",
                    "role": "Paired Buyer Device",
                    "risk": "SAFE",
                    "details": {"device_id": dev_id, "trust_score": 0.96},
                },
                {
                    "id": txn_id,
                    "label": amt_str,
                    "type": "transaction",
                    "role": f"PayPal Authorization ({pp_status})",
                    "risk": risk_level,
                    "details": {
                        "intent_id": txn_id,
                        "paypal_order_id": order_id,
                        "authorization_id": auth_id,
                        "capture_id": cap_id or "—",
                        "amount": amt_str,
                        "risk_score": risk_score,
                        "decision": pp_decision,
                    },
                },
                {
                    "id": "gw:PayPal",
                    "label": "PayPal Orders v2 Switch",
                    "type": "gateway",
                    "role": "Authorization & Capture Rail",
                    "risk": "INFO",
                    "details": {"gateway": "PayPal", "protocol": "PayPal REST Orders v2", "status": pp_status},
                },
                {
                    "id": f"merch:{merch[:14]}",
                    "label": merch,
                    "type": "merchant",
                    "role": "Digital Storefront",
                    "risk": "SAFE",
                    "details": {"merchant_name": merch, "category": merch_cat, "fulfilment": pp_status},
                },
            ],
            "edges": [
                {"from": f"user:{u}", "to": f"dev:{dev_id}", "label": "PAIRED_DEVICE", "is_suspicious": False},
                {"from": f"user:{u}", "to": txn_id, "label": "AUTHORIZES_HOLD", "is_suspicious": False},
                {"from": f"dev:{dev_id}", "to": txn_id, "label": "SIGNED_SESSION", "is_suspicious": False},
                {"from": txn_id, "to": "gw:PayPal", "label": "ROUTES_VIA", "is_suspicious": False},
                {"from": "gw:PayPal", "to": f"merch:{merch[:14]}", "label": f"GATE_{pp_decision}", "is_suspicious": False},
            ],
            "kind": "DEMO_SIMULATION",
            "note": f"PayPal Checkout Path: order {order_id} scored {risk_score:.3f} ({risk_level}) -> {pp_status}.",
            "summary": {
                "topology_type": "PayPal Verified Checkout",
                "connected_entities": 5,
                "anomalous_edges": 0,
                "shared_clique_detected": False,
            },
        }

    if scenario == "fraud_ring":
        return {
            "nodes": [
                {
                    "id": "acct:A",
                    "label": "ACC-MULE-8901",
                    "type": "account",
                    "role": "Recruiter Mule Account",
                    "risk": "CRITICAL",
                    "details": {
                        "bank": "ICICI Bank Ltd",
                        "mule_probability": "94.2%",
                        "inflow_velocity": "₹4,20,000 / 24h",
                        "status": "FREEZE_PENDING"
                    }
                },
                {
                    "id": "acct:B",
                    "label": "ACC-MULE-8902",
                    "type": "account",
                    "role": "Layering Mule Account",
                    "risk": "CRITICAL",
                    "details": {
                        "bank": "Axis Bank Ltd",
                        "mule_probability": "91.8%",
                        "inflow_velocity": "₹3,80,000 / 24h",
                        "status": "FREEZE_PENDING"
                    }
                },
                {
                    "id": "acct:C",
                    "label": "ACC-MULE-8903",
                    "type": "account",
                    "role": "Smurfing Node",
                    "risk": "HIGH",
                    "details": {
                        "bank": "Yes Bank Ltd",
                        "mule_probability": "86.5%",
                        "inflow_velocity": "₹2,50,000 / 24h",
                        "status": "WATCHLIST"
                    }
                },
                {
                    "id": "dev:X",
                    "label": dev_id if "EMU" in dev_id else "DEV-SHARED-EMU-99",
                    "type": "device",
                    "role": "Shared Rooted Hardware",
                    "risk": "CRITICAL",
                    "details": {
                        "fingerprint": "SHA256:7f9a8b12...c09d",
                        "os_environment": "Android 14 (Rooted Emulator)",
                        "linked_accounts": 3,
                        "ip_subnet": "103.21.244.0/24 (VPN Exit Node)"
                    }
                },
                {
                    "id": txn_id,
                    "label": f"₹{amt:,.2f}" if amt else txn_id,
                    "type": "transaction",
                    "role": "Laundering Payout Attempt",
                    "risk": "CRITICAL",
                    "details": {
                        "transaction_id": txn_id,
                        "amount": f"₹{amt:,.2f}",
                        "risk_score": risk_score,
                        "decision": "BLOCK",
                        "timestamp": txn.get("timestamp", "Just now")
                    }
                },
                {
                    "id": f"gw:{gateway}",
                    "label": f"{gateway} Switch",
                    "type": "gateway",
                    "role": "High-Throughput Rail",
                    "risk": "INFO",
                    "details": {
                        "gateway": gateway,
                        "rail": channel,
                        "routing": "NPCI IMPS Fast-Rail",
                        "latency": "16ms"
                    }
                },
                {
                    "id": "merch:M-7",
                    "label": merch if merch != "Cashfree Payment Rail" else "Offshore P2P Liquidity Escrow",
                    "type": "merchant",
                    "role": "Cashout Destination",
                    "risk": "HIGH",
                    "details": {
                        "merchant_name": merch,
                        "category": "P2P Crypto / Offshore Escrow",
                        "settlement": "Instant Automated Payout",
                        "flag": "HIGH_RISK_MCC"
                    }
                },
            ],
            "edges": [
                {"from": "acct:A", "to": "dev:X", "label": "SHARED_HARDWARE", "is_suspicious": True},
                {"from": "acct:B", "to": "dev:X", "label": "SHARED_HARDWARE", "is_suspicious": True},
                {"from": "acct:C", "to": "dev:X", "label": "SHARED_HARDWARE", "is_suspicious": True},
                {"from": "acct:A", "to": txn_id, "label": "FUNDS_DEBIT", "is_suspicious": False},
                {"from": "dev:X", "to": txn_id, "label": "EMULATED_SIGNATURE", "is_suspicious": True},
                {"from": txn_id, "to": f"gw:{gateway}", "label": "ROUTES_VIA", "is_suspicious": False},
                {"from": f"gw:{gateway}", "to": "merch:M-7", "label": "CASHOUT_SETTLE", "is_suspicious": True},
            ],
            "kind": "DEMO_SIMULATION",
            "note": "Syndicate Topology: 3 mule accounts coordinated from a single emulated device (DEV-SHARED-EMU-99).",
            "summary": {
                "topology_type": "Mule Syndicate Cluster",
                "connected_entities": 7,
                "anomalous_edges": 5,
                "shared_clique_detected": True
            }
        }

    # Suspicious / High-Value / Cashfree Anomaly
    if scenario == "suspicious" or amt >= 25000 or is_new or risk_score >= 0.5:
        return {
            "nodes": [
                {
                    "id": f"user:{u}",
                    "label": u,
                    "type": "user",
                    "role": "Primary Account Holder",
                    "risk": "SUSPICIOUS",
                    "details": {
                        "user_id": u,
                        "phone": "+91 98765 43210" if "8926" in u else "••••••••42",
                        "kyc_status": "Tier 2 Verified",
                        "profile_baseline": "₹3,800 typical avg txn"
                    }
                },
                {
                    "id": f"acct:{u}",
                    "label": f"{u}@bank" if "UPI" in channel else f"A/C ••{u[-4:] if len(u)>=4 else '01'}",
                    "type": "account",
                    "role": "Funding Bank Account",
                    "risk": "SAFE",
                    "details": {
                        "bank": "HDFC Bank Ltd",
                        "vpa": f"{u.lower()}@hdfcbank",
                        "available_balance": "₹1,45,200.00",
                        "status": "ACTIVE"
                    }
                },
                {
                    "id": "dev:LEGIT-PIXEL",
                    "label": "DEV-PIXEL-BASE",
                    "type": "device",
                    "role": "Authorized Baseline Device",
                    "risk": "SAFE",
                    "details": {
                        "hardware": "Google Pixel 8 (Android 14)",
                        "pairing_age": "180 days registered",
                        "trust_score": 0.98,
                        "status": "DORMANT (Not used for this txn)"
                    }
                },
                {
                    "id": f"dev:{dev_id}",
                    "label": dev_id,
                    "type": "device",
                    "role": "Rogue Ingress Device",
                    "risk": "CRITICAL",
                    "details": {
                        "device_id": dev_id,
                        "first_seen": "12 minutes ago",
                        "burst_velocity": f"{velocity} transactions / 5min",
                        "trust_score": 0.12,
                        "status": "UNRECOGNIZED_FINGERPRINT"
                    }
                },
                {
                    "id": txn_id,
                    "label": f"₹{amt:,.2f}" if amt else txn_id,
                    "type": "transaction",
                    "role": f"Ingress Attempt ({risk_level})",
                    "risk": risk_level,
                    "details": {
                        "transaction_id": txn_id,
                        "amount": f"₹{amt:,.2f}",
                        "risk_score": risk_score,
                        "rules": list(score.get("rules") or ["BURST_VELOCITY", "NEW_DEVICE_HIGH_VALUE"]),
                        "decision": "BLOCK" if risk_score > 0.7 else "STEP_UP"
                    }
                },
                {
                    "id": f"gw:{gateway}",
                    "label": f"{gateway} Gateway Switch",
                    "type": "gateway",
                    "role": "Ingress Payment Switch",
                    "risk": "INFO",
                    "details": {
                        "gateway": gateway,
                        "order_id": ctx.get("order_id", "CFPay_EXAMPLE"),
                        "cf_payment_id": ctx.get("cf_payment_id", txn_id.replace("CF-", "")),
                        "payment_status": "SUCCESS_ROUTED"
                    }
                },
                {
                    "id": f"merch:{merch[:14]}",
                    "label": merch,
                    "type": "merchant",
                    "role": "Settlement Beneficiary",
                    "risk": "LOW",
                    "details": {
                        "merchant_name": merch,
                        "category": merch_cat,
                        "settlement": "T+1 Escrow Account",
                        "verification": "Merchant KYC Passed"
                    }
                },
            ],
            "edges": [
                {"from": f"user:{u}", "to": f"acct:{u}", "label": "OWNS_ACCOUNT", "is_suspicious": False},
                {"from": f"user:{u}", "to": "dev:LEGIT-PIXEL", "label": "PAIRED_BASELINE", "is_suspicious": False},
                {"from": f"acct:{u}", "to": txn_id, "label": "DEBIT_REQUEST", "is_suspicious": False},
                {"from": f"dev:{dev_id}", "to": txn_id, "label": "ROGUE_SIGNATURE", "is_suspicious": True},
                {"from": f"dev:{dev_id}", "to": "dev:LEGIT-PIXEL", "label": "HARDWARE_MISMATCH", "is_suspicious": True},
                {"from": txn_id, "to": f"gw:{gateway}", "label": "ROUTED_VIA", "is_suspicious": False},
                {"from": f"gw:{gateway}", "to": f"merch:{merch[:14]}", "label": "SETTLES_ESCROW", "is_suspicious": False},
            ],
            "kind": "DEMO_SIMULATION",
            "note": f"Ingress Anomaly: Transaction originated from unrecognized hardware ({dev_id}) bypassing authorized baseline device.",
            "summary": {
                "topology_type": "Account Takeover / New Hardware Ingress",
                "connected_entities": 7,
                "anomalous_edges": 2,
                "shared_clique_detected": False
            }
        }

    # Normal / Safe Baseline
    return {
        "nodes": [
            {
                "id": f"user:{u}",
                "label": u,
                "type": "user",
                "role": "Verified Account Holder",
                "risk": "SAFE",
                "details": {
                    "user_id": u,
                    "kyc_status": "Tier 1 Full KYC",
                    "account_age": "24 months",
                    "trust_score": 0.99
                }
            },
            {
                "id": f"acct:{u}",
                "label": f"{u}@sbi" if "UPI" in channel else f"A/C ••{u[-4:] if len(u)>=4 else '01'}",
                "type": "account",
                "role": "Primary Linked Account",
                "risk": "SAFE",
                "details": {
                    "bank": "State Bank of India",
                    "vpa": f"{u.lower()}@sbi",
                    "status": "NORMAL"
                }
            },
            {
                "id": f"dev:{dev_id}",
                "label": dev_id,
                "type": "device",
                "role": "Paired Mobile Hardware",
                "risk": "SAFE",
                "details": {
                    "hardware": "Samsung Galaxy S24 (Android 14)",
                    "first_registered": "120 days ago",
                    "trust_score": 0.97
                }
            },
            {
                "id": txn_id,
                "label": f"₹{amt:,.2f}" if amt else txn_id,
                "type": "transaction",
                "role": "Payment Ingress",
                "risk": "LOW",
                "details": {
                    "transaction_id": txn_id,
                    "amount": f"₹{amt:,.2f}",
                    "risk_score": risk_score,
                    "decision": "APPROVE"
                }
            },
            {
                "id": f"gw:{gateway}",
                "label": f"{gateway} Switch",
                "type": "gateway",
                "role": "Ingress Payment Switch",
                "risk": "INFO",
                "details": {
                    "gateway": gateway,
                    "channel": channel,
                    "protocol": "Real-time UPI"
                }
            },
            {
                "id": f"merch:{merch[:14]}",
                "label": merch,
                "type": "merchant",
                "role": "Verified Merchant Partner",
                "risk": "SAFE",
                "details": {
                    "merchant_name": merch,
                    "category": merch_cat,
                    "settlement": "Instant UPI Credit"
                }
            },
        ],
        "edges": [
            {"from": f"user:{u}", "to": f"acct:{u}", "label": "OWNS_ACCOUNT", "is_suspicious": False},
            {"from": f"user:{u}", "to": f"dev:{dev_id}", "label": "PAIRED_DEVICE", "is_suspicious": False},
            {"from": f"acct:{u}", "to": txn_id, "label": "DEBIT_ORDER", "is_suspicious": False},
            {"from": f"dev:{dev_id}", "to": txn_id, "label": "SIGNS_PAYLOAD", "is_suspicious": False},
            {"from": txn_id, "to": f"gw:{gateway}", "label": "ROUTES_VIA", "is_suspicious": False},
            {"from": f"gw:{gateway}", "to": f"merch:{merch[:14]}", "label": "SETTLES_CREDIT", "is_suspicious": False},
        ],
        "kind": "DEMO_SIMULATION",
        "note": "Clean Topology: End-to-end verified path matching customer historical baseline and hardware fingerprint.",
        "summary": {
            "topology_type": "Verified Direct Ingress",
            "connected_entities": 6,
            "anomalous_edges": 0,
            "shared_clique_detected": False
        }
    }

