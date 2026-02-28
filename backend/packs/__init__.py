"""
packs/ — Pre-built agent packs for the Cane marketplace.

Each pack defines a complete agent: system prompt, webhook tools,
suggested MCP connections, eval test cases, scoring criteria, and
custom rules.
"""
from packs.ai_sales_rep import PACK as AI_SALES_REP
from packs.ai_receptionist import PACK as AI_RECEPTIONIST

ALL_PACKS = {
    "ai_sales_rep": AI_SALES_REP,
    "ai_receptionist": AI_RECEPTIONIST,
}


def get_pack(pack_id: str) -> dict | None:
    return ALL_PACKS.get(pack_id)


def list_packs() -> list[dict]:
    return [
        {"id": k, "name": p["name"], "icon": p["icon"], "description": p["description"]}
        for k, p in ALL_PACKS.items()
    ]
