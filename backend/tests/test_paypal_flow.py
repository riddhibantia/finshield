"""Fulfilment-shield flow tests — decision policy, rule masking, OTP, disputes,
webhook dedupe. Runs entirely against PAYPAL_ENV=stub (no network)."""
from __future__ import annotations

import json

import pytest


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.paypal import client as pp, stub
    from backend.main import app
    from backend.services import store as legacy_store

    monkeypatch.setenv("PAYPAL_ENV", "stub")
    monkeypatch.setenv("FINSHEILD_DB_PATH", str(tmp_path / "flow.db"))
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.delenv("PAYPAL_CLIENT_SECRET", raising=False)
    pp._token_cache.clear()
    stub.reset()
    legacy_store.reset()
    from fastapi.testclient import TestClient

    yield TestClient(app)
    stub.reset()
    legacy_store.reset()


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


def test_order_validation_and_cancel_lifecycle(client):
    for bad in ("0", "-12.50", "abc"):
        r = client.post("/api/paypal/orders", json={"scenario": "clean", "amount": bad})
        assert r.status_code == 400

    order = client.post(
        "/api/paypal/orders",
        json={"scenario": "clean", "amount": "55", "return_url": "http://localhost:5173/paypal"},
    )
    assert order.status_code == 200
    data = order.json()
    assert data["amount"] == "55.00"
    oid = data["paypal_order_id"]

    cancelled = client.post(f"/api/paypal/orders/{oid}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"
    # Second cancel is idempotent
    assert client.post(f"/api/paypal/orders/{oid}/cancel").json()["status"] == "CANCELLED"
    # Authorize after cancel is rejected cleanly with 409
    auth_after = client.post(f"/api/paypal/orders/{oid}/authorize", json={})
    assert auth_after.status_code == 409


def test_paypal_intents_appear_in_transactions_and_paypal_graph(client):
    stolen = _run_scenario(client, "stolen_account")
    tid = stolen["intent_id"]

    tx_list = client.get("/api/transactions").json()["transactions"]
    assert any(r["transaction"]["transaction_id"] == tid for r in tx_list)

    rec = client.get(f"/api/transactions/{tid}")
    assert rec.status_code == 200
    body = rec.json()
    assert body["transaction"]["gateway"] == "PayPal"
    assert body["transaction"]["currency"] == "USD"
    assert body["score"]["graph_score"] == pytest.approx(0.88)

    graph = client.get(f"/api/graph/{tid}").json()
    blob = json.dumps(graph)
    assert "₹" not in blob
    assert "Cashfree" not in blob
    assert "PayPal" in blob
    assert "$4,800.00" in blob


def test_disputes_unwrapped_and_simulated_evidence_approval_succeeds(client):
    _run_scenario(client, "clean")
    sim = client.post("/api/paypal/disputes/simulate", json={}).json()
    did = sim["dispute_id"]

    listed = client.get("/api/paypal/disputes").json()["disputes"]
    assert any(d.get("dispute_id") == did for d in listed)

    actions = client.get("/api/agent/actions?status=PENDING").json()["actions"]
    ev_action = next(a for a in actions if a["kind"] == "DISPUTE_EVIDENCE" and a["dispute_id"] == did)
    approved = client.post(f"/api/agent/actions/{ev_action['id']}/approve", json={"approved_by": "analyst"})
    assert approved.status_code == 200, approved.text
    res = approved.json()
    assert res["status"] == "EXECUTED"
    assert res["result"]["status"] == "SIMULATED_EVIDENCE_SUBMITTED"
    assert res["result"]["simulated"] is True


def test_agent_fallback_proposals_dedupe_and_sync_intent_status(client):
    review = _run_scenario(client, "review")
    clean = _run_scenario(client, "clean")

    # Void proposal on held review order -> human approval updates intent to VOIDED
    r1 = client.post("/api/agent/chat", json={"message": "Review queue and propose voids for anything critical"}).json()
    assert r1["source"] == "DEMO_FALLBACK"
    r1_dup = client.post("/api/agent/chat", json={"message": "Review queue and propose voids for anything critical"}).json()
    assert r1_dup["source"] == "DEMO_FALLBACK"

    pending_voids = [
        a for a in client.get("/api/agent/actions?status=PENDING").json()["actions"]
        if a["kind"] == "VOID" and a["authorization_id"] == review["authorization_id"]
    ]
    assert len(pending_voids) == 1
    assert pending_voids[0]["amount"] == "180.00"
    assert pending_voids[0]["currency"] == "USD"

    void_exec = client.post(f"/api/agent/actions/{pending_voids[0]['id']}/approve", json={"approved_by": "analyst"})
    assert void_exec.status_code == 200
    assert client.get(f"/api/paypal/intents/{review['intent_id']}").json()["status"] == "VOIDED"

    # Refund proposal on clean capture -> human approval updates intent to REFUNDED
    client.post("/api/agent/chat", json={"message": "Refund the last capture"})
    pending_refunds = [
        a for a in client.get("/api/agent/actions?status=PENDING").json()["actions"]
        if a["kind"] == "REFUND" and a["capture_id"] == clean["capture_id"]
    ]
    assert len(pending_refunds) == 1
    ref_exec = client.post(f"/api/agent/actions/{pending_refunds[0]['id']}/approve", json={"approved_by": "analyst"})
    assert ref_exec.status_code == 200
    assert client.get(f"/api/paypal/intents/{clean['intent_id']}").json()["status"] == "REFUNDED"


def test_real_ml_xgb_and_identity_contract(client):
    stolen = _run_scenario(client, "stolen_account")
    xgb_sig = next(s for s in stolen["signals"] if s["name"] == "xgb")
    assert xgb_sig["value"] > 0.1

    health = client.get("/api/health").json()
    if health["adapter"] == "real":
        assert health["model_status"]["shap"] is True

    ident = client.get("/api/identity/U-00001").json()
    for key in ("user_id", "user_token", "token", "phone", "phone_masked", "document", "id_token", "status", "verification"):
        assert key in ident
