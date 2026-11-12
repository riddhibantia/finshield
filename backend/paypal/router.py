"""/api/paypal/* — fulfilment shield routes.

The buyer always completes PayPal checkout (intent AUTHORIZE). Scoring runs
AFTER authorization; the decision policy then auto-captures, holds (OTP or
analyst review) or auto-voids before any digital good is delivered.
"""
from __future__ import annotations

import json
import math
import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..schemas import Transaction
from . import client as pp
from . import store
from .mapper import (
    DECISION_AUTO_CAPTURE,
    DECISION_AUTO_VOID,
    SCENARIOS,
    FulfilmentContext,
    authorization_id,
    build_ctx,
    capture_id as capture_id_of,
    decide,
    evidence_for,
    now_iso,
    payer_from_authorize,
)
from .reasons import public_message, public_rules

router = APIRouter(prefix="/api/paypal", tags=["paypal"])

SDK_URLS = {
    "sandbox": "https://www.sandbox.paypal.com/web-sdk/v6/core",
    "stub": "https://www.sandbox.paypal.com/web-sdk/v6/core",
}

_DEMO_OTP = "123456"
_dispute_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
DISPUTE_CACHE_TTL = 60.0


class OrderRequest(BaseModel):
    scenario: str = "clean"
    amount: str | None = None
    currency: str | None = None
    user_id: str | None = None
    device_id: str | None = None
    email: str | None = None
    return_url: str | None = None


class VerifyRequest(BaseModel):
    otp: str


class ApproveRequest(BaseModel):
    action: str = Field(pattern="^(capture|void)$")
    approved_by: str = "analyst"


class ActionRequest(BaseModel):
    approved_by: str = "analyst"


def _score_with_fallback(txn: Transaction, ctx: dict):
    # deferred import avoids the main<->router import cycle
    from ..main import _score_with_fallback as _score

    return _score(txn, ctx)


def _cfg_or_503() -> pp.PayPalConfig:
    cfg = pp.get_config()
    if not cfg.usable():
        raise HTTPException(status_code=503, detail="PayPal credentials not configured (PAYPAL_CLIENT_ID/SECRET)")
    return cfg


def _txn_for(intent: dict[str, Any], fc: FulfilmentContext, payer: dict[str, str]) -> Transaction:
    base = SCENARIOS.get(fc.scenario, SCENARIOS["clean"])
    location = "400km from home" if float(base.get("distance_km", 0) or 0) >= 300 else "Home city"
    return Transaction(
        transaction_id=intent["id"],
        user_id=fc.user_id or f"PAYPAL-{payer.get('payer_id') or fc.email_hash[:10] or 'PAYER'}",
        amount=float(fc.amount),
        currency=fc.currency,
        timestamp=now_iso(),
        merchant="FinShield Digital Goods",
        merchant_category=base["merchant_category"],
        device_id=fc.device_id,
        location=location,
        velocity=int(base["recent_transaction_count"]),
        channel="PAYPAL",
        gateway="PayPal",
        raw_payload={"payer": payer, "scenario": fc.scenario},
    )


def _public_decision(intent: dict[str, Any], score: dict[str, Any], decision: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    amount = float(intent.get("amount") or 0)
    currency = intent.get("currency") or "USD"
    payload = {
        "intent_id": intent["id"],
        "paypal_order_id": intent.get("paypal_order_id"),
        "status": intent.get("status"),
        "decision": decision,
        "risk_score": score.get("risk_score"),
        "risk_level": score.get("risk_level"),
        "source": score.get("source"),
        "amount": intent.get("amount"),
        "currency": currency,
        "rules": public_rules(score.get("rules") or []),
        "rule_messages": [public_message(r) for r in (score.get("rules") or [])],
        "signals": score.get("signals") or [],
        "evidence": evidence_for(score, amount, currency),
        "scenarios_hint": {k: v["label"] for k, v in SCENARIOS.items()},
    }
    if extra:
        payload.update(extra)
    return payload


# ------------------------------------------------------------------ config


@router.get("/config")
def paypal_config():
    cfg = pp.get_config()
    return {
        "client_id": cfg.client_id if cfg.env == "sandbox" else "stub-client-id",
        "environment": cfg.env,
        "sdk_url": SDK_URLS.get(cfg.env, SDK_URLS["sandbox"]),
        "enabled": cfg.usable(),
    }


# ------------------------------------------------------------------ orders


@router.post("/orders")
def create_order(body: OrderRequest):
    cfg = _cfg_or_503()
    scenario = body.scenario if body.scenario in SCENARIOS else "clean"
    base = SCENARIOS[scenario]
    raw_amount = body.amount if (body.amount is not None and str(body.amount).strip() != "") else base["amount"]
    currency = (body.currency or base["currency"]).upper()
    try:
        amt_val = float(raw_amount)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="amount must be a positive decimal like 42.00")
    if not math.isfinite(amt_val) or amt_val <= 0:
        raise HTTPException(status_code=400, detail="amount must be a positive decimal greater than 0")
    amount = f"{amt_val:.2f}"

    return_url = body.return_url or ""
    cancel_base = return_url.split("?")[0] if return_url else ""
    cancel_url = f"{cancel_base}?cancelled=1" if cancel_base else ""

    try:
        order = pp.create_order(
            amount,
            currency,
            intent="AUTHORIZE",
            description=f"FinShield digital good ({base['label']})",
            custom_id=f"finshield-{scenario}",
            application_context={
                "user_action": "PAY_NOW",
                "shipping_preference": "NO_SHIPPING",
                "return_url": return_url,
                "cancel_url": cancel_url,
            },
        )
    except pp.PayPalError as e:
        raise HTTPException(status_code=502, detail=f"PayPal order create failed: {e.message} (debug {e.debug_id})")

    intent_id = f"PP-{order['id']}"
    record = {
        "id": intent_id,
        "transaction_id": intent_id,
        "status": "ORDER_CREATED",
        "amount": amount,
        "currency": currency,
        "paypal_order_id": order["id"],
        "scenario": scenario,
        "request_payload": body.model_dump(),
        "created_at": now_iso(),
    }
    store.save_intent(record)
    approve_url = next((l["href"] for l in order.get("links", []) if l.get("rel") == "approve"), "")
    if approve_url and "useraction=" not in approve_url:
        # useraction=commit shows the one-click Pay screen instead of the
        # multi-step review flow — fewer clicks, and it works everywhere.
        approve_url += "&useraction=commit"
    return {
        "intent_id": intent_id,
        "paypal_order_id": order["id"],
        "status": order["status"],
        "amount": amount,
        "currency": currency,
        "scenario": scenario,
        "scenario_label": base["label"],
        "intent": "AUTHORIZE",
        "approve_url": approve_url,
    }


@router.post("/orders/{order_id}/authorize")
def authorize_order(order_id: str, body: dict[str, Any] | None = None):
    cfg = _cfg_or_503()
    intent = store.get_intent_by_order(order_id)
    if not intent:
        raise HTTPException(status_code=404, detail="Unknown paypal order — create it via POST /api/paypal/orders first")
    if intent.get("status") != "ORDER_CREATED":
        raise HTTPException(status_code=409, detail=f"Intent already {intent.get('status')}")

    body = body or {}
    scenario = intent.get("scenario") or "clean"
    base = SCENARIOS.get(scenario, SCENARIOS["clean"])

    try:
        auth_resp = pp.authorize_order(order_id, request_id=str(uuid.uuid4()))
    except pp.PayPalError as e:
        store.update_intent_status(intent["id"], status="FAILED")
        raise HTTPException(status_code=502, detail=f"PayPal authorize failed: {e.message} (debug {e.debug_id}) — order must be buyer-approved first")

    auth_id = authorization_id(auth_resp)
    payer = payer_from_authorize(auth_resp)
    fc = FulfilmentContext(
        scenario=scenario,
        amount=intent["amount"],
        currency=intent["currency"],
        device_id=body.get("device_id") or ("DEV-NEW-PAYPAL" if base.get("is_new_device") else "DEV-KNOWN-PAYPAL"),
        user_id=body.get("user_id") or "",
        email_hash=body.get("email_hash") or payer.get("email") or "",
        payer_country=payer.get("country") or "",
        custom_id=order_id,
    )

    txn = _txn_for(intent, fc, payer)
    ctx = build_ctx(fc)
    score = _score_with_fallback(txn, ctx)
    score_dict = score.model_dump()
    decision = decide(score_dict["risk_level"])

    extra: dict[str, Any] = {"authorization_id": auth_id, "buyer": payer}
    if decision == DECISION_AUTO_CAPTURE:
        try:
            cap = pp.capture_authorization(auth_id, request_id=str(uuid.uuid4()))
            extra["capture_id"] = capture_id_of(cap) or ""
            extra["capture_status"] = cap.get("status")
            status = "CAPTURED"
        except pp.PayPalError as e:
            status = "AUTHORIZED"
            extra["auto_capture_error"] = f"{e.message} (debug {e.debug_id})"
    elif decision == DECISION_AUTO_VOID:
        try:
            void = pp.void_authorization(auth_id, request_id=str(uuid.uuid4()))
            extra["void_status"] = void.get("status", "VOIDED")
            status = "VOIDED"
        except pp.PayPalError as e:
            status = "AUTHORIZED"
            extra["auto_void_error"] = f"{e.message} (debug {e.debug_id})"
    elif decision == "HOLD_STEP_UP":
        status = "HELD_STEP_UP"
    else:
        status = "HELD_REVIEW"

    score_payload = dict(score_dict)
    score_payload["_telemetry"] = {
        "buyer": payer,
        "device_id": fc.device_id,
        "location": txn.location,
        "velocity": txn.velocity,
        "merchant_category": txn.merchant_category,
    }

    store.update_intent_status(
        intent["id"],
        status=status,
        decision=decision,
        risk_score=score_dict["risk_score"],
        risk_level=score_dict["risk_level"],
        authorization_id=auth_id,
        capture_id=extra.get("capture_id"),
        score_payload=score_payload,
    )
    updated = store.get_intent(intent["id"]) or intent
    return _public_decision(updated, score_dict, decision, extra)


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: str):
    intent = store.get_intent_by_order(order_id) or store.get_intent(order_id)
    if not intent:
        raise HTTPException(status_code=404, detail="Unknown paypal order")
    current = intent.get("status")
    if current in ("ORDER_CREATED", "CANCELLED"):
        updated = store.update_intent_status(intent["id"], status="CANCELLED") or intent
        return {
            "intent_id": updated["id"],
            "paypal_order_id": updated.get("paypal_order_id"),
            "status": "CANCELLED",
        }
    return {
        "intent_id": intent["id"],
        "paypal_order_id": intent.get("paypal_order_id"),
        "status": current,
    }


# ------------------------------------------------------------------ intents


@router.get("/intents")
def list_intents(limit: int = 50):
    return {"intents": store.list_intents(limit)}


@router.get("/intents/{intent_id}")
def get_intent(intent_id: str):
    intent = store.get_intent(intent_id)
    if not intent:
        raise HTTPException(status_code=404, detail="Not found")
    return intent


@router.post("/intents/{intent_id}/verify")
def verify_step_up(intent_id: str, body: VerifyRequest):
    intent = store.get_intent(intent_id)
    if not intent:
        raise HTTPException(status_code=404, detail="Not found")
    if intent.get("status") != "HELD_STEP_UP":
        raise HTTPException(status_code=409, detail=f"Intent is {intent.get('status')}, not awaiting step-up")
    cfg = _cfg_or_503()
    auth_id = intent.get("authorization_id")
    if not auth_id:
        raise HTTPException(status_code=409, detail="No authorization on intent")
    if body.otp != _DEMO_OTP:
        # step-up failed -> void before delivery (plan: pass -> capture, fail -> void)
        result = _execute(intent, "void", approved_by="step-up-failed")
        return {"intent_id": intent_id, "verified": False, "result": result}
    return _execute(intent, "capture", approved_by="step-up-otp")


@router.post("/intents/{intent_id}/approve")
def analyst_approve(intent_id: str, body: ApproveRequest):
    intent = store.get_intent(intent_id)
    if not intent:
        raise HTTPException(status_code=404, detail="Not found")
    if intent.get("status") not in ("HELD_REVIEW", "HELD_STEP_UP", "AUTHORIZED"):
        raise HTTPException(status_code=409, detail=f"Intent is {intent.get('status')} — nothing to approve")
    return _execute(intent, body.action, approved_by=body.approved_by)


def _execute(intent: dict[str, Any], action: str, approved_by: str = "analyst") -> dict[str, Any]:
    cfg = _cfg_or_503()
    auth_id = intent.get("authorization_id")
    if not auth_id:
        raise HTTPException(status_code=409, detail="No authorization to act on")
    try:
        if action == "capture":
            cap = pp.capture_authorization(auth_id, request_id=str(uuid.uuid4()))
            updated = store.update_intent_status(
                intent["id"], status="CAPTURED", decision=DECISION_AUTO_CAPTURE,
                capture_id=capture_id_of(cap) or "",
            )
            return {"intent_id": intent["id"], "action": "capture", "capture_id": cap.get("id"), "status": cap.get("status"), "intent": updated}
        void = pp.void_authorization(auth_id, request_id=str(uuid.uuid4()))
        updated = store.update_intent_status(intent["id"], status="VOIDED", decision=DECISION_AUTO_VOID)
        return {"intent_id": intent["id"], "action": "void", "void_status": void.get("status", "VOIDED"), "intent": updated}
    except pp.PayPalError as e:
        raise HTTPException(status_code=502, detail=f"PayPal {action} failed: {e.message} (debug {e.debug_id})")


@router.post("/authorizations/{auth_id}/capture")
def manual_capture(auth_id: str, body: ActionRequest | None = None):
    intent = store.get_intent_by_order(auth_id) or store.get_intent(f"PP-{auth_id}")
    if not intent:
        raise HTTPException(status_code=404, detail="No intent for this authorization")
    return _execute(intent, "capture", approved_by=(body.approved_by if body else "analyst"))


@router.post("/authorizations/{auth_id}/void")
def manual_void(auth_id: str, body: ActionRequest | None = None):
    intent = store.get_intent_by_order(auth_id) or store.get_intent(f"PP-{auth_id}")
    if not intent:
        raise HTTPException(status_code=404, detail="No intent for this authorization")
    return _execute(intent, "void", approved_by=(body.approved_by if body else "analyst"))


# ------------------------------------------------------------------ disputes


def _disputes_cached(cfg: pp.PayPalConfig) -> list[dict[str, Any]]:
    now = time.time()
    cached = _dispute_cache.get("list")
    if cached and cached[0] > now - DISPUTE_CACHE_TTL:
        return cached[1]
    try:
        disputes = pp.list_disputes(cfg=cfg)
    except pp.PayPalError:
        disputes = []
    _dispute_cache["list"] = (now, disputes)
    return disputes


def _normalize_dispute_payload(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    if isinstance(raw.get("resource"), dict) and raw["resource"].get("dispute_id"):
        res = dict(raw["resource"])
        if raw.get("simulate") and "simulate" not in res:
            res["simulate"] = True
        return res
    return raw


@router.get("/disputes")
def list_disputes():
    cfg = _cfg_or_503()
    live = _disputes_cached(cfg)
    simulated = [
        _normalize_dispute_payload(json.loads(e["payload"]))
        for e in store.list_events(200)
        if e["event_type"].startswith("CUSTOMER.DISPUTE")
    ]
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for d in simulated + live:
        did = d.get("dispute_id") or d.get("id") or ""
        if did and did not in seen:
            seen.add(did)
            out.append(d)
    return {"disputes": out}


@router.get("/disputes/{dispute_id}")
def get_dispute(dispute_id: str):
    cfg = _cfg_or_503()
    for e in store.list_events(200):
        if e["event_type"].startswith("CUSTOMER.DISPUTE"):
            payload = _normalize_dispute_payload(json.loads(e["payload"]))
            if payload.get("dispute_id") == dispute_id:
                return payload
    try:
        return pp.get_dispute(dispute_id, cfg=cfg)
    except pp.PayPalError as e:
        raise HTTPException(status_code=502, detail=f"PayPal dispute fetch failed: {e.message}")


def _linked_intent_for_dispute(resource: dict[str, Any]) -> dict[str, Any] | None:
    capture_id = (resource.get("sale_id") or resource.get("capture_id") or "").strip()
    if not capture_id:
        txns = resource.get("dispute_transactions") or []
        if txns:
            capture_id = (txns[0].get("seller_transaction_id") or txns[0].get("transaction_id") or "").strip()
    if capture_id:
        for intent in store.list_intents(200):
            if intent.get("capture_id") == capture_id:
                return intent
    amount = (resource.get("disputed_amount") or {}).get("value")
    currency = (resource.get("disputed_amount") or {}).get("currency_code")
    if amount and currency:
        for intent in store.list_intents(200):
            if intent.get("amount") == amount and intent.get("currency") == currency:
                return intent
    return None


def build_evidence_draft(dispute: dict[str, Any], intent: dict[str, Any] | None) -> dict[str, Any]:
    """Structured defence brief from the decision trail — the raw material
    merchants lose disputes for lacking. Deterministic; the agent wraps it
    in narrative when an LLM key is configured."""
    if intent is None:
        return {
            "dispute_id": dispute.get("dispute_id"),
            "summary": "No matching FinShield decision trail found for this dispute — evidence unavailable.",
            "sections": [],
        }
    score = intent.get("score_payload") or {}
    if isinstance(score, str):
        try:
            score = json.loads(score)
        except Exception:
            score = {}
    amount = float(intent.get("amount") or 0)
    currency = intent.get("currency") or "USD"
    sections = [
        {
            "title": "Transaction integrity",
            "points": [
                f"Risk score {score.get('risk_score')} ({score.get('risk_level')}) at authorization time, engine source {score.get('source')}",
                f"Order {intent.get('paypal_order_id')} authorized then {intent.get('status').lower() if intent.get('status') else 'recorded'} before fulfilment",
                f"Amount {amount:,.2f} {currency}, scenario profile {intent.get('scenario')}",
            ],
        },
        {
            "title": "Signals at authorization",
            "points": [f"{s.get('name')}: {s.get('value')} (contribution {s.get('contribution')})" for s in (score.get("signals") or [])],
        },
        {
            "title": "Policy triggers",
            "points": [public_message(r) for r in (score.get("rules") or [])] or ["No rule triggers recorded — amount and behaviour within profile"],
        },
        {
            "title": "Evidence trail",
            "points": evidence_for(score, amount, currency),
        },
    ]
    return {
        "dispute_id": dispute.get("dispute_id"),
        "intent_id": intent.get("id"),
        "summary": (
            f"FinShield decision trail for order {intent.get('paypal_order_id')}: the buyer completed PayPal checkout, "
            f"funds were authorized, the risk engine scored {score.get('risk_score')} ({score.get('risk_level')}) and the "
            f"fulfilment decision '{intent.get('decision')}' executed before delivery. This brief compiles the full "
            f"authorization-time evidence package for the dispute response."
        ),
        "sections": sections,
    }


@router.post("/disputes/{dispute_id}/draft")
def draft_dispute_evidence(dispute_id: str):
    cfg = _cfg_or_503()
    resource: dict[str, Any] | None = None
    for e in store.list_events(200):
        if e["event_type"].startswith("CUSTOMER.DISPUTE"):
            payload = json.loads(e["payload"])
            cand = payload.get("resource", {}) if isinstance(payload, dict) else {}
            if (cand.get("dispute_id") or payload.get("dispute_id")) == dispute_id:
                resource = cand or payload
                break
    if resource is None:
        try:
            dispute = pp.get_dispute(dispute_id, cfg=cfg)
        except pp.PayPalError:
            dispute = None
        resource = dispute or {"dispute_id": dispute_id}
        if isinstance(resource, dict) and not resource.get("dispute_id") and isinstance(resource.get("resource"), dict):
            resource = resource["resource"]
    intent = _linked_intent_for_dispute(resource)
    return build_evidence_draft(resource, intent)


@router.post("/disputes/simulate")
def simulate_dispute(body: dict[str, Any] | None = None):
    """Sandbox buyers cannot file disputes from the UI, so the demo injects a
    realistic CUSTOMER.DISPUTE.CREATED payload into the real webhook pipeline."""
    body = body or {}
    intent = None
    if body.get("intent_id"):
        intent = store.get_intent(body["intent_id"])
    if intent is None:
        captured = [i for i in store.list_intents(50) if i.get("capture_id")]
        intent = captured[0] if captured else (store.list_intents(1) or [None])[0]

    currency = (intent or {}).get("currency") or "USD"
    amount = (intent or {}).get("amount") or "220.00"
    dispute_id = body.get("dispute_id") or f"PP-D-{uuid.uuid4().hex[:10].upper()}"
    event = {
        "id": f"WH-{uuid.uuid4().hex[:12].upper()}",
        "event_version": "1.0",
        "time_created": now_iso(),
        "event_type": "CUSTOMER.DISPUTE.CREATED",
        "resource_type": "dispute",
        "resource_version": 2.0,
        "summary": "Dispute created for a digital-goods purchase",
        "resource": {
            "dispute_id": dispute_id,
            "status": "WAITING_FOR_SELLER_RESPONSE",
            "reason": body.get("reason") or "MERCHANDISE_NOT_RECEIVED",
            "dispute_state": "WAITING_FOR_SELLER_RESPONSE",
            "disputed_amount": {"currency_code": currency, "value": amount},
            "sale_id": (intent or {}).get("capture_id") or "",
            "seller_response_due_date": now_iso(),
            "communication_details": {},
            "evidence": {"evidence_info": []},
            "buyer": {"name": "Sandbox Buyer", "email": "buyer@example.com"},
        },
        "simulate": True,
    }
    outcome = _process_event(event, verified=True)
    return {"simulated": True, "event_id": event["id"], "dispute_id": dispute_id, "outcome": outcome}


# ------------------------------------------------------------------ webhooks


def _process_event(event: dict[str, Any], verified: bool) -> dict[str, Any]:
    event_type = event.get("event_type", "")
    resource = event.get("resource") or {}
    resource_id = resource.get("id") or resource.get("dispute_id") or ""

    fresh = store.save_event(event.get("id") or f"WH-{uuid.uuid4().hex[:10]}", event_type, resource_id, event, verified)
    if not fresh:
        return {"status": "duplicate"}

    if event_type == "PAYMENT.CAPTURE.COMPLETED":
        for intent in store.list_intents(200):
            if intent.get("capture_id") == resource_id:
                store.update_intent_status(intent["id"], status="CAPTURED")
                return {"status": "processed", "intent_id": intent["id"], "effect": "CAPTURED"}
        return {"status": "processed", "effect": "capture-recorded"}

    if event_type == "PAYMENT.CAPTURE.REFUNDED":
        for intent in store.list_intents(200):
            if intent.get("capture_id") == resource_id:
                store.update_intent_status(intent["id"], status="REFUNDED")
                return {"status": "processed", "intent_id": intent["id"], "effect": "REFUNDED"}
        return {"status": "processed", "effect": "refund-recorded"}

    if event_type.startswith("CUSTOMER.DISPUTE."):
        intent = _linked_intent_for_dispute(resource)
        if event_type == "CUSTOMER.DISPUTE.CREATED":
            store.save_action({
                "id": f"ACT-{uuid.uuid4().hex[:10].upper()}",
                "kind": "DISPUTE_EVIDENCE",
                "status": "PENDING",
                "dispute_id": resource.get("dispute_id") or resource_id,
                "amount": (resource.get("disputed_amount") or {}).get("value"),
                "currency": (resource.get("disputed_amount") or {}).get("currency_code"),
                "reason": f"Dispute {resource.get('reason')} — draft evidence for merchant response",
                "proposed_by": "system",
                "created_at": now_iso(),
            })
        return {
            "status": "processed",
            "effect": f"dispute-{event_type.split('.')[-1].lower()}",
            "intent_id": (intent or {}).get("id"),
        }

    return {"status": "processed", "effect": "ignored"}


@router.post("/webhooks")
async def paypal_webhook(request: Request):
    """Raw-body PayPal webhook receiver with signature verification and
    event dedupe. Always returns 200 so PayPal does not storm retries."""
    raw = await request.body()
    try:
        event = json.loads(raw or b"{}")
    except json.JSONDecodeError:
        return {"status": "ignored", "reason": "invalid json"}

    cfg = pp.get_config()
    allow_unverified = __import__("os").getenv("PAYPAL_WEBHOOK_ALLOW_UNVERIFIED", "0") == "1"
    headers = {
        "auth_algo": request.headers.get("PayPal-Auth-Algo", ""),
        "cert_url": request.headers.get("PayPal-Cert-Url", ""),
        "transmission_id": request.headers.get("PayPal-Transmission-Id", ""),
        "transmission_sig": request.headers.get("PayPal-Transmission-Sig", ""),
        "transmission_time": request.headers.get("PayPal-Transmission-Time", ""),
    }
    verified = pp.verify_webhook_signature(headers, event, cfg=cfg)
    if not verified and not allow_unverified and not event.get("simulate"):
        # log-only handling: accept the delivery but mark unverified so PayPal
        # does not retry-storm; the event is visible in /api/paypal/events
        store.save_event(event.get("id") or f"WH-{uuid.uuid4().hex[:10]}", event.get("event_type", "UNKNOWN"), "", event, False)
        return {"status": "unverified-logged"}

    outcome = _process_event(event, verified=verified)
    return {"status": outcome.get("status"), "outcome": outcome}


@router.get("/events")
def list_events(limit: int = 100):
    return {"events": store.list_events(limit)}
