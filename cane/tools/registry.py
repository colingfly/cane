"""
services/tools.py — Unified tool service.

Merges webhook AgentTools, MCP server tools, and linked sub-agents into
a single tool palette for Claude. Routes execution to the correct backend.

Usage:
    from cane.tools.registry import get_all_tools, execute_tool_call

    tools, lookup = get_all_tools(workspace_id, tenant_id, db)
    # tools = Claude API tool defs
    # lookup = dict mapping tool_name -> execution info

    result = execute_tool_call("tool_name", {"arg": "value"}, lookup, db)
"""
import json
import threading
from datetime import datetime
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

import time as _time

from cane.tools.models import AgentTool, AgentLink, AgentCommunication
from cane.tools.mcp_models import McpServer

# Thread-local depth counter for agent-as-tool recursion
_agent_depth_local = threading.local()
MAX_AGENT_DEPTH = 2


@dataclass
class ToolRef:
    """Reference to a tool's execution backend."""
    source: str                  # "webhook" | "mcp" | "agent"
    webhook_tool: AgentTool | None = None
    mcp_server: McpServer | None = None
    mcp_tool_name: str = ""      # Original MCP tool name (before sanitization)
    agent_workspace_id: str = "" # Child workspace ID for agent-type tools


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

    # 3) Agent-as-Tool links (sub-agent delegation)
    try:
        agent_links = db.query(AgentLink).filter(
            AgentLink.parent_workspace_id == workspace_id,
            AgentLink.tenant_id == tenant_id,
            AgentLink.is_enabled == True,
        ).all()
    except Exception as e:
        print(f"  [Tools] AgentLink query skipped: {e}")
        db.rollback()
        agent_links = []

    for link in agent_links:
        safe_name = link.tool_name.replace(" ", "_").lower()[:64]
        claude_tools.append({
            "name": safe_name,
            "description": link.tool_description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The question or task to delegate to this agent",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of why delegating to this agent",
                    },
                },
                "required": ["query"],
            },
        })
        tool_lookup[safe_name] = ToolRef(
            source="agent",
            agent_workspace_id=link.child_workspace_id,
        )

    # 4) Orchestrator mode: auto-discover all tenant agents as tools
    try:
        from cane.core.models import Workspace
        ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        if ws and getattr(ws, "orchestrator_mode", False):
            all_agents = db.query(Workspace).filter(
                Workspace.tenant_id == tenant_id,
                Workspace.agent_type.isnot(None),
                Workspace.id != workspace_id,
            ).all()
            linked_ids = {link.child_workspace_id for link in agent_links} if agent_links else set()
            for agent in all_agents:
                if agent.id in linked_ids:
                    continue
                safe_name = f"auto_{agent.name}".replace(" ", "_").replace("-", "_").lower()[:64]
                desc = agent.agent_description or agent.description or agent.name
                claude_tools.append({
                    "name": safe_name,
                    "description": f"Specialist agent: {desc}. Delegate when this agent's expertise matches the query.",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "The question or task to delegate to this specialist agent",
                            },
                            "reason": {
                                "type": "string",
                                "description": "Brief explanation of why delegating to this specialist",
                            },
                        },
                        "required": ["query"],
                    },
                })
                tool_lookup[safe_name] = ToolRef(source="agent", agent_workspace_id=agent.id)
    except Exception as e:
        print(f"  [Tools] Orchestrator auto-discover skipped: {e}")

    return claude_tools, tool_lookup


def execute_tool_call(
    tool_name: str,
    input_data: dict,
    tool_lookup: dict[str, ToolRef],
    db: Session | None = None,
    session_id: str = "",
    tenant_id: str = "",
    on_agent_event: callable = None,
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
    elif ref.source == "agent" and ref.agent_workspace_id:
        return _execute_agent(
            ref.agent_workspace_id, input_data, db,
            session_id=session_id, tenant_id=tenant_id,
            on_agent_event=on_agent_event,
        )
    else:
        return {"status": "error", "body": "Invalid tool reference", "status_code": 0}


def _execute_webhook(tool: AgentTool, input_data: dict, db: Session | None) -> dict:
    """Execute a webhook tool (existing behavior)."""
    from cane.tools.executor import execute_tool

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
    from cane.tools.mcp import execute_tool as mcp_execute

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


def _execute_agent(
    child_workspace_id: str,
    input_data: dict,
    db: Session | None,
    session_id: str = "",
    tenant_id: str = "",
    on_agent_event: callable = None,
) -> dict:
    """Execute a sub-agent: run the child agent's full RAG + tool pipeline."""
    from cane.core.database import SessionLocal
    from cane.core.models import Workspace

    # Depth check -- prevent infinite recursion
    depth = getattr(_agent_depth_local, 'depth', 0)
    if depth >= MAX_AGENT_DEPTH:
        return {
            "status": "error",
            "body": "Max agent delegation depth reached. Cannot delegate further.",
            "status_code": 0,
        }

    query = input_data.get("query", "").strip()
    if not query:
        return {"status": "error", "body": "No query provided for sub-agent", "status_code": 0}

    # Use a fresh DB session to avoid conflicts with parent's session
    child_db = SessionLocal()
    t0 = _time.time()
    child_name = ""
    child_icon = ""
    try:
        ws = child_db.query(Workspace).filter(Workspace.id == child_workspace_id).first()
        if not ws:
            return {"status": "error", "body": "Sub-agent workspace not found", "status_code": 0}

        child_name = ws.name or "Agent"
        child_icon = ws.agent_icon or ""
        _tenant_id = tenant_id or ws.tenant_id

        # External agent branch -- HTTP call to registered endpoint
        if ws.agent_type == "external":
            return _execute_external_agent(
                ws, query, child_db, session_id, _tenant_id, on_agent_event, depth, t0,
            )

        # Emit start event
        if on_agent_event:
            on_agent_event({
                "subtype": "agent_start",
                "child_name": child_name,
                "child_icon": child_icon,
                "query": query[:200],
            })

        # Build child's RAG context
        from cane.rag.context import build_context, build_system_prompt
        ctx = build_context(query, ws.tenant_id, child_workspace_id)
        system = build_system_prompt(ws.system_prompt or "")

        # Build user message with document context
        if ctx.has_content:
            user_msg = f"Question: {query}\n\nDocument Excerpts:\n{ctx.context}\n\nProvide a clear answer based on the above."
        else:
            user_msg = f"Question: {query}"
        messages = [{"role": "user", "content": user_msg}]

        # Increment depth before loading child's tools (which may include its own sub-agents)
        _agent_depth_local.depth = depth + 1
        try:
            child_tools, child_lookup = get_all_tools(child_workspace_id, ws.tenant_id, child_db)

            if child_tools:
                from cane.tools.executor import call_claude_with_tools
                answer = call_claude_with_tools(
                    messages=messages, system=system,
                    tools=child_tools, tool_lookup=child_lookup, db_session=child_db,
                )
            else:
                from cane.inference.claude import call
                answer = call("", system=system, messages=messages)
        finally:
            _agent_depth_local.depth = depth

        elapsed_ms = int((_time.time() - t0) * 1000)
        result_body = (answer or "")[:2000]

        # Emit done event
        if on_agent_event:
            on_agent_event({
                "subtype": "agent_done",
                "child_name": child_name,
                "child_icon": child_icon,
                "duration_ms": elapsed_ms,
                "response_preview": result_body[:300],
            })

        # Log communication (fire-and-forget)
        _log_agent_communication(
            tenant_id=_tenant_id,
            parent_agent_id="",  # filled by caller context
            child_agent_id=child_workspace_id,
            session_id=session_id,
            query_sent=query[:2000],
            response_received=result_body,
            depth_level=depth,
            duration_ms=elapsed_ms,
            status="ok",
        )

        return {"status": "ok", "body": result_body, "status_code": 200}

    except Exception as e:
        elapsed_ms = int((_time.time() - t0) * 1000)
        print(f"  [Tools] Sub-agent execution error: {e}")

        if on_agent_event:
            on_agent_event({
                "subtype": "agent_done",
                "child_name": child_name or "Agent",
                "child_icon": child_icon,
                "duration_ms": elapsed_ms,
                "response_preview": f"Error: {str(e)[:100]}",
            })

        _log_agent_communication(
            tenant_id=tenant_id,
            parent_agent_id="",
            child_agent_id=child_workspace_id,
            session_id=session_id,
            query_sent=query[:2000],
            response_received="",
            depth_level=depth,
            duration_ms=elapsed_ms,
            status="error",
            error_message=str(e)[:500],
        )

        return {"status": "error", "body": f"Sub-agent error: {str(e)[:200]}", "status_code": 0}
    finally:
        child_db.close()


def _log_agent_communication(**kwargs):
    """Fire-and-forget log of an inter-agent call. Never raises."""
    try:
        from cane.core.database import SessionLocal
        log_db = SessionLocal()
        try:
            comm = AgentCommunication(**kwargs)
            log_db.add(comm)
            log_db.commit()
        finally:
            log_db.close()
    except Exception as e:
        print(f"  [Tools] Failed to log agent communication: {e}")


def _execute_external_agent(ws, query, child_db, session_id, tenant_id, on_agent_event, depth, t0):
    """Execute an external agent by calling its registered HTTP endpoint."""
    import urllib.request
    import urllib.error
    from cane.tools.models import ExternalAgent
    from cane.core.crypto import decrypt

    child_name = ws.name or "External Agent"
    child_icon = ws.agent_icon or ""

    # Emit start event
    if on_agent_event:
        on_agent_event({
            "subtype": "agent_start",
            "child_name": child_name,
            "child_icon": child_icon,
            "query": query[:200],
        })

    try:
        ext = child_db.query(ExternalAgent).filter(
            ExternalAgent.workspace_id == ws.id,
            ExternalAgent.is_active == True,
        ).first()

        if not ext:
            return {"status": "error", "body": "External agent config not found", "status_code": 0}

        # Build request
        payload = json.dumps({"query": query}).encode("utf-8")
        req = urllib.request.Request(
            ext.endpoint_url,
            data=payload,
            method="POST",
            headers={"Content-Type": "application/json"},
        )

        # Add auth
        if ext.auth_type == "bearer" and ext.auth_token:
            token = decrypt(ext.auth_token)
            req.add_header("Authorization", f"Bearer {token}")
        elif ext.auth_type == "header" and ext.auth_token:
            token = decrypt(ext.auth_token)
            req.add_header("X-API-Key", token)

        # Execute with timeout
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")

        # Try to parse JSON response
        try:
            data = json.loads(raw)
            result_body = data.get("response", data.get("answer", data.get("result", raw)))
        except (json.JSONDecodeError, AttributeError):
            result_body = raw

        result_body = str(result_body)[:2000]
        elapsed_ms = int((_time.time() - t0) * 1000)

        # Update stats
        try:
            ext.total_calls = (ext.total_calls or 0) + 1
            ext.last_called_at = _time.strftime("%Y-%m-%d %H:%M:%S", _time.gmtime())
            prev_avg = ext.avg_response_ms or 0
            prev_count = max((ext.total_calls or 1) - 1, 1)
            ext.avg_response_ms = int((prev_avg * prev_count + elapsed_ms) / ext.total_calls)
            child_db.commit()
        except Exception:
            pass

        # Emit done event
        if on_agent_event:
            on_agent_event({
                "subtype": "agent_done",
                "child_name": child_name,
                "child_icon": child_icon,
                "duration_ms": elapsed_ms,
                "response_preview": result_body[:300],
            })

        # Log communication
        _log_agent_communication(
            tenant_id=tenant_id,
            parent_agent_id="",
            child_agent_id=ws.id,
            session_id=session_id,
            query_sent=query[:2000],
            response_received=result_body,
            depth_level=depth,
            duration_ms=elapsed_ms,
            status="ok",
        )

        return {"status": "ok", "body": result_body, "status_code": 200}

    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        elapsed_ms = int((_time.time() - t0) * 1000)
        err_msg = str(e)[:500]
        print(f"  [Tools] External agent call failed: {err_msg}")

        if on_agent_event:
            on_agent_event({
                "subtype": "agent_done",
                "child_name": child_name,
                "child_icon": child_icon,
                "duration_ms": elapsed_ms,
                "response_preview": f"Error: {err_msg[:100]}",
            })

        _log_agent_communication(
            tenant_id=tenant_id,
            parent_agent_id="",
            child_agent_id=ws.id,
            session_id=session_id,
            query_sent=query[:2000],
            response_received="",
            depth_level=depth,
            duration_ms=elapsed_ms,
            status="error",
            error_message=err_msg,
        )

        return {"status": "error", "body": f"External agent error: {err_msg[:200]}", "status_code": 0}
