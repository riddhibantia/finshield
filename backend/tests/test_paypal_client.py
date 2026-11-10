"""PayPal client tests — request shapes, token caching, webhook verification, stub seam."""
from __future__ import annotations

import json

import httpx
import pytest

from backend.paypal import client as pp

SANDBOX_CFG = pp.PayPalConfig(
    env="sandbox",
    client_id="test-client-id",
    client_secret="test-client-secret",
    webhook_id="WH-TEST",
    base_url="https://api-m.sandbox.paypal.com",
)
STUB_CFG = pp.PayPalConfig(env="stub", client_id="", client_secret="", webhook_id="", base_url="")


@pytest.fixture(autouse=True)
def _clear_token_cache():
    pp._token_cache.clear()
    yield
    pp._token_cache.clear()


def _transport(handler) -> httpx.MockTransport:
    return httpx.MockTransport(handler)


# ------------------------------------------------------------------ token cache


def test_token_cached_and_reused(monkeypatch):
    calls = {"n": 0}

    def fake_post(url, auth=None, data=None, timeout=None):
        calls["n"] += 1
        assert data == {"grant_type": "client_credentials"}
        assert auth == (SANDBOX_CFG.client_id, SANDBOX_CFG.client_secret)
        return httpx.Response(200, json={"access_token": "tok-1", "expires_in": 3600})

    monkeypatch.setattr(pp.httpx, "post", fake_post)
    t1 = pp.get_access_token(SANDBOX_CFG)
    t2 = pp.get_access_token(SANDBOX_CFG)
    assert t1 == t2 == "tok-1"
    assert calls["n"] == 1


def test_token_refreshed_within_60s_of_expiry(monkeypatch):
    calls = {"n": 0}

    def fake_post(url, auth=None, data=None, timeout=None):
        calls["n"] += 1
        return httpx.Response(200, json={"access_token": f"tok-{calls['n']}", "expires_in": 30})

    monkeypatch.setattr(pp.httpx, "post", fake_post)
    t1 = pp.get_access_token(SANDBOX_CFG)
    # expires_in 30 < 60s refresh window -> second call must re-fetch
    t2 = pp.get_access_token(SANDBOX_CFG)
    assert t1 == "tok-1" and t2 == "tok-2"
    assert calls["n"] == 2


def test_token_failure_raises_paypal_error(monkeypatch):
    monkeypatch.setattr(pp.httpx, "post", lambda *a, **k: httpx.Response(401, json={"message": "bad creds"}))
    with pytest.raises(pp.PayPalError) as exc:
        pp.get_access_token(SANDBOX_CFG)
    assert exc.value.status == 401


# ------------------------------------------------------------------ order lifecycle shapes


def test_create_order_request_shape(monkeypatch):
    monkeypatch.setattr(pp, "get_access_token", lambda cfg=None: "tok")
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        captured["request_id"] = request.headers.get("PayPal-Request-Id")
        return httpx.Response(201, json={"id": "ORD-1", "status": "CREATED"})

    order = pp.create_order("42.00", "USD", intent="AUTHORIZE", description="demo", custom_id="c1", cfg=SANDBOX_CFG, transport=_transport(handler))
    assert order["id"] == "ORD-1"
    assert captured["url"].endswith("/v2/checkout/orders")
    assert captured["body"]["intent"] == "AUTHORIZE"
    unit = captured["body"]["purchase_units"][0]
    assert unit["amount"] == {"currency_code": "USD", "value": "42.00"}
    assert captured["request_id"]  # idempotency key present on writes


def test_authorize_capture_void_refund_paths_and_ids(monkeypatch):
    monkeypatch.setattr(pp, "get_access_token", lambda cfg=None: "tok")
    seen: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, str(request.url.path)))
        body = json.loads(request.content) if request.content else {}
        if request.url.path.endswith("/authorize"):
            return httpx.Response(201, json={"purchase_units": [{"payments": {"authorizations": [{"id": "AUTH-1", "status": "CREATED"}]}}]})
        if request.url.path.endswith("/capture"):
            assert body["final_capture"] is True
            return httpx.Response(201, json={"id": "CAP-1", "status": "COMPLETED"})
        if request.url.path.endswith("/void"):
            return httpx.Response(200, json={"status": "VOIDED"})
        if request.url.path.endswith("/refund"):
            return httpx.Response(201, json={"id": "REF-1", "status": "COMPLETED"})
        return httpx.Response(500, json={"message": "unexpected path"})

    tr = _transport(handler)
    order = pp.authorize_order("ORD-1", cfg=SANDBOX_CFG, transport=tr)
    assert order["purchase_units"][0]["payments"]["authorizations"][0]["id"] == "AUTH-1"
    cap = pp.capture_authorization("AUTH-1", cfg=SANDBOX_CFG, transport=tr)
    assert cap["status"] == "COMPLETED"
    void = pp.void_authorization("AUTH-1", cfg=SANDBOX_CFG, transport=tr)
    assert void["status"] == "VOIDED"
    ref = pp.refund_capture("CAP-1", amount="42.00", currency="USD", note_to_payer="review", cfg=SANDBOX_CFG, transport=tr)
    assert ref["id"] == "REF-1"
    assert ("POST", "/v2/checkout/orders/ORD-1/authorize") in seen
    assert ("POST", "/v2/payments/authorizations/AUTH-1/capture") in seen
    assert ("POST", "/v2/payments/authorizations/AUTH-1/void") in seen
    assert ("POST", "/v2/payments/captures/CAP-1/refund") in seen


def test_api_error_surfaces_debug_id(monkeypatch):
    monkeypatch.setattr(pp, "get_access_token", lambda cfg=None: "tok")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={"message": "UNPROCESSABLE"}, headers={"PayPal-Debug-Id": "dbg-123"})

    with pytest.raises(pp.PayPalError) as exc:
        pp.create_order("42.00", "USD", cfg=SANDBOX_CFG, transport=_transport(handler))
    assert exc.value.status == 422
    assert exc.value.debug_id == "dbg-123"


# ------------------------------------------------------------------ webhook verification


def test_verify_webhook_signature_success(monkeypatch):
    monkeypatch.setattr(pp, "get_access_token", lambda cfg=None: "tok")
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"verification_status": "SUCCESS"})

    headers = {
        "auth_algo": "SHA256withRSA",
        "cert_url": "https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-1",
        "transmission_id": "TID",
        "transmission_sig": "SIG",
        "transmission_time": "2026-11-10T00:00:00Z",
    }
    ok = pp.verify_webhook_signature(headers, {"id": "EVT-1"}, cfg=SANDBOX_CFG, transport=_transport(handler))
    assert ok is True
    assert captured["body"]["webhook_id"] == "WH-TEST"
    assert captured["body"]["webhook_event"] == {"id": "EVT-1"}


def test_verify_webhook_signature_failure(monkeypatch):
    monkeypatch.setattr(pp, "get_access_token", lambda cfg=None: "tok")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"verification_status": "FAILURE"})

    headers = {
        "auth_algo": "SHA256withRSA",
        "cert_url": "https://cert",
        "transmission_id": "TID",
        "transmission_sig": "BAD",
        "transmission_time": "2026-11-10T00:00:00Z",
    }
    ok = pp.verify_webhook_signature(headers, {"id": "EVT-1"}, cfg=SANDBOX_CFG, transport=_transport(handler))
    assert ok is False


def test_verify_webhook_signature_missing_headers_never_calls_api():
    called = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        called["n"] += 1
        return httpx.Response(200, json={"verification_status": "SUCCESS"})

    headers = {"auth_algo": "SHA256withRSA"}  # rest missing
    ok = pp.verify_webhook_signature(headers, {"id": "EVT-1"}, cfg=SANDBOX_CFG, transport=_transport(handler))
    assert ok is False
    assert called["n"] == 0


def test_verify_webhook_signature_requires_webhook_id():
    headers = {"auth_algo": "a", "cert_url": "c", "transmission_id": "i", "transmission_sig": "s", "transmission_time": "t"}
    cfg = pp.PayPalConfig(env="sandbox", client_id="id", client_secret="sec", webhook_id="", base_url="https://api-m.sandbox.paypal.com")
    assert pp.verify_webhook_signature(headers, {}, cfg=cfg) is False


# ------------------------------------------------------------------ stub seam


def test_stub_full_lifecycle():
    from backend.paypal import stub

    stub.reset()
    order = pp.create_order("42.00", "USD", intent="AUTHORIZE", cfg=STUB_CFG)
    assert order["stub"] is True and order["status"] == "CREATED"
    order = pp.authorize_order(order["id"], cfg=STUB_CFG)
    auth = order["purchase_units"][0]["payments"]["authorizations"][0]
    assert auth["id"].startswith("STUB-AUTH-")
    cap = pp.capture_authorization(auth["id"], cfg=STUB_CFG)
    assert cap["status"] == "COMPLETED" and cap["stub"] is True
    order2 = pp.create_order("4800.00", "USD", intent="AUTHORIZE", cfg=STUB_CFG)
    order2 = pp.authorize_order(order2["id"], cfg=STUB_CFG)
    auth2 = order2["purchase_units"][0]["payments"]["authorizations"][0]
    void = pp.void_authorization(auth2["id"], cfg=STUB_CFG)
    assert void["status"] == "VOIDED"
    ref = pp.refund_capture(cap["id"], amount="42.00", currency="USD", cfg=STUB_CFG)
    assert ref["status"] == "COMPLETED"
    assert pp.verify_webhook_signature({}, {"id": "E"}, cfg=STUB_CFG) is True
    disputes = pp.list_disputes(cfg=STUB_CFG)
    assert disputes and disputes[0]["dispute_id"].startswith("PP-D-STUB-")
    stub.reset()


def test_env_loader_respects_existing_env(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("PAYPAL_ENV=stub\nPAYPAL_CLIENT_ID=file-id\n")
    import os

    key = "PP_TEST_KEEP_ME"
    os.environ.pop("PAYPAL_ENV", None)
    pp.load_env_file(env_file)
    assert os.environ["PAYPAL_ENV"] == "stub"
    os.environ["PAYPAL_ENV"] = "sandbox"  # pre-set value must win on second load
    pp.load_env_file(env_file)
    assert os.environ["PAYPAL_ENV"] == "sandbox"
    os.environ.pop("PAYPAL_ENV", None)
    os.environ.pop(key, None)
