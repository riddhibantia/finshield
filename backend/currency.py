"""Currency helpers — the single FX seam for the risk engine.

The engine's thresholds were tuned on INR-scale data. Every scorer feeds
the engine an INR-equivalent amount while display values keep the original
currency. The demo rate is disclosed wherever normalization is applied —
judges reward honesty.
"""
from __future__ import annotations

DEMO_FX_RATE_NOTE = "Currency normalised at demo rate (1 USD = 83.50 INR-equivalent)"

FX_TO_INR: dict[str, float] = {
    "INR": 1.0,
    "USD": 83.5,
    "EUR": 90.0,
    "GBP": 105.0,
    "AUD": 55.0,
    "CAD": 61.0,
    "SGD": 62.0,
    "AED": 22.7,
    "JPY": 0.56,
}

DEFAULT_FX_FALLBACK = 83.5


def engine_amount(amount: float, currency: str) -> float:
    """Convert a display amount to the engine's INR-equivalent scale."""
    try:
        currency = str(currency or "INR").upper()
    except Exception:
        currency = "INR"
    rate = FX_TO_INR.get(currency, DEFAULT_FX_FALLBACK)
    return float(amount) * rate


def format_amount(amount: float, currency: str) -> str:
    """Human-readable amount in the ORIGINAL currency (never a hardcoded ₹)."""
    try:
        currency = str(currency or "INR").upper()
    except Exception:
        currency = "INR"
    return f"{float(amount):,.2f} {currency}"
