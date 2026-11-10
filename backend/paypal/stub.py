"""Deterministic in-memory PayPal stub — PAYPAL_ENV=stub.

Insurance for offline dev/tests when sandbox credentials are unavailable.
Response shapes mirror the real API closely enough for the UI and tests;
every stub response carries "stub": true so the UI can label it honestly.
State lives in this module (per-process) and resets on restart.
"""
from __future__ import annotations

import itertools
import re
from typing import Any

_orders: dict[str, dict[str, Any]] = {}
_authorizations: dict[str, dict[str, Any]] = {}
_captures: dict[str, dict[str, Any]] = {}
_disputes: dict[str, dict[str, Any]] = {}

_counter = itertools.count(1)


def reset() -> None:
    _orders.clear()
    _authorizations.clear()
    _captures.clear()
    _disputes.clear()
    global _counter
    _counter = itertools.count(1)


def _seed_disputes() -> None:
    if _disputes:
        return
    n = next(_counter)
    _disputes[f"PP-D-STUB-{n}"] = {
        "dispute_id": f"PP-D-STUB-{n}",
        "status": "WAITING_FOR_SELLER_RESPONSE",
        "dispute_state": "WAITING_FOR_SELLER_RESPONSE",
        "reason": "MERCHANDISE_NOT_RECEIVED",
        "disputed_amount": {"currency_code": "USD", "value": "220.00"},
        "seller_response_due_date": "2026-11-20T00:00:00Z",
        "stub": True,
    }


def handle(method: str, path: str, *, json_body: dict[str, Any] | None, params: dict[str, Any] | None) -> dict[str, Any]:
    if path == "/v2/checkout/orders" and method == "POST":
        n = next(_counter)
        order_id = f"STUB-ORD-{n:06d}"
        unit = json_body["purchase_units"][0]
        _orders[order_id] = {
            "id": order_id,
            "intent": json_body.get("intent", "AUTHORIZE"),
            "status": "CREATED",
            "purchase_units": [
                {
                    "reference_id": "default",
                    "amount": unit["amount"],
                    "payments": {},
                }
            ],
            "stub": True,
        }
        return _orders[order_id]

    m = re.match(r"^/v2/checkout/orders/([^/]+)$", path)
    if method == "GET" and m:
        return _orders[m.group(1)]

    m = re.match(r"^/v2/checkout/orders/([^/]+)/authorize$", path)
    if method == "POST" and m:
        order = _orders[m.group(1)]
        n = next(_counter)
        auth_id = f"STUB-AUTH-{n:06d}"
        order["status"] = "APPROVED"
        auth = {
            "id": auth_id,
            "status": "CREATED",
            "amount": order["purchase_units"][0]["amount"],
            "final_capture": True,
            "stub": True,
        }
        order["purchase_units"][0]["payments"]["authorizations"] = [auth]
        _authorizations[auth_id] = {"order_id": order["id"], "auth": auth}
        return order

    m = re.match(r"^/v2/payments/authorizations/([^/]+)/capture$", path)
    if method == "POST" and m:
        auth_id = m.group(1)
        auth = _authorizations[auth_id]["auth"]
        n = next(_counter)
        capture_id = f"STUB-CAP-{n:06d}"
        amount = (json_body or {}).get("amount") or auth["amount"]
        capture = {
            "id": capture_id,
            "status": "COMPLETED",
            "amount": amount,
            "final_capture": bool((json_body or {}).get("final_capture", True)),
            "seller_receivable": {"net_amount": amount},
            "stub": True,
        }
        auth["status"] = "CAPTURED"
        _authorizations[auth_id]["auth"] = auth
        _captures[capture_id] = capture
        return capture

    m = re.match(r"^/v2/payments/authorizations/([^/]+)/void$", path)
    if method == "POST" and m:
        auth = _authorizations[m.group(1)]["auth"]
        auth["status"] = "VOIDED"
        return {"status": "VOIDED", "stub": True}

    m = re.match(r"^/v2/payments/captures/([^/]+)/refund$", path)
    if method == "POST" and m:
        n = next(_counter)
        capture = _captures[m.group(1)]
        return {
            "id": f"STUB-REF-{n:06d}",
            "status": "COMPLETED",
            "amount": (json_body or {}).get("amount") or capture["amount"],
            "note_to_payer": (json_body or {}).get("note_to_payer", ""),
            "stub": True,
        }

    if path == "/v1/notifications/verify-webhook-signature":
        return {"verification_status": "SUCCESS", "stub": True}

    if path == "/v1/customer/disputes" and method == "GET":
        _seed_disputes()
        return {"disputes": list(_disputes.values()), "stub": True}

    m = re.match(r"^/v1/customer/disputes/([^/]+)$", path)
    if method == "GET" and m:
        _seed_disputes()
        return _disputes[m.group(1)]

    m = re.match(r"^/v1/customer/disputes/([^/]+)/provide-evidence$", path)
    if method == "POST" and m:
        _seed_disputes()
        dispute = _disputes.setdefault(
            m.group(1),
            {"dispute_id": m.group(1), "status": "OPEN", "stub": True},
        )
        dispute["evidences"] = (json_body or {}).get("evidences", [])
        dispute["status"] = "UNDER_REVIEW"
        return {"dispute_id": dispute["dispute_id"], "status": dispute["status"], "stub": True}

    raise KeyError(f"stub transport has no handler for {method} {path}")
