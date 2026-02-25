"""
tool_routes.py — CRUD endpoints for Agent Tools.
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from db_models import User, Workspace
from tool_models import AgentTool

router = APIRouter(prefix="/api/tools", tags=["tools"])


def _serialize_tool(t: AgentTool) -> dict:
    return {
        "id": t.id,
        "workspace_id": t.workspace_id,
        "name": t.name,
        "description": t.description,
        "tool_type": t.tool_type,
        "url": t.url,
        "method": t.method,
        "headers": json.loads(t.headers or "{}"),
        "payload_template": json.loads(t.payload_template or "{}"),
        "auth_type": t.auth_type,
        "parameters": json.loads(t.parameters or "[]"),
        "is_enabled": t.is_enabled,
        "fire_and_forget": t.fire_and_forget,
        "execution_count": t.execution_count,
        "last_executed_at": t.last_executed_at.isoformat() if t.last_executed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


# ─── List tools for a workspace ───

@router.get("")
def list_tools(
    workspace_id: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tools = db.query(AgentTool).filter(
        AgentTool.workspace_id == workspace_id,
        AgentTool.tenant_id == user.tenant_id,
    ).all()
    return {"tools": [_serialize_tool(t) for t in tools]}


# ─── Create tool ───

@router.post("", status_code=201)
def create_tool(
    workspace_id: str = Query(...),
    name: str = Query(...),
    description: str = Query(...),
    tool_type: str = Query("webhook"),
    url: str = Query(...),
    method: str = Query("POST"),
    headers: str = Query("{}"),
    payload_template: str = Query("{}"),
    auth_type: str = Query("none"),
    auth_value: str = Query(""),
    parameters: str = Query("[]"),
    fire_and_forget: bool = Query(True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify workspace belongs to tenant
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(404, "Workspace not found")

    tool = AgentTool(
        workspace_id=workspace_id,
        tenant_id=user.tenant_id,
        name=name.strip(),
        description=description.strip(),
        tool_type=tool_type,
        url=url.strip(),
        method=method.upper(),
        headers=headers,
        payload_template=payload_template,
        auth_type=auth_type,
        auth_value=auth_value,
        parameters=parameters,
        fire_and_forget=fire_and_forget,
    )
    db.add(tool)
    db.commit()
    db.refresh(tool)

    print(f"  [Tools] Created: {tool.name} ({tool.tool_type}) for workspace={workspace_id}")
    return _serialize_tool(tool)


# ─── Update tool ───

@router.put("/{tool_id}")
def update_tool(
    tool_id: str,
    name: str = Query(None),
    description: str = Query(None),
    url: str = Query(None),
    method: str = Query(None),
    headers: str = Query(None),
    payload_template: str = Query(None),
    auth_type: str = Query(None),
    auth_value: str = Query(None),
    parameters: str = Query(None),
    is_enabled: bool = Query(None),
    fire_and_forget: bool = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tool = db.query(AgentTool).filter(
        AgentTool.id == tool_id,
        AgentTool.tenant_id == user.tenant_id,
    ).first()
    if not tool:
        raise HTTPException(404, "Tool not found")

    if name is not None: tool.name = name.strip()
    if description is not None: tool.description = description.strip()
    if url is not None: tool.url = url.strip()
    if method is not None: tool.method = method.upper()
    if headers is not None: tool.headers = headers
    if payload_template is not None: tool.payload_template = payload_template
    if auth_type is not None: tool.auth_type = auth_type
    if auth_value is not None: tool.auth_value = auth_value
    if parameters is not None: tool.parameters = parameters
    if is_enabled is not None: tool.is_enabled = is_enabled
    if fire_and_forget is not None: tool.fire_and_forget = fire_and_forget

    db.commit()
    db.refresh(tool)
    return _serialize_tool(tool)


# ─── Delete tool ───

@router.delete("/{tool_id}")
def delete_tool(
    tool_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tool = db.query(AgentTool).filter(
        AgentTool.id == tool_id,
        AgentTool.tenant_id == user.tenant_id,
    ).first()
    if not tool:
        raise HTTPException(404, "Tool not found")

    db.delete(tool)
    db.commit()
    return {"status": "deleted", "id": tool_id}


# ─── Copy tools from another agent ───

@router.post("/copy")
def copy_tools(
    source_workspace_id: str = Query(..., description="Agent to copy tools FROM"),
    target_workspace_id: str = Query(..., description="Agent to copy tools TO"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Copy all tools from one agent to another within the same tenant."""
    # Verify both workspaces belong to user's tenant
    for wid, label in [(source_workspace_id, "Source"), (target_workspace_id, "Target")]:
        ws = db.query(Workspace).filter(
            Workspace.id == wid,
            Workspace.tenant_id == user.tenant_id,
        ).first()
        if not ws:
            raise HTTPException(404, f"{label} agent not found")

    if source_workspace_id == target_workspace_id:
        raise HTTPException(400, "Source and target must be different agents")

    source_tools = db.query(AgentTool).filter(
        AgentTool.workspace_id == source_workspace_id,
        AgentTool.tenant_id == user.tenant_id,
    ).all()

    if not source_tools:
        return {"copied": 0, "message": "Source agent has no tools"}

    copied = 0
    for t in source_tools:
        new_tool = AgentTool(
            workspace_id=target_workspace_id,
            tenant_id=user.tenant_id,
            name=t.name,
            description=t.description,
            tool_type=t.tool_type,
            url=t.url,
            method=t.method,
            headers=t.headers,
            payload_template=t.payload_template,
            auth_type=t.auth_type,
            auth_value=t.auth_value,
            parameters=t.parameters,
            fire_and_forget=t.fire_and_forget,
            is_enabled=t.is_enabled,
        )
        db.add(new_tool)
        copied += 1

    db.commit()
    print(f"  [Tools] Copied {copied} tools from {source_workspace_id} to {target_workspace_id}")
    return {"copied": copied, "message": f"Copied {copied} tool(s)"}


# ─── Test tool (fire a test request) ───

@router.post("/{tool_id}/test")
def test_tool(
    tool_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tool = db.query(AgentTool).filter(
        AgentTool.id == tool_id,
        AgentTool.tenant_id == user.tenant_id,
    ).first()
    if not tool:
        raise HTTPException(404, "Tool not found")

    from tool_executor import execute_tool
    try:
        # Test with sample data
        test_input = {"question": "Test question from Cane", "answer": "This is a test execution."}
        result = execute_tool(tool, test_input)
        return {"status": "ok", "result": result}
    except Exception as e:
        return {"status": "error", "error": str(e)}