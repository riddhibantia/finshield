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
            auth_id = action.get("authorization_id") or ""
            result = pp.capture_authorization(auth_id, request_id=str(uuid.uuid4()), cfg=cfg)
            from ..paypal.mapper import DECISION_AUTO_CAPTURE, capture_id as capture_id_of

            for i in store.list_intents(200):
                if i.get("authorization_id") == auth_id:
                    store.update_intent_status(
                        i["id"],
                        status="CAPTURED",
                        decision=DECISION_AUTO_CAPTURE,
                        capture_id=capture_id_of(result) or "",
                    )
                    break
        elif kind == "VOID":
            auth_id = action.get("authorization_id") or ""
            result = pp.void_authorization(auth_id, request_id=str(uuid.uuid4()), cfg=cfg)
            from ..paypal.mapper import DECISION_AUTO_VOID

            for i in store.list_intents(200):
                if i.get("authorization_id") == auth_id:
                    store.update_intent_status(i["id"], status="VOIDED", decision=DECISION_AUTO_VOID)
                    break
        elif kind == "REFUND":
            cap_id = action.get("capture_id") or ""
            result = pp.refund_capture(
                cap_id,
                amount=action.get("amount"),
                currency=action.get("currency") or "USD",
                note_to_payer=action.get("reason") or "Refund approved by FinShield analyst",
                request_id=str(uuid.uuid4()),
                cfg=cfg,
            )
            for i in store.list_intents(200):
                if i.get("capture_id") == cap_id:
                    store.update_intent_status(i["id"], status="REFUNDED")
                    break
        elif kind == "DISPUTE_EVIDENCE":
            from ..paypal.router import _linked_intent_for_dispute, _normalize_dispute_payload, build_evidence_draft

            dispute_id = action.get("dispute_id") or ""
            raw_event: dict[str, Any] | None = None
            dispute_res: dict[str, Any] = {"dispute_id": dispute_id}
            for e in store.list_events(200):
                if str(e.get("event_type", "")).startswith("CUSTOMER.DISPUTE"):
                    try:
                        parsed = json.loads(e["payload"])
                    except Exception:
                        continue
                    norm = _normalize_dispute_payload(parsed)
                    if norm.get("dispute_id") == dispute_id:
                        raw_event = parsed
                        dispute_res = norm
                        break

            intent = _linked_intent_for_dispute(dispute_res)
            draft = action.get("draft") or build_evidence_draft(dispute_res, intent)
            if isinstance(draft, str):
                try:
                    draft = json.loads(draft)
                except Exception:
                    pass
            evidences = [{
                "evidence_type": "OTHER",
                "notes": json.dumps(draft)[:4000],
            }]
            if raw_event and raw_event.get("simulate"):
                result = {
                    "status": "SIMULATED_EVIDENCE_SUBMITTED",
                    "simulated": True,
                    "dispute_id": dispute_id,
                    "intent_id": (intent or {}).get("id"),
                    "evidence_package": draft,
                }
            else:
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
