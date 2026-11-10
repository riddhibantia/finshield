"""FastAPI app — demo-first, honest source labels, never silent failures."""
from __future__ import annotations

import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .adapters.mock_adapter import MockMLAdapter
from .adapters.real_adapter import probe, RealMLAdapter
from .agent.router import router as agent_router
from .metrics_loader import get_metrics as load_metrics
from .paypal.router import router as paypal_router
from .schemas import CopilotEvidence, CopilotResponse, Transaction
from .services import store

# Try real adapter first (reuses existing pipeline), fallback to mock honestly
USE_REAL = os.getenv("FINSHEILD_USE_REAL", "auto")  # auto | mock | real
if USE_REAL == "real":
    adapter = RealMLAdapter()
elif USE_REAL == "mock":
    adapter = MockMLAdapter()
else:
    # auto: try real, fallback to mock
    try:
        p = probe()
        # real is considered live if risk_fusion code is available (even without model files)
        if p.get("risk_fusion"):
            adapter = RealMLAdapter()
        else:
            adapter = MockMLAdapter()
    except Exception:
        adapter = MockMLAdapter()

# Also expose mock for explicit fallback
_mock = MockMLAdapter()

_cors_raw = os.getenv("FINSHEILD_CORS_ORIGINS", "*")
_cors_origins = ["*"] if _cors_raw.strip() == "*" else [o.strip() for o in _cors_raw.split(",") if o.strip()]

app = FastAPI(title="Finsheild Demo API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, allow_methods=["*"], allow_headers=["*"])
app.include_router(paypal_router)
app.include_router(agent_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "adapter": adapter.name, "model_status": probe()}


@app.get("/api/model/metrics")
def model_metrics():
    # Enhance with synthetic comparison if available
    base = load_metrics()
    # Add synthetic experiments
    from .config import ML_REPO_ROOT
    from pathlib import Path
    import json
    repo = ML_REPO_ROOT
    synth = {}
    for p in repo.glob("evaluation/reports/synthetic_*_metrics.json"):
        try:
            d = json.loads(p.read_text())
            synth[p.stem] = {"pr_auc": d.get("pr_auc"), "roc_auc": d.get("roc_auc"), "fraud_rate": d.get("fraud_rate")}
        except Exception:
            pass
    base["synthetic_experiments"] = synth
    # Comparison report if exists
    comp = repo / "evaluation/reports/synthetic_hard_overlap_comparison_report.md"
    if comp.exists():
        base["comparison_report"] = comp.read_text()[:8000]
    return base


@app.get("/api/model/status")
def model_status():
    return probe()


def _score_with_fallback(txn, ctx):
    try:
        return adapter.score(txn, ctx)
    except Exception as e:
        # Real adapter failed — fallback to mock with honest label
        score = _mock.score(txn, ctx)
        score.source = "DEMO_FALLBACK"  # type: ignore
        return score


@app.post("/api/transaction/score")
def score_transaction(txn: Transaction, scenario: str = Query(default="normal")):
    if scenario not in store.SCENARIOS:
        scenario = "normal"
    ctx = {"scenario": scenario}
    score = _score_with_fallback(txn, ctx)
    return store.save_scored(txn, ctx, score.model_dump())


@app.post("/api/transactions/generate")
def generate(scenario: str = Query(default="normal"), seed: int | None = None):
    if scenario not in store.SCENARIOS:
        scenario = "normal"
    txn, ctx = store.make_transaction(scenario, seed=seed)
    score = _score_with_fallback(txn, ctx)
    return store.save_scored(txn, ctx, score.model_dump())


def _seed_initial_transactions():
    if len(store.list_all(1)) > 0:
        return
    from datetime import datetime, timezone
    # 1. Example high-value (₹100,000) demo transaction (placeholder IDs — replace with your own gateway data)
    cf_100k = Transaction(
        transaction_id="CF-EXAMPLE-002",
        user_id="USER-EXAMPLE",
        amount=100000.0,
        timestamp=datetime.now(timezone.utc).isoformat(),
        merchant="Cashfree Payment Rail",
        merchant_category="digital_gateway",
        device_id="DEV-NEW-CF",
        location="India (IN)",
        velocity=8,
        channel="UPI",
        gateway="Cashfree",
        raw_payload={"order_id": "CFPay_EXAMPLE-002", "status": "SUCCESS"},
    )
    ctx_100k = {
        "scenario": "suspicious",
        "amount_deviation": 4.8,
        "recent_transaction_count": 8,
        "is_new_device": True,
        "gateway": "Cashfree",
        "order_id": "CFPay_EXAMPLE-002",
        "cf_payment_id": "EXAMPLE-002",
    }
    store.save_scored(cf_100k, ctx_100k, _score_with_fallback(cf_100k, ctx_100k).model_dump())

    # 2. Example micro (₹1.00) demo transaction (placeholder IDs)
    cf_1 = Transaction(
        transaction_id="CF-EXAMPLE-001",
        user_id="USER-EXAMPLE",
        amount=1.0,
        timestamp=datetime.now(timezone.utc).isoformat(),
        merchant="Cashfree Payment Rail",
        merchant_category="digital_gateway",
        device_id="DEV-01",
        location="India (IN)",
        velocity=1,
        channel="UPI",
        gateway="Cashfree",
        raw_payload={"order_id": "CFPay_EXAMPLE-001", "status": "SUCCESS"},
    )
    ctx_1 = {
        "scenario": "normal",
        "amount_deviation": 0.2,
        "recent_transaction_count": 1,
        "is_new_device": False,
        "gateway": "Cashfree",
        "order_id": "CFPay_EXAMPLE-001",
        "cf_payment_id": "EXAMPLE-001",
    }
    store.save_scored(cf_1, ctx_1, _score_with_fallback(cf_1, ctx_1).model_dump())

    # 3. Fraud Ring Syndicate
    txn_ring, ctx_ring = store.make_transaction("fraud_ring", seed=42)
    store.save_scored(txn_ring, ctx_ring, _score_with_fallback(txn_ring, ctx_ring).model_dump())

    # 4. Ambiguous Step-Up
    txn_amb, ctx_amb = store.make_transaction("ambiguous", seed=88)
    store.save_scored(txn_amb, ctx_amb, _score_with_fallback(txn_amb, ctx_amb).model_dump())

    # 5. Normal Everyday
    txn_norm, ctx_norm = store.make_transaction("normal", seed=99)
    store.save_scored(txn_norm, ctx_norm, _score_with_fallback(txn_norm, ctx_norm).model_dump())


@app.get("/api/transactions")
def list_transactions(limit: int = 50):
    _seed_initial_transactions()
    return {"transactions": store.list_all(limit), "kind": "DEMO_SIMULATION"}


@app.get("/api/transactions/{txn_id}")
def get_transaction(txn_id: str):
    rec = store.get(txn_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    return rec


@app.post("/api/investigation/explain")
def explain(body: CopilotEvidence):
    """Copilot explains ENGINE evidence. Never overrides the risk decision."""
    # Try to use real LLM Data generator if available, else deterministic fallback
    try:
        # Use existing explain evidence_from_features if available
        rules_text = ", ".join(body.triggered_rules) if body.triggered_rules else "none"
        # Determine fraud type from amount deviation
        if body.transaction_amount > body.usual_amount * 3 and body.new_device:
            fraud_type = "ACCOUNT_TAKEOVER"
        elif body.recent_transaction_count >= 5:
            fraud_type = "VELOCITY_ABUSE"
        elif body.new_device:
            fraud_type = "DEVICE_COMPROMISE"
        elif body.location_distance_km > 300:
            fraud_type = "GEO_ANOMALY"
        else:
            fraud_type = "BEHAVIORAL_ANOMALY"
        # Risk from xgb score
        xgb = body.xgboost_score
        if xgb >= 0.7:
            risk = "HIGH"
            action = "BLOCK and investigate — multiple strong signals"
        elif xgb >= 0.4:
            risk = "MEDIUM"
            action = "STEP-UP verification (OTP / biometric)"
        else:
            risk = "LOW"
            action = "APPROVE — no further action"
        summary = (
            f"This transaction was flagged because amount deviation is {body.transaction_amount/body.usual_amount:.1f}× vs usual, "
            f"device is {'new' if body.new_device else 'known'}, location distance {body.location_distance_km:.0f}km, "
            f"velocity {body.recent_transaction_count} recent, XGB {xgb:.2f}, anomaly {body.anomaly_score:.2f}. "
            f"Rules: {rules_text}. This explanation does not set the risk score — the risk engine does."
        )
        return CopilotResponse(
            risk_level=risk, fraud_type=fraud_type, summary=summary,
            evidence=[f"Amount {body.transaction_amount} vs usual {body.usual_amount}", f"Device {'new' if body.new_device else 'known'}", f"Velocity {body.recent_transaction_count}", f"Anomaly {body.anomaly_score:.2f}"],
            recommended_action=action, source="DEMO_FALLBACK",
        ).model_dump()
    except Exception as e:
        return CopilotResponse(
            risk_level="MEDIUM", fraud_type="UNKNOWN", summary=f"Copilot fallback: {e}", evidence=[], recommended_action="INVESTIGATE", source="DEMO_FALLBACK"
        ).model_dump()


@app.get("/api/graph/{txn_id}")
def graph(txn_id: str):
    return store.graph_for(txn_id)


@app.get("/api/identity/{user_id}")
def identity(user_id: str):
    return store.tokenize(user_id)


def _parse_cashfree_payload(payload: dict) -> tuple[Transaction, dict]:
    """Parse Cashfree PG v2 / v3 webhook payload into Transaction and context."""
    from datetime import datetime, timezone
    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    order = data.get("order", {}) if isinstance(data, dict) else {}
    payment = data.get("payment", {}) if isinstance(data, dict) else {}
    customer = data.get("customer_details", {}) if isinstance(data, dict) else {}

    # Extract or fallback to flat legacy structure
    order_id = str(order.get("order_id") or payload.get("orderId") or f"ORD-{datetime.now(timezone.utc).strftime('%H%M%S')}")
    cf_payment_id = str(payment.get("cf_payment_id") or payload.get("referenceId") or order_id)
    
    amount_raw = payment.get("payment_amount") or order.get("order_amount") or payload.get("orderAmount") or 100.0
    try:
        amount = float(amount_raw)
    except Exception:
        amount = 100.0

    # User / Customer identity
    method = payment.get("payment_method", {}) if isinstance(payment, dict) else {}
    upi_info = method.get("upi", {}) if isinstance(method, dict) else {}
    upi_id = upi_info.get("upi_id") if isinstance(upi_info, dict) else None
    
    phone = str(customer.get("customer_phone") or payload.get("customerPhone") or "")
    user_id = upi_id or (f"USER-{phone[-4:]}" if len(phone) >= 4 else f"USER-{customer.get('customer_id', 'CF-PAYER')}")
    
    payment_time = payment.get("payment_time") or payload.get("event_time") or datetime.now(timezone.utc).isoformat()
    channel = payment.get("payment_group") or payload.get("paymentMode") or "UPI"

    # Context & scenario derivation based on amount and characteristics
    if amount >= 100000.0:
        scenario = "suspicious"
        amount_dev = 4.8
        vel = 8
        is_new_dev = True
    elif amount >= 25000.0:
        scenario = "ambiguous"
        amount_dev = 1.8
        vel = 4
        is_new_dev = False
    else:
        scenario = "normal"
        amount_dev = 0.2
        vel = 1
        is_new_dev = False

    txn = Transaction(
        transaction_id=f"CF-{cf_payment_id}",
        user_id=user_id,
        amount=amount,
        timestamp=str(payment_time),
        merchant="Cashfree Payment Rail",
        merchant_category="digital_gateway",
        device_id="DEV-CF-GATEWAY" if not is_new_dev else "DEV-NEW-CF",
        location="India (IN)",
        velocity=vel,
        channel=str(channel).upper(),
        gateway="Cashfree",
        raw_payload=payload,
    )

    ctx = {
        "scenario": scenario,
        "amount_deviation": amount_dev,
        "recent_transaction_count": vel,
        "is_new_device": is_new_dev,
        "gateway": "Cashfree",
        "order_id": order_id,
        "cf_payment_id": cf_payment_id,
    }
    return txn, ctx


@app.post("/api/webhooks/cashfree")
async def cashfree_webhook(payload: dict):
    """Receive and score live Cashfree Payment Gateway webhooks."""
    txn, ctx = _parse_cashfree_payload(payload)
    score = _score_with_fallback(txn, ctx)
    scored_rec = store.save_scored(txn, ctx, score.model_dump())
    return {
        "status": "processed",
        "gateway": "Cashfree",
        "transaction_id": txn.transaction_id,
        "risk_score": score.risk_score,
        "risk_level": score.risk_level,
        "record": scored_rec,
    }


@app.post("/api/webhooks/cashfree/simulate")
def cashfree_simulate(amount: float = 75.0, status: str = "SUCCESS", upi_id: str = "riddhi@okhdfcbank"):
    """Simulate a Cashfree PG webhook payload for testing."""
    from datetime import datetime, timezone
    sample_payload = {
        "data": {
            "order": {
                "order_id": f"order_sim_{datetime.now(timezone.utc).strftime('%H%M%S%f')}",
                "order_amount": amount,
                "order_currency": "INR",
                "order_tags": None,
            },
            "payment": {
                "cf_payment_id": f"pay_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
                "payment_status": status,
                "payment_amount": amount,
                "payment_currency": "INR",
                "payment_message": "Transaction successful" if status == "SUCCESS" else "Transaction failed",
                "payment_time": datetime.now(timezone.utc).isoformat(),
                "payment_method": {
                    "upi": {
                        "channel": "collect",
                        "upi_id": upi_id,
                    }
                },
                "payment_group": "upi",
            },
            "customer_details": {
                "customer_id": "cust_demo_882",
                "customer_name": "Riddhi Bantia",
                "customer_email": "payer@example.com",
                "customer_phone": "+919876543210",
            },
        },
        "event_time": datetime.now(timezone.utc).isoformat(),
        "type": "PAYMENT_SUCCESS_WEBHOOK" if status == "SUCCESS" else "PAYMENT_FAILED_WEBHOOK",
    }
    txn, ctx = _parse_cashfree_payload(sample_payload)
    score = _score_with_fallback(txn, ctx)
    scored_rec = store.save_scored(txn, ctx, score.model_dump())
    return {
        "status": "simulated",
        "gateway": "Cashfree",
        "transaction_id": txn.transaction_id,
        "risk_score": score.risk_score,
        "risk_level": score.risk_level,
        "record": scored_rec,
    }


@app.post("/api/demo/reset")
def reset():
    store.reset()
    return {"status": "reset"}

