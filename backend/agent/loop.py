"""Agent loop — OpenAI-compatible tool-calling with a deterministic fallback.

No SDK dependency: plain httpx against LLM_BASE_URL. Max 6 tool iterations.
Without LLM_API_KEY the loop answers with a deterministic investigation
template labelled source=DEMO_FALLBACK (the repo's honesty convention).
The loop can NEVER move money: propose_* tools only create PENDING rows and
the approval endpoint is the sole PayPal-executing path (tested).
"""
from __future__ import annotations

import os
from typing import Any

import httpx

from .tools import TOOLS, execute_tool

MAX_ITERATIONS = 6

SYSTEM_PROMPT = (
    "You are FinShield's analyst agent. You investigate flagged PayPal transactions "
    "and propose actions (capture, void, refund, dispute evidence). You never set "
    "risk scores and you never execute money-moving actions: every propose_* tool "
    "only records a PENDING proposal that a human must approve. Use the read tools "
    "to investigate before proposing. Be concise and specific."
)


def llm_config() -> dict[str, str]:
    return {
        "base_url": os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/"),
        "api_key": os.getenv("LLM_API_KEY", ""),
        "model": os.getenv("LLM_MODEL", "llama-3.3-70b-versatile"),
    }


def llm_available() -> bool:
    return bool(llm_config()["api_key"])


def _chat(base_url: str, api_key: str, model: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"model": model, "messages": messages, "temperature": 0.2}
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"
    r = httpx.post(
        f"{base_url}/chat/completions",
        json=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        timeout=30.0,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]


def _fallback_reply(user_text: str) -> dict[str, Any]:
    """Deterministic investigation when no LLM key is configured."""
    from ..paypal import store as pp_store

    tool_trace: list[dict[str, Any]] = []
    high = execute_tool("list_high_risk_transactions", {"min_score": 0.6})
    tool_trace.append({"tool": "list_high_risk_transactions", "result_summary": f"{high.get('count', 0)} high-risk records"})
    all_recs = execute_tool("list_high_risk_transactions", {"min_score": 0})
    all_rows = all_recs.get("transactions") or []
    pp_rows = [r for r in all_rows if r.get("paypal_order_id")]
    actions = pp_store.list_actions(limit=200)

    refunded_caps = {
        a.get("capture_id")
        for a in actions
        if a.get("kind") == "REFUND" and a.get("status") in ("PENDING", "EXECUTED") and a.get("capture_id")
    }
    void_auths = {
        a.get("authorization_id")
        for a in actions
        if a.get("kind") in ("VOID", "CAPTURE") and a.get("status") in ("PENDING", "EXECUTED") and a.get("authorization_id")
    }

    lowered = user_text.lower()
    if "void" in lowered or "critical" in lowered or "review" in lowered:
        intent_label = "void risky held authorizations before delivery"
    elif "refund" in lowered:
        intent_label = "refund captured payments not yet refunded"
    elif "capture" in lowered:
        intent_label = "capture verified held authorizations"
    elif "dispute" in lowered or "evidence" in lowered:
        intent_label = "summarize disputes and compile evidence briefs"
    else:
        intent_label = "review the current fulfilment queue"

    lines = [
        f"Analyst (deterministic mode, source=DEMO_FALLBACK): {len(pp_rows)} PayPal orders ({high.get('count', 0)} total high-risk records across PayPal & simulator).",
        f"Focus: {intent_label}.",
    ]
    for row in (high.get("transactions") or [])[:4]:
        lines.append(
            f"- {row.get('txn_id')}: score {row.get('risk_score')} ({row.get('risk_level')}), status {row.get('status')}, amount {row.get('amount')} {row.get('currency')}"
        )

    if "void" in lowered or "critical" in lowered or ("review" in lowered and "refund" not in lowered and "dispute" not in lowered):
        held_risky = [
            r for r in pp_rows
            if r.get("status") in ("HELD_REVIEW", "HELD_STEP_UP", "AUTHORIZED")
            and r.get("authorization_id")
            and ((r.get("risk_score") or 0) >= 0.6 or "void" in lowered)
            and r.get("authorization_id") not in void_auths
        ]
        if held_risky:
            for target in held_risky[:2]:
                proposal = execute_tool("propose_void", {
                    "authorization_id": target["authorization_id"],
                    "reason": f"High-risk held authorization ({target.get('txn_id')}, score {target.get('risk_score')}) — void before digital fulfilment",
                })
                tool_trace.append({"tool": "propose_void", "result_summary": proposal["proposal_id"]})
                lines.append(
                    f"Proposed VOID on authorization {target['authorization_id']} ({target.get('amount')} {target.get('currency')}) — proposal {proposal['proposal_id']} is PENDING human approval."
                )
        else:
            already_voided = [r for r in pp_rows if r.get("status") == "VOIDED"]
            if already_voided:
                lines.append(
                    f"All critical/held PayPal authorizations are already handled ({len(already_voided)} already auto-voided before delivery)."
                )
            else:
                lines.append("No held high-risk PayPal authorizations awaiting a void proposal.")

    elif "capture" in lowered and "refund" not in lowered:
        held_ok = [
            r for r in pp_rows
            if r.get("status") in ("HELD_REVIEW", "HELD_STEP_UP", "AUTHORIZED")
            and r.get("authorization_id")
            and (r.get("risk_score") or 0) < 0.8
            and r.get("authorization_id") not in void_auths
        ]
        if held_ok:
            target = held_ok[0]
            proposal = execute_tool("propose_capture", {
                "authorization_id": target["authorization_id"],
                "reason": f"Capture held authorization ({target.get('txn_id')}, score {target.get('risk_score')}) per analyst request",
            })
            tool_trace.append({"tool": "propose_capture", "result_summary": proposal["proposal_id"]})
            lines.append(
                f"Proposed CAPTURE on authorization {target['authorization_id']} ({target.get('amount')} {target.get('currency')}) — proposal {proposal['proposal_id']} is PENDING human approval."
            )
        else:
            lines.append("No eligible held PayPal authorizations awaiting capture.")

    if "refund" in lowered:
        captured_rows = [
            r for r in pp_rows
            if r.get("status") == "CAPTURED" and r.get("capture_id") and r.get("capture_id") not in refunded_caps
        ]
        if captured_rows:
            target = captured_rows[0]
            proposal = execute_tool("propose_refund", {
                "capture_id": target["capture_id"],
                "amount": str(target.get("amount")),
                "currency": target.get("currency") or "USD",
                "reason": "Deterministic-mode proposal: refund captured payment per analyst request",
            })
            tool_trace.append({"tool": "propose_refund", "result_summary": proposal["proposal_id"]})
            lines.append(
                f"Proposed REFUND of capture {target['capture_id']} ({target.get('amount')} {target.get('currency')}) — proposal {proposal['proposal_id']} is PENDING human approval."
            )
        else:
            lines.append("No unrefunded captured PayPal payments on file to refund.")

    if "dispute" in lowered or "evidence" in lowered:
        disp_info = execute_tool("list_disputes_and_events", {})
        tool_trace.append({"tool": "list_disputes_and_events", "result_summary": f"{disp_info.get('dispute_count', 0)} disputes"})
        disputes = disp_info.get("disputes") or []
        if disputes:
            for d in disputes[:3]:
                amt_obj = d.get("disputed_amount") or {}
                lines.append(
                    f"- Dispute {d.get('dispute_id')}: {d.get('reason')} ({amt_obj.get('value', '?')} {amt_obj.get('currency_code', 'USD')}), state {d.get('dispute_state') or d.get('status')}"
                )
            first_did = disputes[0].get("dispute_id")
            if first_did:
                brief = execute_tool("draft_dispute_evidence", {"dispute_id": first_did})
                tool_trace.append({"tool": "draft_dispute_evidence", "result_summary": str(first_did)})
                lines.append(f"Compiled brief for {first_did}: {brief.get('summary')}")
        else:
            lines.append("No disputes on file. Use 'Simulate Dispute' above to inject a dispute event.")

    lines.append("Proposals require a human approval click — the agent never moves money alone.")
    if not llm_available():
        lines.append("(Set LLM_API_KEY for full tool-calling narration; this reply is the deterministic fallback.)")
    return {"reply": "\n".join(lines), "tool_trace": tool_trace, "source": "DEMO_FALLBACK"}


def run_agent(user_text: str, history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    cfg = llm_config()
    if not cfg["api_key"]:
        return _fallback_reply(user_text)

    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history or [])
    messages.append({"role": "user", "content": user_text})
    tool_trace: list[dict[str, Any]] = []

    for _ in range(MAX_ITERATIONS):
        try:
            msg = _chat(cfg["base_url"], cfg["api_key"], cfg["model"], messages, TOOLS)
        except Exception as e:
            fallback = _fallback_reply(user_text)
            fallback["reply"] = f"LLM endpoint unavailable ({e.__class__.__name__}) — deterministic fallback used.\n" + fallback["reply"]
            fallback["tool_trace"] = tool_trace
            return fallback

        calls = msg.get("tool_calls") or []
        if not calls:
            return {"reply": msg.get("content") or "", "tool_trace": tool_trace, "source": "LIVE_LLM"}

        messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
        for call in calls:
            fn = call.get("function", {})
            name = fn.get("name", "")
            try:
                import json

                args = json.loads(fn.get("arguments") or "{}")
            except Exception:
                args = {}
            result = execute_tool(name, args)
            tool_trace.append({"tool": name, "args": args, "result_keys": list(result)[:6]})
            messages.append({
                "role": "tool",
                "tool_call_id": call.get("id", ""),
                "name": name,
                "content": __import__("json").dumps(result)[:4000],
            })

    return {
        "reply": "Tool-iteration budget exhausted before a final answer — check pending proposals in the approval queue.",
        "tool_trace": tool_trace,
        "source": "LIVE_LLM",
    }
