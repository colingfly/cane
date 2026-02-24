"""
tool_executor.py — Executes agent tools (webhooks, API calls).

Handles:
1. Building Claude tool definitions from AgentTool records
2. Executing tool calls (HTTP requests)
3. Tool-use loop: Claude decides → execute → feed result back
"""
import json
import urllib.request
import urllib.error
from datetime import datetime
from typing import Optional

from config import CLAUDE_MODEL


def build_claude_tools(agent_tools: list) -> list:
    """
    Convert AgentTool records into Claude API tool definitions.
    Returns a list of tool dicts compatible with Claude's tools parameter.
    """
    tools = []
    for t in agent_tools:
        if not t.is_enabled:
            continue

        params = json.loads(t.parameters or "[]")

        # Build JSON Schema properties from parameter list
        properties = {}
        required = []
        for p in params:
            properties[p["name"]] = {
                "type": p.get("type", "string"),
                "description": p.get("description", ""),
            }
            if p.get("required", False):
                required.append(p["name"])

        # Always include a "reason" parameter so Claude explains why it's calling the tool
        properties["reason"] = {
            "type": "string",
            "description": "Brief explanation of why this tool is being called",
        }

        tools.append({
            "name": t.name.replace(" ", "_").lower()[:64],
            "description": t.description,
            "input_schema": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
            # Store our internal ID for execution lookup
            "_tool_id": t.id,
        })

    return tools


def execute_tool(tool, input_data: dict) -> dict:
    """
    Execute a single tool call. Makes an HTTP request based on tool config.
    Returns {"status": "ok/error", "status_code": int, "body": str}
    """
    try:
        url = tool.url

        # Build headers
        headers = json.loads(tool.headers or "{}")
        headers.setdefault("Content-Type", "application/json")

        # Add auth
        if tool.auth_type == "bearer" and tool.auth_value:
            headers["Authorization"] = f"Bearer {tool.auth_value}"
        elif tool.auth_type == "api_key" and tool.auth_value:
            headers["X-API-Key"] = tool.auth_value

        # Build payload from template, substituting input values
        template = json.loads(tool.payload_template or "{}")
        payload = _render_template(template, input_data)

        # Make the request
        data = json.dumps(payload).encode() if tool.method in ("POST", "PUT", "PATCH") else None
        req = urllib.request.Request(url, data=data, headers=headers, method=tool.method)

        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")[:2000]
            return {
                "status": "ok",
                "status_code": resp.status,
                "body": body,
            }

    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        return {
            "status": "error",
            "status_code": e.code,
            "body": body or str(e),
        }
    except Exception as e:
        return {
            "status": "error",
            "status_code": 0,
            "body": str(e)[:500],
        }


def _render_template(template: dict, data: dict) -> dict:
    """
    Replace {{variable}} placeholders in a payload template with actual values.
    Works recursively on nested dicts and lists.
    """
    if isinstance(template, str):
        result = template
        for key, value in data.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))
        return result
    elif isinstance(template, dict):
        return {k: _render_template(v, data) for k, v in template.items()}
    elif isinstance(template, list):
        return [_render_template(item, data) for item in template]
    return template


def call_claude_with_tools(
    messages: list,
    system: str,
    tools: list,
    tool_lookup: dict,
    db_session=None,
) -> str:
    """
    Call Claude with tool definitions. If Claude wants to use a tool,
    execute it and feed the result back. Returns the final text response.

    tool_lookup: dict mapping tool_name -> AgentTool record
    """
    from services.claude import call_with_tools as _sdk_call

    # Strip internal _tool_id from tool defs before sending to Claude
    clean_tools = []
    for t in tools:
        clean = {k: v for k, v in t.items() if not k.startswith("_")}
        clean_tools.append(clean)

    # Add instruction to always provide text answer
    enhanced_system = system + "\n\nIMPORTANT: You MUST always provide a complete text answer to the user's question. If you also call tools, you must STILL include your full written answer."

    max_iterations = 3  # Safety limit on tool-use loops
    current_messages = list(messages)
    all_text_parts = []  # Collect text across all iterations

    for iteration in range(max_iterations):
        try:
            response = _sdk_call(
                messages=current_messages,
                system=enhanced_system,
                tools=clean_tools,
            )
        except Exception as e:
            print(f"  [Tools] Claude API error on iteration {iteration}: {e}")
            break

        stop_reason = response.stop_reason
        content = response.content
        print(f"  [Tools] Iteration {iteration}: stop_reason={stop_reason}, blocks={len(content)}")

        # Collect any text blocks from this response
        for block in content:
            if block.type == "text" and block.text.strip():
                all_text_parts.append(block.text)
                print(f"  [Tools] Got text: {block.text[:80]}...")

        # If no tool use, we're done
        if stop_reason != "tool_use":
            break

        # Claude wants to use tools — process each tool_use block
        # Convert content blocks to dicts for the messages API
        content_dicts = []
        for block in content:
            if block.type == "text":
                content_dicts.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                content_dicts.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })
        current_messages.append({"role": "assistant", "content": content_dicts})

        tool_results = []

        for block in content:
            if block.type == "tool_use":
                tool_name = block.name
                tool_input = block.input
                tool_use_id = block.id

                print(f"  [Tools] Claude wants to call: {tool_name} with input: {json.dumps(tool_input)[:200]}")

                # Find the tool record
                tool_record = tool_lookup.get(tool_name)
                if not tool_record:
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": json.dumps({"error": f"Tool '{tool_name}' not found"}),
                    })
                    continue

                # Execute the tool
                exec_result = execute_tool(tool_record, tool_input)
                print(f"  [Tools] Executed {tool_name}: status={exec_result['status']}, code={exec_result.get('status_code')}")

                # Update stats
                if db_session:
                    try:
                        tool_record.execution_count = (tool_record.execution_count or 0) + 1
                        tool_record.last_executed_at = datetime.utcnow()
                        db_session.commit()
                    except Exception:
                        pass

                # Build tool result for Claude
                if tool_record.fire_and_forget:
                    result_content = json.dumps({
                        "status": "executed",
                        "message": f"Webhook fired successfully" if exec_result["status"] == "ok" else f"Webhook failed: {exec_result['body'][:200]}"
                    })
                else:
                    result_content = exec_result["body"][:2000] if exec_result["body"] else json.dumps(exec_result)

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": result_content,
                })

        # Add tool results to messages and loop back
        current_messages.append({"role": "user", "content": tool_results})

    final_text = " ".join(all_text_parts).strip()
    print(f"  [Tools] Final text length: {len(final_text)}")
    return final_text