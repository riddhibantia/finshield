"""MockMLAdapter — deterministic demo scorer.

Produces ScoreResults in the exact GUI contract WITHOUT touching the real
ML pipeline. Used until Agent 3 swaps in RealMLAdapter.
All outputs are labelled source=DEMO_FALLBACK by the API layer.
"""
from __future__ import annotations

import hashlib
import math

from ..currency import DEFAULT_FX_FALLBACK, FX_TO_INR, engine_amount, format_amount
from ..schemas import ScoreResult, Signal, Transaction


def _stable_unit(key: str) -> float:
    h = hashlib.sha256(key.encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def risk_level_for(score: float) -> str:
    if score >= 0.8:
        return "CRITICAL"
    if score >= 0.6:
        return "HIGH"
    if score >= 0.3:
        return "MEDIUM"
    return "LOW"


class MockMLAdapter:
    name = "mock"

    def score(self, txn: Transaction, ctx: dict | None = None) -> ScoreResult:
        ctx = ctx or {}
        scenario = ctx.get("scenario", "normal")

        amt = float(getattr(txn, "amount", 0) or 0)
        currency = str(getattr(txn, "currency", "INR") or "INR").upper()
        fx_rate = FX_TO_INR.get(currency, DEFAULT_FX_FALLBACK)
        amt_engine = engine_amount(amt, currency)  # rule thresholds are INR-scale
        usual_amt = float(getattr(txn, "usual_amount", 0) or ctx.get("usual_amount", 3800.0) or 3800.0)
        usual_display = usual_amt if currency == "INR" else usual_amt / fx_rate
        amt_dev = float(ctx.get("amount_deviation", amt_engine / usual_amt if usual_amt > 0 else 1.0))
        vel = float(txn.velocity or ctx.get("recent_transaction_count", 1) or 1)
        dev = str(getattr(txn, "device_id", "")).upper()
        is_new_device = bool("NEW" in dev or getattr(txn, "is_new_device", False) or ctx.get("is_new_device", False) or scenario in ("suspicious", "fraud_ring"))
        is_shared = bool("SHARED" in dev or "DEV-X" in dev or getattr(txn, "is_shared_device", False) or ctx.get("is_shared_device", False) or int(ctx.get("shared_device_accounts", 0) or 0) >= 2 or scenario == "fraud_ring")
        loc = str(getattr(txn, "location", "")).lower()
        dist_km = float(getattr(txn, "distance_km", 0) or ctx.get("distance_km", 0) or (400.0 if "400" in loc else (120.0 if "120" in loc else (0.0 if ("home" in loc or "same" in loc) else 5.0))))
        channel = str(getattr(txn, "channel", "UPI") or "UPI").upper()
        gateway = str(getattr(txn, "gateway", "") or "")
        is_upi_inr = currency == "INR" and gateway != "PayPal" and channel != "PAYPAL"

        rules: list[str] = []
        evidence: list[str] = []

        if vel >= 8:
            rules.append("BURST_VELOCITY")
            evidence.append(f"Velocity burst: {int(vel)} recent transactions in 5m")
        elif vel >= 5:
            rules.append("HIGH_VELOCITY")
            evidence.append(f"High velocity: {int(vel)} transactions in last 5m")

        if is_shared or scenario == "fraud_ring":
            rules.append("SHARED_DEVICE_MULTI_ACCOUNT")
            evidence.append(f"Device fingerprint ({txn.device_id}) linked to multiple distinct accounts")
        elif is_new_device and amt_engine > 500:
            rules.append("NEW_DEVICE_HIGH_VALUE")
            evidence.append(f"High-value payment ({format_amount(amt, currency)}) on newly registered device")
        elif is_new_device:
            rules.append("NEW_DEVICE")
            evidence.append(f"New unrecognized device ({txn.device_id})")

        if amt_dev >= 3.0 or amt_engine >= 3.0 * usual_amt:
            rules.append("UNUSUAL_AMOUNT")
            evidence.append(f"Amount deviation: {format_amount(amt, currency)} is {amt_dev:.1f}× usual baseline ({format_amount(usual_display, currency)})")

        if dist_km >= 300 or "foreign" in loc:
            rules.append("UNUSUAL_LOCATION")
            evidence.append(f"Geographic jump: location is ~{int(dist_km or 400)}km from home")

        if amt_engine >= 100000:
            if is_upi_inr:
                rules.append("UPI_HIGH_VALUE_ANOMALY")
                rules.append("EXCEEDS_SINGLE_TRANSACTION_LIMIT")
            else:
                rules.append("HIGH_VALUE_SPIKE")
                rules.append("AMOUNT_LIMIT_EXCEEDED")
            evidence.append(f"High-Value Anomaly: {format_amount(amt, currency)} exceeds standard single-transaction threshold")

        if scenario == "suspicious" and not rules:
            rules = ["NEW_DEVICE_HIGH_VALUE", "HIGH_VELOCITY"]
            evidence = [
                f"High behavioral deviation (amount {txn.amount} vs usual ~4200)",
                f"Unusual transaction velocity ({int(vel)} recent txns)",
                "New device, location ~400km from usual",
            ]
        elif scenario == "fraud_ring" and "SHARED_DEVICE_MULTI_ACCOUNT" not in rules:
            rules = ["SHARED_DEVICE_MULTI_ACCOUNT"]
            evidence = ["Shared device across 4 accounts — possible fraud ring"]
        elif scenario == "ambiguous" and not rules:
            rules = ["MODERATE_VELOCITY", "SLIGHT_AMOUNT_DEVIATION"]
            evidence = ["No single extreme feature; several moderate signals combine"]
        elif not rules:
            evidence = ["Device matches historical profile", "Amount within usual range"]

        base = {"normal": 0.08, "suspicious": 0.91, "fraud_ring": 0.87, "ambiguous": 0.55}.get(scenario, 0.15)
        if amt_engine >= 100000:
            base = 0.92
        elif amt_engine <= 500 and vel < 5 and not is_shared:
            base = 0.03
            rules = []
            evidence = [f"Everyday transaction ({format_amount(amt, currency)}) verified safe", "Payment within expected parameters"]
        elif len(rules) >= 2 or is_shared or (is_new_device and amt_dev > 3.0):
            base = max(base, 0.82)
        elif len(rules) == 1:
            base = max(base, 0.45)
        elif not rules and scenario == "normal":
            base = min(base, 0.12)

        jitter = (_stable_unit(txn.transaction_id) - 0.5) * 0.04
        risk = max(0.01, min(0.99, base + jitter))

        signals = [
            Signal(name="amount_deviation", value=round(float(amt_dev), 2),
                   contribution=round(0.31 if risk > 0.5 else 0.05, 3)),
            Signal(name="velocity", value=vel,
                   contribution=round(0.24 if vel >= 5 else 0.03, 3)),
        ]

        return ScoreResult(
            transaction_id=txn.transaction_id,
            risk_score=round(risk, 3),
            risk_level=risk_level_for(risk),  # type: ignore[arg-type]
            signals=signals,
            rules=rules,
            behavioral_score=round(max(0.0, min(1.0, risk - 0.08)), 3),
            anomaly_score=round(max(0.0, min(1.0, risk - 0.12)), 3),
            xgb_score=None,  # mock has no real XGB — GUI shows "Not available"
            graph_score=0.85 if (is_shared or scenario == "fraud_ring") else 0.05,
            evidence=evidence,
            source="DEMO_FALLBACK",
        )
