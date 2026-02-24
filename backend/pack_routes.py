"""
pack_routes.py — API endpoints for agent packs.

  GET   /api/packs             — list available packs
  GET   /api/packs/:id         — pack detail (prompt, tools, test cases)
  POST  /api/packs/:id/clone   — one-click clone into your workspace
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from db_models import User
from packs import ALL_PACKS, get_pack, list_packs

router = APIRouter(prefix="/api/packs", tags=["packs"])


@router.get("")
def browse_packs(user: User = Depends(get_current_user)):
    """List all available agent packs."""
    packs = []
    for pack_id, p in ALL_PACKS.items():
        packs.append({
            "id": pack_id,
            "name": p["name"],
            "icon": p.get("icon", ""),
            "description": p["description"],
            "category": p.get("category", "general"),
            "tags": p.get("tags", []),
            "tool_count": len(p.get("tools", [])),
            "test_case_count": len(p.get("test_cases", [])),
            "criteria_count": len(p.get("criteria", [])),
            "suggested_mcp": p.get("suggested_mcp", []),
        })
    return {"packs": packs}


@router.get("/{pack_id}")
def pack_detail(pack_id: str, user: User = Depends(get_current_user)):
    """Get full pack detail including prompt preview, tools, and test cases."""
    pack = get_pack(pack_id)
    if not pack:
        raise HTTPException(404, "Pack not found")

    return {
        "id": pack_id,
        "name": pack["name"],
        "icon": pack.get("icon", ""),
        "description": pack["description"],
        "category": pack.get("category", "general"),
        "tags": pack.get("tags", []),
        "system_prompt": pack["system_prompt"],
        "tools": [
            {
                "name": t["name"],
                "description": t["description"],
                "fire_and_forget": t.get("fire_and_forget", True),
                "parameters": t.get("parameters", []),
            }
            for t in pack.get("tools", [])
        ],
        "test_cases": [
            {"question": tc["question"], "tags": tc.get("tags", [])}
            for tc in pack.get("test_cases", [])
        ],
        "criteria": pack.get("criteria", []),
        "custom_rules": pack.get("custom_rules", []),
        "suggested_mcp": pack.get("suggested_mcp", []),
        "upload_guide": pack.get("upload_guide", {}),
    }


@router.post("/{pack_id}/clone")
def clone_pack_endpoint(
    pack_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clone a pack into the user's workspace. Creates agent + tools + eval."""
    from pack_seeder import clone_pack

    result = clone_pack(
        pack_id=pack_id,
        user_id=user.id,
        tenant_id=user.tenant_id,
        db=db,
    )

    if not result:
        raise HTTPException(404, "Pack not found")

    return {
        "status": "cloned",
        **result,
    }
