"""PayPal mapper — turns PayPal order/authorization state into the existing
Transaction + ctx contract the risk adapters already understand, and maps the
fused risk level onto the fulfilment decision policy.

The buyer always completes checkout (intent AUTHORIZE). Scoring happens AFTER
authorization: PayPal locks the funds, FinShield decides capture / hold / void
before any digital good is delivered.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from backend.currency import DEMO_FX_RATE_NOTE, engine_amount
from backend.paypal.reasons import sanitize_evidence

# Fulfilment decisions (the demo's money shot is AUTO_VOID: "voided before delivery")
DECISION_AUTO_CAPTURE = "AUTO_CAPTURE"
DECISION_HOLD_STEP_UP = "HOLD_STEP_UP"
DECISION_HOLD_FOR_REVIEW = "HOLD_FOR_REVIEW"
DECISION_AUTO_VOID = "AUTO_VOID"

# Risk-level -> fulfilment decision (levels come from the adapters: LOW/MEDIUM/HIGH/CRITICAL)
DECISION_POLICY: dict[str, str] = {
    "LOW": DECISION_AUTO_CAPTURE,
    "MEDIUM": DECISION_HOLD_STEP_UP,
    "HIGH": DECISION_HOLD_FOR_REVIEW,
    "CRITICAL": DECISION_AUTO_VOID,
}

# Demo scenarios — each maps onto the ctx contract the adapters already drive.
# amount_deviation / recent_transaction_count / is_new_device are the knobs the
# existing engine consumes; they are currency-free by design.
SCENARIOS: dict[str, dict[str, Any]] = {
    "clean": {
        "label": "Clean returning buyer",
        "amount": "42.00",
        "currency": "USD",
        "merchant_category": "everyday",
        "amount_deviation": 0.3,
        "recent_transaction_count": 1,
        "is_new_device": False,
        "is_shared_device": False,
        "distance_km": 0.0,
    },
    "friendly_fraud": {
        "label": "Friendly-fraudster (keeps the download, disputes later)",
        "amount": "220.00",
        "currency": "USD",
        "merchant_category": "digital_gateway",
        "amount_deviation": 4.8,
        "recent_transaction_count": 4,
        "is_new_device": False,
        "is_shared_device": False,
        "distance_km": 0.0,
    },
    "review": {
        "label": "Suspicious pattern — analyst review",
        "amount": "180.00",
        "currency": "USD",
        "merchant_category": "digital_gateway",
        "amount_deviation": 4.2,
        "recent_transaction_count": 5,
        "is_new_device": True,
        "is_shared_device": False,
        "distance_km": 0.0,
    },
    "stolen_account": {
        "label": "Stolen account, high value",
        "amount": "4800.00",
        "currency": "USD",
        "merchant_category": "electronics",
        "amount_deviation": 12.0,
        "recent_transaction_count": 8,
        "is_new_device": True,
        "is_shared_device": True,
        "distance_km": 400.0,
    },
}


@dataclass
class FulfilmentContext:
    scenario: str
    amount: str
    currency: str
    device_id: str
    user_id: str
    email_hash: str
    payer_country: str
    custom_id: str


def build_ctx(fc: FulfilmentContext) -> dict[str, Any]:
    """ctx for the risk adapters, enriched with PayPal telemetry."""
    base = SCENARIOS.get(fc.scenario, SCENARIOS["clean"])
    return {
        "scenario": "suspicious" if fc.scenario == "stolen_account" else "normal",
        "amount_deviation": base["amount_deviation"],
        "recent_transaction_count": base["recent_transaction_count"],
        "is_new_device": base["is_new_device"],
        "is_shared_device": base["is_shared_device"],
        "distance_km": base["distance_km"],
        "usual_amount": 3800.0,  # engine baseline (INR-equivalent scale)
        "gateway": "PayPal",
        "paypal_order_id": fc.custom_id or None,
        "email_hash": fc.email_hash,
        "payer_country": fc.payer_country,
        "fx_note": DEMO_FX_RATE_NOTE,
    }


def decide(risk_level: str) -> str:
    """Risk level -> fulfilment decision. Evaluated AFTER authorization."""
    return DECISION_POLICY.get(risk_level, DECISION_HOLD_FOR_REVIEW)


def authorization_id(authorize_response: dict[str, Any]) -> str | None:
    try:
        return authorize_response["purchase_units"][0]["payments"]["authorizations"][0]["id"]
    except (KeyError, IndexError, TypeError):
        return None


def capture_id(capture_response: dict[str, Any]) -> str | None:
    cid = capture_response.get("id")
    return str(cid) if cid else None


def payer_from_authorize(authorize_response: dict[str, Any]) -> dict[str, str]:
    payer = authorize_response.get("payer") or {}
    name = payer.get("name", {})
    email = payer.get("email_address", "")
    return {
        "payer_id": payer.get("payer_id", ""),
        "email": email,
        "name": " ".join(x for x in [name.get("given_name", ""), name.get("surname", "")] if x),
        "country": payer.get("address", {}).get("country_code", ""),
    }


def evidence_for(score_dict: dict[str, Any], amount: float, currency: str) -> list[str]:
    """Public, sanitized evidence: rule names masked, rail names scrubbed."""
    out = list(score_dict.get("evidence") or [])
    out = sanitize_evidence(out, amount, currency)
    out.append(DEMO_FX_RATE_NOTE)
    return out


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
