"""Agent tools — read tools investigate, propose_* tools create PENDING
approval rows. NO tool in this module ever calls PayPal: the only code path
that touches PayPal money is POST /api/agent/actions/{id}/approve, and a
dedicated test asserts the refund path is unreachable from this loop."""
from __future__ import annotations

import json
import uuid
from typing import Any

from ..paypal.mapper import now_iso
from ..paypal import store

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_high_risk_transactions",
            "description": "List recent PayPal fulfilment intents and legacy transactions with their risk scores, highest first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "min_score": {"type": "number", "description": "Minimum risk score 0-1", "default": 0.6}
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_transaction_risk",
            "description": "Get the full risk record (score, level, signals, rules, evidence, fulfilment status) for one transaction or PayPal intent id.",
            "parameters": {
                "type": "object",
                "properties": {"txn_id": {"type": "string"}},
                "required": ["txn_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_capture",
            "description": "Propose capturing a held authorization (deliver the digital good). Requires human approval before any money moves.",
            "parameters": {
                "type": "object",
                "properties": {
                    "authorization_id": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["authorization_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_void",
            "description": "Propose voiding a held authorization before delivery (nothing ships, nothing to dispute). Requires human approval.",
            "parameters": {
                "type": "object",
                "properties": {
                    "authorization_id": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["authorization_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_refund",
            "description": "Propose refunding a captured payment. Requires human approval; the tool NEVER executes the refund.",
            "parameters": {
                "type": "object",
                "properties": {
                    "capture_id": {"type": "string"},
                    "amount": {"type": "string"},
                    "currency": {"type": "string", "default": "USD"},
                    "reason": {"type": "string"},
                },
                "required": ["capture_id", "amount"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "draft_dispute_evidence",
            "description": "Compile the FinShield decision trail (score, signals, rules, evidence) into a structured defence brief for one dispute.",
            "parameters": {
                "type": "object",
                "properties": {"dispute_id": {"type": "string"}},
                "required": ["dispute_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_disputes_and_events",
            "description": "List recent dispute events and human-approval queue items on file.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


def _risk_records() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for intent in store.list_intents(100):
        records.append({
            "txn_id": intent["id"],
            "paypal_order_id": intent.get("paypal_order_id"),
            "risk_score": intent.get("risk_score"),
            "risk_level": intent.get("risk_level"),
            "decision": intent.get("decision"),
            "status": intent.get("status"),
            "amount": intent.get("amount"),
            "currency": intent.get("currency"),
            "authorization_id": intent.get("authorization_id"),
            "capture_id": intent.get("capture_id"),
            "scenario": intent.get("scenario"),
        })
    try:
        from ..services import store as legacy

        for rec in legacy.list_all(100):
            score = rec.get("score") or {}
            txn = rec.get("transaction") or {}
            records.append({
                "txn_id": txn.get("transaction_id"),
                "risk_score": score.get("risk_score"),
                "risk_level": score.get("risk_level"),
                "status": "legacy-demo",
                "amount": txn.get("amount"),
                "currency": txn.get("currency", "INR"),
            })
    except Exception:
        pass
    return records


def _find_intent_for_auth(auth_id: str | None) -> dict[str, Any] | None:
    if not auth_id:
        return None
    for intent in store.list_intents(200):
        if intent.get("authorization_id") == auth_id:
            return intent
    return None


def _disputes_on_file() -> list[dict[str, Any]]:
    from ..paypal.router import _normalize_dispute_payload

    seen: set[str] = set()
    disputes: list[dict[str, Any]] = []
    for e in store.list_events(200):
        if str(e.get("event_type", "")).startswith("CUSTOMER.DISPUTE"):
            raw = e.get("payload")
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except Exception:
                    continue
            norm = _normalize_dispute_payload(raw)
            did = str(norm.get("dispute_id") or "")
            if did and did not in seen:
                seen.add(did)
                disputes.append(norm)
    return disputes


def propose(action: dict[str, Any]) -> dict[str, Any]:
    """Create a PENDING action row. The ONLY writer of executable actions."""
    kind = action["kind"]
    auth_id = action.get("authorization_id")
    cap_id = action.get("capture_id")
    dispute_id = action.get("dispute_id")
    for existing in store.list_actions(status="PENDING", limit=200):
        if (
            existing.get("kind") == kind
            and existing.get("authorization_id") == auth_id
            and existing.get("capture_id") == cap_id
            and existing.get("dispute_id") == dispute_id
        ):
            return {
                "proposal_id": existing["id"],
                "status": "PENDING",
                "approval_required": True,
                "message": "Proposal recorded. Nothing moves until a human approves it.",
            }

    record = {
        "id": f"ACT-{uuid.uuid4().hex[:10].upper()}",
        "kind": kind,
        "status": "PENDING",
        "authorization_id": auth_id,
        "capture_id": cap_id,
        "dispute_id": dispute_id,
        "amount": action.get("amount"),
        "currency": action.get("currency"),
        "reason": action.get("reason") or "",
        "proposed_by": action.get("proposed_by") or "agent",
        "created_at": now_iso(),
    }
    saved = store.save_action(record)
    return {
        "proposal_id": saved["id"],
        "status": "PENDING",
        "approval_required": True,
        "message": "Proposal recorded. Nothing moves until a human approves it.",
    }


def execute_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    args = args or {}
    if name == "list_high_risk_transactions":
        min_score = float(args.get("min_score", 0.6))
        rows = [r for r in _risk_records() if (r.get("risk_score") or 0) >= min_score]
        rows.sort(key=lambda r: r.get("risk_score") or 0, reverse=True)
        return {"count": len(rows), "transactions": rows[:20]}

    if name == "get_transaction_risk":
        txn_id = str(args.get("txn_id", ""))
        for r in _risk_records():
            if r["txn_id"] == txn_id or r.get("paypal_order_id") == txn_id:
                return r
        return {"error": f"no risk record for {txn_id}"}

    if name == "propose_capture":
        auth_id = args.get("authorization_id")
        intent = _find_intent_for_auth(auth_id)
        return propose({
            "kind": "CAPTURE",
            "authorization_id": auth_id,
            "amount": (intent or {}).get("amount"),
            "currency": (intent or {}).get("currency") or "USD",
            "reason": args.get("reason") or "Agent proposes capture after review",
        })

    if name == "propose_void":
        auth_id = args.get("authorization_id")
        intent = _find_intent_for_auth(auth_id)
        return propose({
            "kind": "VOID",
            "authorization_id": auth_id,
            "amount": (intent or {}).get("amount"),
            "currency": (intent or {}).get("currency") or "USD",
            "reason": args.get("reason") or "Agent proposes void before delivery",
        })

    if name == "propose_refund":
        return propose({
            "kind": "REFUND",
            "capture_id": args.get("capture_id"),
            "amount": args.get("amount"),
            "currency": args.get("currency", "USD"),
            "reason": args.get("reason") or "Agent proposes refund",
        })

    if name == "draft_dispute_evidence":
        from ..paypal.router import _linked_intent_for_dispute, build_evidence_draft

        dispute_id = str(args.get("dispute_id", ""))
        resource = next((d for d in _disputes_on_file() if d.get("dispute_id") == dispute_id), {"dispute_id": dispute_id})
        intent = _linked_intent_for_dispute(resource)
        if intent is None:
            intent = store.get_intent_by_order(dispute_id) or store.get_intent(dispute_id)
        return build_evidence_draft(resource, intent)

    if name == "list_disputes_and_events":
        disputes = _disputes_on_file()
        actions = store.list_actions(limit=50)
        return {
            "dispute_count": len(disputes),
            "disputes": disputes[:10],
            "pending_actions": len([a for a in actions if a.get("status") == "PENDING"]),
            "actions": actions[:10],
        }

    return {"error": f"unknown tool {name}"}
