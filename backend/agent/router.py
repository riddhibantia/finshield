"""/api/agent/* — analyst agent chat and the human approval queue.

THE GUARDRAIL: approve/reject is the ONLY place proposals become PayPal
calls. The agent loop and its tools cannot reach any money-moving client
function (asserted by backend/tests/test_agent_guardrail.py).
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..paypal import client as pp
from ..paypal import store
from ..paypal.mapper import now_iso
from . import loop

router = APIRouter(prefix="/api/agent", tags=["agent"])


class ChatRequest(BaseModel):
    message: str
    history: list[dict[str, Any]] = []


class ApproveRequest(BaseModel):
    approved_by: str = "analyst"


@router.get("/health")
def agent_health():
    return {"llm_configured": loop.llm_available(), "model": loop.llm_config()["model"], "source": "LIVE_LLM" if loop.llm_available() else "DEMO_FALLBACK"}


@router.post("/chat")
def agent_chat(body: ChatRequest):
    result = loop.run_agent(body.message, body.history)
    return result


@router.get("/actions")
def list_actions(status: str | None = None, limit: int = 100):
    rows = store.list_actions(status, limit)
    for row in rows:
        for blob_key in ("draft", "result_payload"):
            value = row.get(blob_key)
            if isinstance(value, str) and value:
                try:
                    row[blob_key] = json.loads(value)
                except Exception:
                    pass
    return {"actions": rows}


@router.post("/actions/{action_id}/approve")
def approve_action(action_id: str, body: ApproveRequest):
    """Human approval -> the ONLY code path that turns a proposal into a
    PayPal call (capture / void / refund / dispute evidence submission)."""
    action = store.get_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Not found")
    if action.get("status") != "PENDING":
        raise HTTPException(status_code=409, detail=f"Action is {action.get('status')}, not PENDING")

    kind = (action.get("kind") or "").upper()
    cfg = pp.get_config()
    try:
        if kind == "CAPTURE":
            result = pp.capture_authorization(action["authorization_id"], request_id=str(uuid.uuid4()), cfg=cfg)
        elif kind == "VOID":
            result = pp.void_authorization(action["authorization_id"], request_id=str(uuid.uuid4()), cfg=cfg)
        elif kind == "REFUND":
            result = pp.refund_capture(
                action["capture_id"],
                amount=action.get("amount"),
                currency=action.get("currency") or "USD",
                note_to_payer=action.get("reason") or "Refund approved by FinShield analyst",
                request_id=str(uuid.uuid4()),
                cfg=cfg,
            )
        elif kind == "DISPUTE_EVIDENCE":
            from ..paypal.router import build_evidence_draft

            dispute_id = action.get("dispute_id") or ""
            intent = None
            for i in store.list_intents(50):
                if i.get("capture_id"):
                    intent = i
                    break
            draft = action.get("draft") or build_evidence_draft({"dispute_id": dispute_id}, intent)
            evidences = [{
                "evidence_type": "OTHER",
                "notes": json.dumps(draft)[:4000],
            }]
            result = pp.provide_dispute_evidence(dispute_id, evidences, request_id=str(uuid.uuid4()), cfg=cfg)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action kind {kind}")
    except pp.PayPalError as e:
        store.update_action(action_id, status="FAILED", approved_by=body.approved_by, result_payload={"error": e.message, "debug_id": e.debug_id})
        raise HTTPException(status_code=502, detail=f"PayPal execution failed: {e.message} (debug {e.debug_id})")

    updated = store.update_action(action_id, status="EXECUTED", approved_by=body.approved_by, result_payload=result)
    return {"action_id": action_id, "kind": kind, "status": "EXECUTED", "result": result, "action": updated}


@router.post("/actions/{action_id}/reject")
def reject_action(action_id: str, body: ApproveRequest | None = None):
    action = store.get_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Not found")
    if action.get("status") != "PENDING":
        raise HTTPException(status_code=409, detail=f"Action is {action.get('status')}, not PENDING")
    updated = store.update_action(action_id, status="REJECTED", approved_by=(body.approved_by if body else "analyst"))
    return {"action_id": action_id, "status": "REJECTED", "action": updated}
