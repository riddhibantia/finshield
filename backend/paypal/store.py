"""SQLite persistence for PayPal intents, webhook events and agent actions.

Stdlib sqlite3 only — no new dependencies. WAL mode, connection-per-call
(safe across uvicorn threads). Webhooks dedupe on the event_id primary key.
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

_DEFAULT_DB = "data/finshield.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS paypal_intents (
    id TEXT PRIMARY KEY,
    transaction_id TEXT,
    status TEXT,
    decision TEXT,
    risk_score REAL,
    risk_level TEXT,
    amount TEXT,
    currency TEXT,
    paypal_order_id TEXT,
    authorization_id TEXT,
    capture_id TEXT,
    scenario TEXT,
    request_payload TEXT,
    score_payload TEXT,
    created_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS paypal_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT,
    resource_id TEXT,
    payload TEXT,
    verified INTEGER,
    processed_at TEXT
);
CREATE TABLE IF NOT EXISTS agent_actions (
    id TEXT PRIMARY KEY,
    kind TEXT,
    status TEXT,
    authorization_id TEXT,
    capture_id TEXT,
    dispute_id TEXT,
    amount TEXT,
    currency TEXT,
    reason TEXT,
    draft TEXT,
    proposed_by TEXT,
    approved_by TEXT,
    result_payload TEXT,
    created_at TEXT,
    updated_at TEXT
);
"""


def db_path() -> Path:
    p = Path(os.getenv("FINSHEILD_DB_PATH", _DEFAULT_DB))
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path(), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


def _dump(value: Any) -> str | None:
    if value is None:
        return None
    return value if isinstance(value, str) else json.dumps(value)


# ----------------------------------------------------------------- intents


def save_intent(record: dict[str, Any]) -> dict[str, Any]:
    conn = connect()
    try:
        conn.execute(
            """INSERT INTO paypal_intents
               (id, transaction_id, status, decision, risk_score, risk_level, amount, currency,
                paypal_order_id, authorization_id, capture_id, scenario, request_payload,
                score_payload, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 transaction_id=excluded.transaction_id, status=excluded.status,
                 decision=excluded.decision, risk_score=excluded.risk_score,
                 risk_level=excluded.risk_level, amount=excluded.amount,
                 currency=excluded.currency, paypal_order_id=excluded.paypal_order_id,
                 authorization_id=excluded.authorization_id, capture_id=excluded.capture_id,
                 scenario=excluded.scenario, request_payload=excluded.request_payload,
                 score_payload=excluded.score_payload, updated_at=excluded.updated_at""",
            (
                record["id"],
                record.get("transaction_id"),
                record.get("status"),
                record.get("decision"),
                record.get("risk_score"),
                record.get("risk_level"),
                record.get("amount"),
                record.get("currency"),
                record.get("paypal_order_id"),
                record.get("authorization_id"),
                record.get("capture_id"),
                record.get("scenario"),
                _dump(record.get("request_payload")),
                _dump(record.get("score_payload")),
                record.get("created_at"),
                record.get("updated_at", record.get("created_at")),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return record


def get_intent(intent_id: str) -> dict[str, Any] | None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM paypal_intents WHERE id = ?", (intent_id,)).fetchone()
    finally:
        conn.close()
    return dict(row) if row else None


def get_intent_by_order(order_id: str) -> dict[str, Any] | None:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM paypal_intents WHERE paypal_order_id = ? ORDER BY created_at DESC LIMIT 1",
            (order_id,),
        ).fetchone()
    finally:
        conn.close()
    return dict(row) if row else None


def list_intents(limit: int = 50) -> list[dict[str, Any]]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM paypal_intents ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


def update_intent_status(intent_id: str, **fields: Any) -> dict[str, Any] | None:
    from .mapper import now_iso

    allowed = ["status", "decision", "risk_score", "risk_level", "authorization_id", "capture_id", "score_payload"]
    sets, vals = [], []
    for key in allowed:
        if key in fields:
            sets.append(f"{key} = ?")
            vals.append(_dump(fields[key]))
    if not sets:
        return get_intent(intent_id)
    sets.append("updated_at = ?")
    vals.append(now_iso())
    vals.append(intent_id)
    conn = connect()
    try:
        conn.execute(f"UPDATE paypal_intents SET {', '.join(sets)} WHERE id = ?", vals)
        conn.commit()
    finally:
        conn.close()
    return get_intent(intent_id)


# ----------------------------------------------------------------- events


def save_event(event_id: str, event_type: str, resource_id: str, payload: Any, verified: bool) -> bool:
    """Insert a webhook event. Returns False when the event is a duplicate."""
    from .mapper import now_iso

    conn = connect()
    try:
        try:
            conn.execute(
                "INSERT INTO paypal_events (event_id, event_type, resource_id, payload, verified, processed_at) VALUES (?,?,?,?,?,?)",
                (event_id, event_type, resource_id, _dump(payload), 1 if verified else 0, now_iso()),
            )
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False
    finally:
        conn.close()


def list_events(limit: int = 100) -> list[dict[str, Any]]:
    conn = connect()
    try:
        rows = conn.execute("SELECT * FROM paypal_events ORDER BY processed_at DESC LIMIT ?", (limit,)).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


# ----------------------------------------------------------------- agent actions


def save_action(record: dict[str, Any]) -> dict[str, Any]:
    conn = connect()
    try:
        conn.execute(
            """INSERT INTO agent_actions
               (id, kind, status, authorization_id, capture_id, dispute_id, amount, currency,
                reason, draft, proposed_by, approved_by, result_payload, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 status=excluded.status, authorization_id=excluded.authorization_id,
                 reason=excluded.reason, draft=excluded.draft,
                 approved_by=excluded.approved_by, result_payload=excluded.result_payload,
                 updated_at=excluded.updated_at""",
            (
                record["id"],
                record.get("kind"),
                record.get("status"),
                record.get("authorization_id"),
                record.get("capture_id"),
                record.get("dispute_id"),
                record.get("amount"),
                record.get("currency"),
                record.get("reason"),
                _dump(record.get("draft")),
                record.get("proposed_by"),
                record.get("approved_by"),
                _dump(record.get("result_payload")),
                record.get("created_at"),
                record.get("updated_at", record.get("created_at")),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return record


def get_action(action_id: str) -> dict[str, Any] | None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM agent_actions WHERE id = ?", (action_id,)).fetchone()
    finally:
        conn.close()
    return dict(row) if row else None


def list_actions(status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    conn = connect()
    try:
        if status:
            rows = conn.execute(
                "SELECT * FROM agent_actions WHERE status = ? ORDER BY created_at DESC LIMIT ?", (status, limit)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM agent_actions ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


def update_action(action_id: str, **fields: Any) -> dict[str, Any] | None:
    from .mapper import now_iso

    allowed = ["status", "reason", "draft", "approved_by", "result_payload"]
    sets, vals = [], []
    for key in allowed:
        if key in fields:
            sets.append(f"{key} = ?")
            vals.append(_dump(fields[key]))
    if not sets:
        return get_action(action_id)
    sets.append("updated_at = ?")
    vals.append(now_iso())
    vals.append(action_id)
    conn = connect()
    try:
        conn.execute(f"UPDATE agent_actions SET {', '.join(sets)} WHERE id = ?", vals)
        conn.commit()
    finally:
        conn.close()
    return get_action(action_id)
