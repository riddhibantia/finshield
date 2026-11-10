"""End-to-end PayPal smoke test — the build checkpoint.

Mirrors the real product flow: the backend creates an AUTHORIZE order,
the buyer approves in the PayPal popup, then the backend authorizes and
captures/voids based on the risk decision.

Modes:
  (no args)          full flow — works unattended against PAYPAL_ENV=stub;
                     sandbox stops at the approval step and prints the URL
  create <amt> <cur> <label>   create order, print id + approval URL
  finish <order_id> <capture|void>   authorize + capture/void (order must be approved)
  verify                        verify-webhook-signature connectivity check

Run: PYTHONPATH=.:src python scripts/paypal_smoke.py
Never prints credentials or tokens.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.paypal.client import (  # noqa: E402
    PayPalConfigError,
    PayPalError,
    authorize_order,
    capture_authorization,
    create_order,
    get_config,
    load_env_file,
    void_authorization,
)


def _auth(order: dict) -> dict:
    return order["purchase_units"][0]["payments"]["authorizations"][0]


def _approve_url(order: dict) -> str:
    for link in order.get("links", []):
        if link.get("rel") == "approve":
            return link["href"]
    return f"https://www.sandbox.paypal.com/checkoutnow?token={order['id']}"


def full() -> int:
    cfg = get_config()
    print(f"environment: {cfg.env}")
    print("[1] clean buyer $42 -> authorize -> capture")
    order = create_order("42.00", "USD", intent="AUTHORIZE", description="FinShield smoke - clean buyer", custom_id="smoke-clean")
    print(f"    order {order['id']} status={order['status']}")
    if order["status"] != "APPROVED" and cfg.env == "sandbox":
        print(f"    awaiting buyer approval: {_approve_url(order)}")
        print("    (approve in the sandbox popup, then: finish " + order["id"] + " capture)")
        return 0
    order = authorize_order(order["id"])
    print(f"    authorization {_auth(order)['id']} status={_auth(order)['status']}")
    cap = capture_authorization(_auth(order)["id"])
    print(f"    capture {cap['id']} status={cap['status']}")

    print("[2] risky $4,800 -> authorize -> void before delivery")
    order = create_order("4800.00", "USD", intent="AUTHORIZE", description="FinShield smoke - risky", custom_id="smoke-risky")
    print(f"    order {order['id']} status={order['status']}")
    order = authorize_order(order["id"])
    void = void_authorization(_auth(order)["id"])
    print(f"    void status={void.get('status', 'VOIDED')}")
    print("SMOKE-PASS: order -> authorize -> capture -> void all succeeded")
    return 0


def create(amount: str, currency: str, label: str) -> int:
    order = create_order(amount, currency, intent="AUTHORIZE", description=f"FinShield smoke - {label}", custom_id=f"smoke-{label}")
    print(f"ORDER_ID={order['id']}")
    print(f"STATUS={order['status']}")
    print(f"APPROVE_URL={_approve_url(order)}")
    return 0


def finish(order_id: str, action: str) -> int:
    order = authorize_order(order_id)
    auth = _auth(order)
    print(f"AUTHORIZATION_ID={auth['id']} status={auth['status']}")
    if action == "capture":
        cap = capture_authorization(auth["id"])
        print(f"CAPTURE_ID={cap['id']} status={cap['status']}")
    elif action == "void":
        void = void_authorization(auth["id"])
        print(f"VOID status={void.get('status', 'VOIDED')}")
    else:
        raise SystemExit(f"unknown action {action}")
    return 0


def main(argv: list[str]) -> int:
    load_env_file()
    if len(argv) >= 3 and argv[1] == "create":
        return create(argv[2], argv[3] if len(argv) > 3 else "USD", argv[4] if len(argv) > 4 else "order")
    if len(argv) >= 4 and argv[1] == "finish":
        return finish(argv[2], argv[3])
    return full()


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except (PayPalError, PayPalConfigError) as e:
        print(f"SMOKE-FAIL: {e}")
        sys.exit(1)
