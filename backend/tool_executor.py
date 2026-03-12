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
        # If template is empty/default, just forward Claude's raw input
        template = json.loads(tool.payload_template or "{}")
        default_templates = [
            {},
            {"question": "{{question}}", "answer": "{{answer}}"},
        ]
        if template in default_templates:
            # No custom template — forward Claude's input directly
            # Remove internal fields Claude adds
            payload = {k: v for k, v in input_data.items() if k not in ("reason", "_tool_id")}
        else:
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
    max_iterations: int = 3,
    on_tool_event=None,
) -> str:
    """
    Call Claude with tool definitions. If Claude wants to use a tool,
    execute it and feed the result back. Returns the final text response.

    tool_lookup: dict mapping tool_name -> ToolRef (from services.tools)
                 OR dict mapping tool_name -> AgentTool (legacy webhook-only)
    max_iterations: max tool-use loop iterations (3 default, 5 with chaining)
    on_tool_event: optional callback({"step": int, "tool": str, "status": str})
    """
    from services.claude import call_with_tools as _sdk_call
    from services.tools import ToolRef, execute_tool_call

    # Add instruction to always provide text answer
    enhanced_system = system + "\n\nIMPORTANT: You MUST always provide a complete text answer to the user's question. If you also call tools, you must STILL include your full written answer."

    if max_iterations > 3:
        enhanced_system += "\n\nYou can chain multiple tools together to accomplish complex tasks. After receiving a tool result, you may call another tool if needed before giving your final answer. Think step by step about which tools to use and in what order."

    current_messages = list(messages)
    all_text_parts = []  # Collect text across all iterations

    for iteration in range(max_iterations):
        try:
            response = _sdk_call(
                messages=current_messages,
                system=enhanced_system,
                tools=tools,
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

                if on_tool_event:
                    on_tool_event({"step": iteration + 1, "tool": tool_name, "status": "calling"})

                ref = tool_lookup.get(tool_name)

                if ref is None:
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": json.dumps({"error": f"Tool '{tool_name}' not found"}),
                    })
                    continue

                # Route to unified executor if using ToolRef, legacy path otherwise
                # Check if fire-and-forget BEFORE executing
                is_fire_forget = False
                if isinstance(ref, ToolRef) and ref.source == "webhook" and ref.webhook_tool:
                    is_fire_forget = ref.webhook_tool.fire_and_forget
                elif not isinstance(ref, ToolRef) and hasattr(ref, 'fire_and_forget'):
                    is_fire_forget = ref.fire_and_forget

                if is_fire_forget:
                    # Extract ALL data from ORM objects NOW, before the session closes
                    # Background threads can't access detached ORM objects
                    import threading

                    if isinstance(ref, ToolRef) and ref.webhook_tool:
                        wt = ref.webhook_tool
                        tool_snapshot = {
                            "url": wt.url,
                            "method": wt.method or "POST",
                            "headers": wt.headers or "{}",
                            "auth_type": wt.auth_type,
                            "auth_value": wt.auth_value,
                            "payload_template": wt.payload_template or "{}",
                        }
                    elif hasattr(ref, 'url'):
                        tool_snapshot = {
                            "url": ref.url,
                            "method": ref.method or "POST",
                            "headers": ref.headers or "{}",
                            "auth_type": ref.auth_type,
                            "auth_value": ref.auth_value,
                            "payload_template": ref.payload_template or "{}",
                        }
                    else:
                        tool_snapshot = None

                    def _bg_fire(snapshot, name, inp):
                        """Make HTTP call using plain dict data — no ORM objects."""
                        try:
                            import time
                            time.sleep(1)

                            if not snapshot:
                                print(f"  [Tools] BG {name}: no snapshot, skipping")
                                return

                            url = snapshot["url"]
                            headers = json.loads(snapshot["headers"])
                            headers.setdefault("Content-Type", "application/json")

                            if snapshot["auth_type"] == "bearer" and snapshot["auth_value"]:
                                headers["Authorization"] = f"Bearer {snapshot['auth_value']}"
                            elif snapshot["auth_type"] == "api_key" and snapshot["auth_value"]:
                                headers["X-API-Key"] = snapshot["auth_value"]

                            # Build payload — forward raw input if default template
                            template = json.loads(snapshot["payload_template"])
                            default_templates = [
                                {},
                                {"question": "{{question}}", "answer": "{{answer}}"},
                            ]
                            if template in default_templates:
                                payload = {k: v for k, v in inp.items() if k not in ("reason", "_tool_id")}
                            else:
                                payload = _render_template(template, inp)

                            data = json.dumps(payload).encode() if snapshot["method"] in ("POST", "PUT", "PATCH") else None
                            print(f"  [Tools] BG {name}: {snapshot['method']} {url} payload={json.dumps(payload)[:200]}")

                            req = urllib.request.Request(url, data=data, headers=headers, method=snapshot["method"])
                            with urllib.request.urlopen(req, timeout=15) as resp:
                                body = resp.read().decode("utf-8", errors="replace")[:500]
                                print(f"  [Tools] BG {name}: {resp.status} — {body[:100]}")
                        except Exception as e:
                            print(f"  [Tools] BG {name} failed: {e}")

                    t = threading.Thread(target=_bg_fire, args=(tool_snapshot, tool_name, tool_input))
                    t.daemon = True
                    t.start()

                    # Update execution count while session is still open
                    if db_session:
                        try:
                            if isinstance(ref, ToolRef) and ref.webhook_tool:
                                ref.webhook_tool.execution_count = (ref.webhook_tool.execution_count or 0) + 1
                                ref.webhook_tool.last_executed_at = datetime.utcnow()
                            elif hasattr(ref, 'execution_count'):
                                ref.execution_count = (ref.execution_count or 0) + 1
                                ref.last_executed_at = datetime.utcnow()
                            db_session.commit()
                        except Exception:
                            pass

                    exec_result = {"status": "ok", "body": "fired"}
                    print(f"  [Tools] Fire-and-forget {tool_name}: dispatched to background")
                else:
                    if isinstance(ref, ToolRef):
                        exec_result = execute_tool_call(tool_name, tool_input, tool_lookup, db_session)
                    else:
                        exec_result = execute_tool(ref, tool_input)
                        if db_session:
                            try:
                                ref.execution_count = (ref.execution_count or 0) + 1
                                ref.last_executed_at = datetime.utcnow()
                                db_session.commit()
                            except Exception:
                                pass

                    print(f"  [Tools] Executed {tool_name}: status={exec_result['status']}")

                # Build tool result for Claude
                if is_fire_forget:
                    result_content = json.dumps({
                        "status": "executed",
                        "message": "Webhook fired successfully" if exec_result["status"] == "ok" else f"Webhook failed: {exec_result['body'][:200]}"
                    })
                else:
                    result_content = exec_result.get("body", "")[:2000] or json.dumps(exec_result)

                if on_tool_event:
                    on_tool_event({"step": iteration + 1, "tool": tool_name, "status": "done"})

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