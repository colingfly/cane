"""
services/tools.py — Unified tool service.

Merges webhook AgentTools and MCP server tools into a single tool palette
for Claude. Routes execution to the correct backend (webhook or MCP).

Usage:
    from services.tools import get_all_tools, execute_tool_call

    tools, lookup = get_all_tools(workspace_id, tenant_id, db)
    # tools = Claude API tool defs
    # lookup = dict mapping tool_name -> execution info

    result = execute_tool_call("tool_name", {"arg": "value"}, lookup, db)
"""
import json
from datetime import datetime
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from tool_models import AgentTool
from mcp_models import McpServer


@dataclass
class ToolRef:
    """Reference to a tool's execution backend."""
    source: str                  # "webhook" | "mcp"
    webhook_tool: AgentTool | None = None
    mcp_server: McpServer | None = None
    mcp_tool_name: str = ""      # Original MCP tool name (before sanitization)


def get_all_tools(
    workspace_id: str,
    tenant_id: str,
    db: Session,
) -> tuple[list[dict], dict[str, ToolRef]]:
    """
    Gather all tools for a workspace — webhook + MCP.

    Returns:
        (claude_tools, tool_lookup)
        - claude_tools: list of Claude API tool definitions
        - tool_lookup: dict mapping sanitized tool name -> ToolRef
    """
    claude_tools = []
    tool_lookup: dict[str, ToolRef] = {}

    # 1) Webhook tools (existing system)
    webhook_tools = db.query(AgentTool).filter(
        AgentTool.workspace_id == workspace_id,
        AgentTool.tenant_id == tenant_id,
        AgentTool.is_enabled == True,
    ).all()

    for t in webhook_tools:
        params = json.loads(t.parameters or "[]")
        properties = {}
        required = []
        for p in params:
            properties[p["name"]] = {
                "type": p.get("type", "string"),
                "description": p.get("description", ""),
            }
            if p.get("required", False):
                required.append(p["name"])

        properties["reason"] = {
            "type": "string",
            "description": "Brief explanation of why this tool is being called",
        }

        safe_name = t.name.replace(" ", "_").lower()[:64]
        claude_tools.append({
            "name": safe_name,
            "description": t.description,
            "input_schema": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        })
        tool_lookup[safe_name] = ToolRef(source="webhook", webhook_tool=t)

    # 2) MCP server tools
    try:
        mcp_servers = db.query(McpServer).filter(
            McpServer.workspace_id == workspace_id,
            McpServer.tenant_id == tenant_id,
            McpServer.is_enabled == True,
            McpServer.status == "connected",
        ).all()
    except Exception as e:
        print(f"  [Tools] MCP query skipped (table may not exist): {e}")
        db.rollback()
        mcp_servers = []

    for server in mcp_servers:
        try:
            tools = json.loads(server.discovered_tools or "[]")
        except Exception:
            continue

        for mcp_tool in tools:
            name = mcp_tool.get("name", "")
            if not name:
                continue

            # Prefix MCP tools to avoid name collisions with webhooks
            # e.g. "slack__send_message", "gcal__create_event"
            prefix = server.server_type if server.server_type != "custom" else server.name.lower().replace(" ", "_")[:20]
            safe_name = f"{prefix}__{name}".replace(" ", "_").replace("-", "_").lower()[:64]

            # Use the MCP tool's inputSchema, or build a generic one
            input_schema = mcp_tool.get("inputSchema", mcp_tool.get("input_schema", {
                "type": "object",
                "properties": {},
            }))

            description = mcp_tool.get("description", f"Tool from {server.name}")

            claude_tools.append({
                "name": safe_name,
                "description": f"[{server.name}] {description}",
                "input_schema": input_schema,
            })
            tool_lookup[safe_name] = ToolRef(
                source="mcp",
                mcp_server=server,
                mcp_tool_name=name,  # Original name for execution
            )

    return claude_tools, tool_lookup


def execute_tool_call(
    tool_name: str,
    input_data: dict,
    tool_lookup: dict[str, ToolRef],
    db: Session | None = None,
) -> dict:
    """
    Execute a tool call, routing to webhook or MCP backend.

    Returns: {"status": "ok"|"error", "body": str, "status_code": int}
    """
    ref = tool_lookup.get(tool_name)
    if not ref:
        return {"status": "error", "body": f"Tool '{tool_name}' not found", "status_code": 0}

    if ref.source == "webhook" and ref.webhook_tool:
        return _execute_webhook(ref.webhook_tool, input_data, db)
    elif ref.source == "mcp" and ref.mcp_server:
        return _execute_mcp(ref.mcp_server, ref.mcp_tool_name, input_data, db)
    else:
        return {"status": "error", "body": "Invalid tool reference", "status_code": 0}


def _execute_webhook(tool: AgentTool, input_data: dict, db: Session | None) -> dict:
    """Execute a webhook tool (existing behavior)."""
    from tool_executor import execute_tool

    result = execute_tool(tool, input_data)

    # Update stats
    if db:
        try:
            tool.execution_count = (tool.execution_count or 0) + 1
            tool.last_executed_at = datetime.utcnow()
            db.commit()
        except Exception:
            pass

    return result


def _execute_mcp(server: McpServer, tool_name: str, arguments: dict, db: Session | None) -> dict:
    """Execute a tool on an MCP server."""
    from services.mcp_client import execute_tool as mcp_execute

    # Remove the "reason" param Claude adds — MCP tools don't expect it
    clean_args = {k: v for k, v in arguments.items() if k != "reason"}

    result = mcp_execute(
        server_url=server.server_url,
        tool_name=tool_name,
        arguments=clean_args,
        auth_type=server.auth_type,
        auth_header=server.auth_header,
        auth_value=server.auth_value,
    )

    # Update stats
    if db:
        try:
            server.total_calls = (server.total_calls or 0) + 1
            if result.latency_ms and server.avg_latency_ms:
                server.avg_latency_ms = (server.avg_latency_ms * 0.8) + (result.latency_ms * 0.2)
            elif result.latency_ms:
                server.avg_latency_ms = result.latency_ms
            db.commit()
        except Exception:
            pass

    if result.ok:
        body = json.dumps(result.data) if isinstance(result.data, (dict, list)) else str(result.data or "")
        return {"status": "ok", "body": body[:2000], "status_code": 200}
    else:
        return {"status": "error", "body": result.error[:500], "status_code": 0}
