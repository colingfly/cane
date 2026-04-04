"""
mcp_routes.py — API endpoints for MCP server management.

Endpoints:
  GET    /api/mcp/catalog                — browse pre-built connectors
  GET    /api/mcp/servers                — list connected MCP servers for a workspace
  POST   /api/mcp/servers                — connect a new MCP server
  PUT    /api/mcp/servers/:id            — update server config
  DELETE /api/mcp/servers/:id            — disconnect a server
  POST   /api/mcp/servers/:id/sync       — re-discover tools from server
  POST   /api/mcp/servers/:id/test       — test a tool on the server
  GET    /api/mcp/servers/:id/tools      — list discovered tools
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from cane.core.database import get_db
from cane.auth.jwt import get_current_user
from cane.core.models import User, Workspace
from cane.tools.mcp_models import McpServer
from cane.tools.mcp_catalog import get_catalog, get_connector, get_categories

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


def _serialize_server(s: McpServer) -> dict:
    tools = []
    try:
        tools = json.loads(s.discovered_tools or "[]")
    except Exception:
        pass

    return {
        "id": s.id,
        "workspace_id": s.workspace_id,
        "name": s.name,
        "server_url": s.server_url,
        "server_type": s.server_type,
        "icon": s.icon,
        "auth_type": s.auth_type,
        "is_enabled": s.is_enabled,
        "status": s.status,
        "status_message": s.status_message,
        "tool_count": s.tool_count,
        "tools": tools,
        "total_calls": s.total_calls,
        "avg_latency_ms": s.avg_latency_ms,
        "last_synced_at": s.last_synced_at.isoformat() if s.last_synced_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


# ─── Catalog ───

@router.get("/catalog")
def browse_catalog(user: User = Depends(get_current_user)):
    """Browse pre-built MCP connectors."""
    return {
        "connectors": get_catalog(),
        "categories": get_categories(),
    }


# ─── CRUD ───

@router.get("/servers")
def list_servers(
    workspace_id: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List MCP servers connected to a workspace."""
    servers = db.query(McpServer).filter(
        McpServer.workspace_id == workspace_id,
        McpServer.tenant_id == user.tenant_id,
    ).order_by(McpServer.created_at.desc()).all()

    return {"servers": [_serialize_server(s) for s in servers]}


@router.post("/servers", status_code=201)
def connect_server(
    workspace_id: str = Query(...),
    name: str = Query(...),
    server_url: str = Query(...),
    server_type: str = Query("custom"),
    icon: str = Query("MC"),
    auth_type: str = Query("none"),
    auth_header: str = Query("Authorization"),
    auth_value: str = Query(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Connect a new MCP server to a workspace."""
    # Verify workspace belongs to tenant
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(404, "Workspace not found")

    # If connecting from catalog, fill in defaults
    if server_type != "custom":
        connector = get_connector(server_type)
        if connector:
            name = name or connector["name"]
            icon = connector.get("icon", icon)
            if not auth_type or auth_type == "none":
                auth_type = connector.get("auth_type", "none")

    server = McpServer(
        workspace_id=workspace_id,
        tenant_id=user.tenant_id,
        name=name.strip(),
        server_url=server_url.strip(),
        server_type=server_type,
        icon=icon,
        auth_type=auth_type,
        auth_header=auth_header,
        auth_value=auth_value,
        status="pending",
    )
    db.add(server)
    db.commit()
    db.refresh(server)

    print(f"  [MCP] Connected: {server.name} ({server.server_type}) for workspace={workspace_id}")

    # Auto-sync tools on connect
    _sync_server(server, db)

    return _serialize_server(server)


@router.put("/servers/{server_id}")
def update_server(
    server_id: str,
    name: str = Query(None),
    server_url: str = Query(None),
    auth_type: str = Query(None),
    auth_header: str = Query(None),
    auth_value: str = Query(None),
    is_enabled: bool = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update MCP server configuration."""
    server = db.query(McpServer).filter(
        McpServer.id == server_id,
        McpServer.tenant_id == user.tenant_id,
    ).first()
    if not server:
        raise HTTPException(404, "MCP server not found")

    if name is not None:
        server.name = name.strip()
    if server_url is not None:
        server.server_url = server_url.strip()
        server.status = "pending"  # Re-sync needed
    if auth_type is not None:
        server.auth_type = auth_type
    if auth_header is not None:
        server.auth_header = auth_header
    if auth_value is not None:
        server.auth_value = auth_value
        server.status = "pending"  # Re-sync needed
    if is_enabled is not None:
        server.is_enabled = is_enabled

    db.commit()
    db.refresh(server)
    return _serialize_server(server)


@router.delete("/servers/{server_id}")
def disconnect_server(
    server_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnect an MCP server."""
    server = db.query(McpServer).filter(
        McpServer.id == server_id,
        McpServer.tenant_id == user.tenant_id,
    ).first()
    if not server:
        raise HTTPException(404, "MCP server not found")

    db.delete(server)
    db.commit()
    print(f"  [MCP] Disconnected: {server.name} from workspace={server.workspace_id}")
    return {"status": "deleted", "id": server_id}


# ─── Sync (re-discover tools) ───

@router.post("/servers/{server_id}/sync")
def sync_server(
    server_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-discover tools from an MCP server."""
    server = db.query(McpServer).filter(
        McpServer.id == server_id,
        McpServer.tenant_id == user.tenant_id,
    ).first()
    if not server:
        raise HTTPException(404, "MCP server not found")

    _sync_server(server, db)
    return _serialize_server(server)


def _sync_server(server: McpServer, db: Session):
    """Internal: discover tools from an MCP server and update the record."""
    from cane.tools.mcp import discover_tools

    result = discover_tools(
        server_url=server.server_url,
        auth_type=server.auth_type,
        auth_header=server.auth_header,
        auth_value=server.auth_value,
    )

    if result.ok:
        tools = result.data or []
        server.discovered_tools = json.dumps(tools)
        server.tool_count = len(tools)
        server.status = "connected"
        server.status_message = f"Discovered {len(tools)} tools"
        server.last_synced_at = datetime.utcnow()
        server.avg_latency_ms = result.latency_ms
        print(f"  [MCP] Synced {server.name}: {len(tools)} tools in {result.latency_ms}ms")
    else:
        server.status = "error"
        server.status_message = result.error[:500]
        print(f"  [MCP] Sync failed for {server.name}: {result.error[:200]}")

    db.commit()


# ─── Test a tool ───

@router.post("/servers/{server_id}/test")
def test_server_tool(
    server_id: str,
    tool_name: str = Query(...),
    arguments: str = Query("{}"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Test-execute a tool on an MCP server."""
    server = db.query(McpServer).filter(
        McpServer.id == server_id,
        McpServer.tenant_id == user.tenant_id,
    ).first()
    if not server:
        raise HTTPException(404, "MCP server not found")

    from cane.tools.mcp import execute_tool

    try:
        args = json.loads(arguments)
    except Exception:
        args = {}

    result = execute_tool(
        server_url=server.server_url,
        tool_name=tool_name,
        arguments=args,
        auth_type=server.auth_type,
        auth_header=server.auth_header,
        auth_value=server.auth_value,
    )

    return {
        "status": "ok" if result.ok else "error",
        "data": result.data,
        "error": result.error,
        "latency_ms": result.latency_ms,
    }


# ─── List discovered tools ───

@router.get("/servers/{server_id}/tools")
def list_server_tools(
    server_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List tools discovered from an MCP server."""
    server = db.query(McpServer).filter(
        McpServer.id == server_id,
        McpServer.tenant_id == user.tenant_id,
    ).first()
    if not server:
        raise HTTPException(404, "MCP server not found")

    tools = []
    try:
        tools = json.loads(server.discovered_tools or "[]")
    except Exception:
        pass

    return {
        "server_id": server.id,
        "server_name": server.name,
        "status": server.status,
        "tools": tools,
    }
