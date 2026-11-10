"""Fulfilment-shield flow tests — decision policy, rule masking, OTP, disputes,
webhook dedupe. Runs entirely against PAYPAL_ENV=stub (no network)."""
from __future__ import annotations

import json

import pytest


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.paypal import client as pp, stub
    from backend.main import app

    monkeypatch.setenv("PAYPAL_ENV", "stub")
    monkeypatch.setenv("FINSHEILD_DB_PATH", str(tmp_path / "flow.db"))
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.delenv("PAYPAL_CLIENT_SECRET", raising=False)
    pp._token_cache.clear()
    stub.reset()
    from fastapi.testclient import TestClient

    yield TestClient(app)
    stub.reset()


def _run_scenario(client, scenario: str) -> dict:
    order = client.post("/api/paypal/orders", json={"scenario": scenario}).json()
    resp = client.post(f"/api/paypal/orders/{order['paypal_order_id']}/authorize", json={})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_config_reports_stub(client):
    data = client.get("/api/paypal/config").json()
    assert data["environment"] == "stub"
    assert data["enabled"] is True
    assert data["sdk_url"].endswith("/web-sdk/v6/core")


def test_clean_buyer_auto_captures(client):
    d = _run_scenario(client, "clean")
    assert d["decision"] == "AUTO_CAPTURE"
    assert d["risk_level"] == "LOW"
    assert d["status"] == "CAPTURED"
    assert d["capture_id"]


def test_stolen_account_auto_voids_before_delivery(client):
    d = _run_scenario(client, "stolen_account")
    assert d["decision"] == "AUTO_VOID"
    assert d["risk_level"] == "CRITICAL"
    assert d["status"] == "VOIDED"


def test_rule_names_never_leak_upi(client):
    for scenario in ("clean", "friendly_fraud", "review", "stolen_account"):
        d = _run_scenario(client, scenario)
        blob = json.dumps({"rules": d["rules"], "messages": d["rule_messages"], "evidence": d["evidence"]})
        assert "UPI" not in blob, f"internal rail leaked in {scenario}"
        assert "₹" not in blob


def test_friendly_fraud_holds_for_step_up_and_otp_captures(client):
    d = _run_scenario(client, "friendly_fraud")
    assert d["decision"] == "HOLD_STEP_UP"
    assert d["status"] == "HELD_STEP_UP"
    wrong = client.post(f"/api/paypal/intents/{d['intent_id']}/verify", json={"otp": "000000"})
    assert wrong.status_code == 200
    assert wrong.json()["verified"] is False
    # authorization was voided on failed OTP — create a fresh held intent for the pass path
    d2 = _run_scenario(client, "friendly_fraud")
    ok = client.post(f"/api/paypal/intents/{d2['intent_id']}/verify", json={"otp": "123456"})
    assert ok.status_code == 200
    assert ok.json()["action"] == "capture"
    assert ok.json()["status"] == "COMPLETED"


def test_review_holds_for_analyst_and_approval_executes(client):
    d = _run_scenario(client, "review")
    assert d["decision"] == "HOLD_FOR_REVIEW"
    assert d["status"] == "HELD_REVIEW"
    ok = client.post(f"/api/paypal/intents/{d['intent_id']}/approve", json={"action": "void", "approved_by": "riddhi"})
    assert ok.status_code == 200
    assert ok.json()["void_status"] == "VOIDED"


def test_dispute_simulate_creates_pending_evidence_action(client):
    _run_scenario(client, "clean")
    resp = client.post("/api/paypal/disputes/simulate", json={})
    assert resp.status_code == 200
    assert resp.json()["simulated"] is True
    actions = client.get("/api/agent/actions?status=PENDING").json()["actions"]
    assert any(a["kind"] == "DISPUTE_EVIDENCE" for a in actions)
    draft = client.post(f"/api/paypal/disputes/{resp.json()['dispute_id']}/draft")
    assert draft.status_code == 200
    body = draft.json()
    assert "sections" in body


def test_webhook_dedupe(client):
    _run_scenario(client, "clean")
    event = {
        "id": "WH-DEDUPE-1",
        "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "resource": {"id": "nonexistent-capture"},
    }
    r1 = client.post("/api/paypal/webhooks", json=event)
    r2 = client.post("/api/paypal/webhooks", json=event)
    assert r1.json()["outcome"]["status"] == "processed"
    assert r2.json()["outcome"]["status"] == "duplicate"


def test_currency_fix_usd_not_clamped_like_inr(client):
    """A $42 order is 3507 INR-equivalent: above the 500 micro-clamp, below the
    100000 CRITICAL clamp — the currency fix is what keeps this scoring LOW
    instead of the legacy INR code paths misreading it."""
    d = _run_scenario(client, "clean")
    assert 0.0 <= d["risk_score"] < 0.3
    fx_note = [e for e in d["evidence"] if "normalised at demo rate" in e]
    assert fx_note, "FX disclosure missing from evidence"
