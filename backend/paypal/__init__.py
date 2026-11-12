"""PayPal integration package — client, mapper, reasons, store, router."""
from __future__ import annotations

from pathlib import Path

from .client import load_env_file

# Load repo-root .env (if present) before any config read; real env vars still win via setdefault.
load_env_file(Path(__file__).resolve().parents[2] / ".env")
