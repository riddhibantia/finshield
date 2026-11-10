"""PayPal REST client — the single seam every PayPal call goes through.

- Sandbox by default; PAYPAL_ENV=stub swaps in a deterministic in-memory
  transport (backend/paypal/stub.py) so dev/tests run without credentials.
  Stub responses carry an extra "stub": true key so the UI can label them.
- OAuth token cache: thread-safe, refreshed 60s before expiry.
- Every money-moving write carries PayPal-Request-Id for idempotency.
- Amounts are strings end-to-end, PayPal format like "42.00".
- PayPal-Debug-Id from failures is surfaced on PayPalError for support.
"""
from __future__ import annotations

import os
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


class PayPalError(RuntimeError):
    """PayPal API failure with HTTP status and debug id."""

    def __init__(self, status: int, message: str, debug_id: str = ""):
        super().__init__(f"PayPal API error {status}: {message}")
        self.status = status
        self.message = message
        self.debug_id = debug_id


class PayPalConfigError(RuntimeError):
    """Credentials missing for the configured environment."""


def load_env_file(path: str | Path = ".env") -> None:
    """Minimal .env loader: KEY=VALUE lines, # comments, no interpolation.

    Uses setdefault so real environment variables always win over the file.
    """
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class PayPalConfig:
    env: str  # "sandbox" | "stub"
    client_id: str
    client_secret: str
    webhook_id: str
    base_url: str

    @classmethod
    def from_env(cls) -> "PayPalConfig":
        env = os.getenv("PAYPAL_ENV", "sandbox").strip().lower()
        if env not in ("sandbox", "stub"):
            env = "sandbox"
        return cls(
            env=env,
            client_id=os.getenv("PAYPAL_CLIENT_ID", "").strip(),
            client_secret=os.getenv("PAYPAL_CLIENT_SECRET", "").strip(),
            webhook_id=os.getenv("PAYPAL_WEBHOOK_ID", "").strip(),
            base_url="https://api-m.sandbox.paypal.com" if env == "sandbox" else "",
        )

    def usable(self) -> bool:
        return self.env == "stub" or bool(self.client_id and self.client_secret)


def get_config() -> PayPalConfig:
    return PayPalConfig.from_env()


_token_lock = threading.Lock()
_token_cache: dict[str, tuple[str, float]] = {}  # client_id -> (token, expires_at_epoch)


def get_access_token(cfg: PayPalConfig | None = None) -> str:
    """Client-credentials OAuth token, cached and refreshed 60s early."""
    cfg = cfg or get_config()
    if cfg.env == "stub":
        return "stub-token"
    if not cfg.client_id or not cfg.client_secret:
        raise PayPalConfigError("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set")
    now = time.time()
    cached = _token_cache.get(cfg.client_id)
    if cached and cached[1] > now + 60:
        return cached[0]
    with _token_lock:
        cached = _token_cache.get(cfg.client_id)
        if cached and cached[1] > now + 60:
            return cached[0]
        r = httpx.post(
            f"{cfg.base_url}/v1/oauth2/token",
            auth=(cfg.client_id, cfg.client_secret),
            data={"grant_type": "client_credentials"},
            timeout=10.0,
        )
        if r.status_code != 200:
            raise PayPalError(r.status_code, "oauth token request failed", r.headers.get("PayPal-Debug-Id", ""))
        data = r.json()
        token = data["access_token"]
        _token_cache[cfg.client_id] = (token, now + int(data.get("expires_in", 3600)))
        return token


def _request(
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    cfg: PayPalConfig | None = None,
    transport: httpx.BaseTransport | None = None,
    idempotent: bool = False,
    request_id: str | None = None,
) -> dict[str, Any]:
    cfg = cfg or get_config()
    if cfg.env == "stub":
        from . import stub

        return stub.handle(method, path, json_body=json_body, params=params)
    headers = {
        "Authorization": f"Bearer {get_access_token(cfg)}",
        "Accept": "application/json",
        "User-Agent": "FinShield-Fulfilment-Shield/1.0",
    }
    if json_body is not None:
        headers["Content-Type"] = "application/json"
    if idempotent:
        headers["PayPal-Request-Id"] = request_id or str(uuid.uuid4())
    with httpx.Client(timeout=10.0, transport=transport) as client:
        resp = client.request(method, f"{cfg.base_url}{path}", json=json_body, params=params, headers=headers)
    debug_id = resp.headers.get("PayPal-Debug-Id", "")
    if resp.status_code >= 400:
        try:
            message = resp.json().get("message", resp.text[:200])
        except Exception:
            message = resp.text[:200]
        raise PayPalError(resp.status_code, message, debug_id)
    return resp.json()


# ---------------------------------------------------------------- orders v2


def create_order(
    amount: str,
    currency: str = "USD",
    *,
    intent: str = "AUTHORIZE",
    description: str = "",
    custom_id: str = "",
    invoice_id: str = "",
    cfg: PayPalConfig | None = None,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    """Create an order. intent=AUTHORIZE locks funds at buyer approval; we
    capture/void later based on the risk decision."""
    unit: dict[str, Any] = {"amount": {"currency_code": currency.upper(), "value": amount}}
    if description:
        unit["description"] = description[:127]
    if custom_id:
        unit["custom_id"] = custom_id[:127]
    if invoice_id:
        unit["invoice_id"] = invoice_id[:127]
    body = {"intent": intent.upper(), "purchase_units": [unit]}
    return _request(
        "POST",
        "/v2/checkout/orders",
        json_body=body,
        cfg=cfg,
        transport=transport,
        idempotent=True,
    )


def get_order(order_id: str, *, cfg: PayPalConfig | None = None, transport: httpx.BaseTransport | None = None) -> dict[str, Any]:
    return _request("GET", f"/v2/checkout/orders/{order_id}", cfg=cfg, transport=transport)


def authorize_order(
    order_id: str,
    *,
    cfg: PayPalConfig | None = None,
    transport: httpx.BaseTransport | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Authorize the buyer-approved order — funds are now locked at PayPal.

    Returns the order resource; the authorization id lives at
    purchase_units[0].payments.authorizations[0].id."""
    return _request(
        "POST",
        f"/v2/checkout/orders/{order_id}/authorize",
        json_body={},
        cfg=cfg,
        transport=transport,
        idempotent=True,
        request_id=request_id,
    )


def capture_authorization(
    authorization_id: str,
    *,
    currency: str | None = None,
    amount: str | None = None,
    final_capture: bool = True,
    cfg: PayPalConfig | None = None,
    transport: httpx.BaseTransport | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Capture a previously authorized payment (money actually moves)."""
    body: dict[str, Any] = {"final_capture": final_capture}
    if amount and currency:
        body["amount"] = {"currency_code": currency.upper(), "value": amount}
    return _request(
        "POST",
        f"/v2/payments/authorizations/{authorization_id}/capture",
        json_body=body,
        cfg=cfg,
        transport=transport,
        idempotent=True,
        request_id=request_id,
    )


def void_authorization(
    authorization_id: str,
    *,
    cfg: PayPalConfig | None = None,
    transport: httpx.BaseTransport | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Void a previously authorized payment before capture — nothing ships,
    nothing to dispute, no fees."""
    return _request(
        "POST",
        f"/v2/payments/authorizations/{authorization_id}/void",
        json_body={},
        cfg=cfg,
        transport=transport,
        idempotent=True,
        request_id=request_id,
    )


def refund_capture(
    capture_id: str,
    *,
    amount: str | None = None,
    currency: str | None = None,
    note_to_payer: str = "",
    cfg: PayPalConfig | None = None,
    transport: httpx.BaseTransport | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Refund a captured payment (agent-proposed, human-approved only)."""
    body: dict[str, Any] = {}
    if amount and currency:
        body["amount"] = {"currency_code": currency.upper(), "value": amount}
    if note_to_payer:
        body["note_to_payer"] = note_to_payer[:255]
    return _request(
        "POST",
        f"/v2/payments/captures/{capture_id}/refund",
        json_body=body,
        cfg=cfg,
        transport=transport,
        idempotent=True,
        request_id=request_id,
    )


# ---------------------------------------------------------------- webhooks


def verify_webhook_signature(
    transmission_headers: dict[str, str],
    webhook_event: dict[str, Any],
    *,
    webhook_id: str | None = None,
    cfg: PayPalConfig | None = None,
    transport: httpx.BaseTransport | None = None,
) -> bool:
    """Verify a webhook's transmission headers via the verification API.

    transmission_headers needs: auth_algo, cert_url, transmission_id,
    transmission_sig, transmission_time (from the PayPal-* request headers).
    """
    cfg = cfg or get_config()
    if cfg.env == "stub":
        return True
    wh_id = webhook_id or cfg.webhook_id
    if not wh_id:
        return False
    required = ["auth_algo", "cert_url", "transmission_id", "transmission_sig", "transmission_time"]
    missing = [k for k in required if not transmission_headers.get(k)]
    if missing:
        return False
    body = {
        "auth_algo": transmission_headers["auth_algo"],
        "cert_url": transmission_headers["cert_url"],
        "transmission_id": transmission_headers["transmission_id"],
        "transmission_sig": transmission_headers["transmission_sig"],
        "transmission_time": transmission_headers["transmission_time"],
        "webhook_id": wh_id,
        "webhook_event": webhook_event,
    }
    try:
        data = _request(
            "POST",
            "/v1/notifications/verify-webhook-signature",
            json_body=body,
            cfg=cfg,
            transport=transport,
        )
    except PayPalError:
        return False
    return data.get("verification_status") == "SUCCESS"


# ---------------------------------------------------------------- disputes


def list_disputes(*, cfg: PayPalConfig | None = None, transport: httpx.BaseTransport | None = None) -> list[dict[str, Any]]:
    data = _request("GET", "/v1/customer/disputes", cfg=cfg, transport=transport)
    return data.get("disputes", [])


def get_dispute(
    dispute_id: str,
    *,
    cfg: PayPalConfig | None = None,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    return _request("GET", f"/v1/customer/disputes/{dispute_id}", cfg=cfg, transport=transport)


def provide_dispute_evidence(
    dispute_id: str,
    evidences: list[dict[str, Any]],
    *,
    cfg: PayPalConfig | None = None,
    transport: httpx.BaseTransport | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Submit evidence for a dispute (JSON notes-only variant).

    evidences: list of {"evidence_type": str, "notes": str, ...} —
    e.g. {"evidence_type": "OTHER", "notes": "..."} when no files apply.
    """
    return _request(
        "POST",
        f"/v1/customer/disputes/{dispute_id}/provide-evidence",
        json_body={"evidences": evidences},
        cfg=cfg,
        transport=transport,
        idempotent=True,
        request_id=request_id,
    )
