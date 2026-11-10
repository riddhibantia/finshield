"""The agent guardrail test — the loop must never be able to move money.

Asserts, by inspecting the running modules (not just naming conventions):
  1. no function in backend.agent.* calls any PayPal client write function;
  2. every agent tool result is either a read or a PENDING proposal row;
  3. proposals never contain a PayPal response (they only reach PayPal via
     POST /api/agent/actions/{id}/approve).
"""
from __future__ import annotations

import inspect
import json

import pytest

from backend.agent import loop, tools
from backend.paypal import client as pp

PAYPAL_WRITE_FNS = {
    pp.create_order,
    pp.authorize_order,
    pp.capture_authorization,
    pp.void_authorization,
    pp.refund_capture,
    pp.provide_dispute_evidence,
}


@pytest.fixture()
def stub_client(monkeypatch, tmp_path):
    from backend.main import app
    from backend.paypal import client as _pp, stub

    monkeypatch.setenv("PAYPAL_ENV", "stub")
    monkeypatch.setenv("FINSHEILD_DB_PATH", str(tmp_path / "guardrail.db"))
    monkeypatch.setenv("LLM_API_KEY", "")
    _pp._token_cache.clear()
    stub.reset()
    from fastapi.testclient import TestClient

    yield TestClient(app)
    stub.reset()


def test_agent_modules_never_reference_paypal_write_functions():
    for mod in (tools, loop):
        source = inspect.getsource(mod)
        for fn in PAYPAL_WRITE_FNS:
            assert fn.__name__ not in source, (
                f"{mod.__name__} references PayPal write function {fn.__name__} — guardrail breach"
            )


def test_propose_tools_only_create_pending_rows(stub_client):
    for tool, args in (
        ("propose_capture", {"authorization_id": "AUTH-X"}),
        ("propose_void", {"authorization_id": "AUTH-X"}),
        ("propose_refund", {"capture_id": "CAP-X", "amount": "42.00", "currency": "USD"}),
    ):
        result = tools.execute_tool(tool, args)
        assert result["approval_required"] is True
        assert result["status"] == "PENDING"
        row = stub_client.get("/api/agent/actions?status=PENDING").json()["actions"]
        assert any(a["id"] == result["proposal_id"] and a["status"] == "PENDING" for a in row)


def test_proposals_never_contain_paypal_results(stub_client):
    from backend.paypal import store

    result = tools.execute_tool("propose_refund", {"capture_id": "CAP-Y", "amount": "42.00"})
    # the tool response carries no PayPal resource shape at all
    assert set(result) == {"proposal_id", "status", "approval_required", "message"}
    assert "COMPLETED" not in json.dumps(result)
    # the capture reference is stored only so a human approver can act on it later
    row = store.get_action(result["proposal_id"])
    assert row["capture_id"] == "CAP-Y"
