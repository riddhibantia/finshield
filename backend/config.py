"""Configuration and ML Core path resolution."""
from __future__ import annotations

import os
import sys
from pathlib import Path

def get_ml_repo_root() -> Path:
    """Find the FinSheild ML Core repository root."""
    # 1. Check explicit environment variable
    env_path = os.getenv("FINSHEILD_CORE_PATH")
    if env_path:
        p = Path(env_path).resolve()
        if p.exists():
            return p

    # 2. Check sibling directory ../Finsheild (or ../Finshield — local folder spelling)
    for _sib_name in ("Finsheild", "Finshield"):
        sibling = (Path(__file__).resolve().parents[2] / _sib_name).resolve()
        if sibling.exists() and (sibling / "models").exists():
            return sibling

    # 3. Check the repo root this backend/ lives in (monorepo layout)
    repo_root = Path(__file__).resolve().parents[1]
    if (repo_root / "models").exists():
        return repo_root

    # 4. Check two levels up (backend nested one dir deeper)
    parent_two = Path(__file__).resolve().parents[2]
    if (parent_two / "models").exists():
        return parent_two

    # 5. Check three levels up
    parent_three = Path(__file__).resolve().parents[3]
    if (parent_three / "models").exists():
        return parent_three

    return repo_root

ML_REPO_ROOT = get_ml_repo_root()

# Ensure finsheild package is importable if present in ML repo
if (ML_REPO_ROOT / "src").exists() and str(ML_REPO_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ML_REPO_ROOT / "src"))
