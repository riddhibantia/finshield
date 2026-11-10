"""Public reason codes — internal rule names never leave the engine.

The legacy rule vocabulary is UPI/INR-flavoured. Anything shown to buyers,
the UI, the LLM agent or judges goes through this mapper so no internal
name or currency leaks outside the scoring layer.
"""
from __future__ import annotations

from backend.currency import format_amount

# internal rule code -> public, PayPal-safe code
RULE_CODE_MAP: dict[str, str] = {
    "UPI_HIGH_VALUE_ANOMALY": "HIGH_VALUE_SPIKE",
    "EXCEEDS_SINGLE_TRANSACTION_LIMIT": "AMOUNT_LIMIT_EXCEEDED",
    "SHARED_DEVICE_MULTI_ACCOUNT": "LINKED_DEVICE_CLUSTER",
    "BURST_VELOCITY": "VELOCITY_BURST",
    "HIGH_VELOCITY": "HIGH_ACTIVITY",
    "NEW_DEVICE_HIGH_VALUE": "NEW_DEVICE_HIGH_VALUE",
    "NEW_DEVICE": "NEW_DEVICE",
    "UNUSUAL_AMOUNT": "AMOUNT_DEVIATION",
    "OFFHOURS_HIGH_VALUE": "OFFHOURS_HIGH_VALUE",
    "UNUSUAL_LOCATION": "LOCATION_ANOMALY",
    "HIGH_RISK_MERCHANT_CATEGORY": "HIGH_RISK_CATEGORY",
    "MODERATE_VELOCITY": "MODERATE_ACTIVITY",
    "SLIGHT_AMOUNT_DEVIATION": "AMOUNT_VARIATION",
}

# public code -> customer-safe explanation (no model internals, no rail names)
PUBLIC_MESSAGES: dict[str, str] = {
    "HIGH_VALUE_SPIKE": "The payment amount is unusually large for this checkout profile",
    "AMOUNT_LIMIT_EXCEEDED": "The payment exceeds the standard single-transaction threshold",
    "LINKED_DEVICE_CLUSTER": "This device is linked to several unrelated buyer accounts",
    "VELOCITY_BURST": "Automated-style burst of attempts in a very short window",
    "HIGH_ACTIVITY": "Too many attempts in a short period",
    "NEW_DEVICE_HIGH_VALUE": "A high-value payment from a device never seen on this account",
    "NEW_DEVICE": "Payment initiated from an unrecognized device",
    "AMOUNT_DEVIATION": "The amount is far from this buyer's usual range",
    "OFFHOURS_HIGH_VALUE": "High-value payment in the middle of the night",
    "LOCATION_ANOMALY": "Payment location is far from the buyer's usual region",
    "HIGH_RISK_CATEGORY": "High-risk merchant sector with a substantial amount",
    "MODERATE_ACTIVITY": "Slightly elevated activity level",
    "AMOUNT_VARIATION": "Minor deviation from the usual amount",
}


def public_code(rule: str) -> str:
    return RULE_CODE_MAP.get(rule, rule)


def public_rules(rules: list[str]) -> list[str]:
    return [public_code(r) for r in rules]


def public_message(rule: str) -> str:
    return PUBLIC_MESSAGES.get(public_code(rule), "Flagged by the risk engine")


def sanitize_evidence(evidence: list[str], amount: float, currency: str) -> list[str]:
    """Scrub internal rail names and hardcoded currency symbols out of evidence
    strings so judges never see them. Legacy ₹ literals are removed; where the
    original text embedded a bare amount we append the original-currency figure."""
    cleaned: list[str] = []
    for item in evidence or []:
        text = str(item)
        had_rupee = "₹" in text
        text = text.replace("₹1 Lakh", "the single-transaction threshold")
        text = text.replace("₹", "")
        text = text.replace(" UPI ", " ")
        text = text.replace("UPI ", "")
        text = text.replace(" UPI", "")
        text = text.replace("standard UPI parameters", "expected parameters")
        text = text.replace("1 Lakh", "the single-transaction threshold")
        if had_rupee:
            text = f"{text.strip()} (original amount {format_amount(amount, currency)})"
        cleaned.append(text.strip())
    return cleaned
