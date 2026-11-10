"""PayPal integration package — client, mapper, reasons, store, router."""
from __future__ import annotations

from .client import load_env_file

# Load .env (if present) before any config read; real env vars still win via setdefault.
load_env_file()
