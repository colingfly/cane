"""
services/mcp_client.py — MCP (Model Context Protocol) client.

Handles communication with MCP servers:
  - Tool discovery via tools/list
  - Tool execution via tools/call
  - Supports both Streamable HTTP and SSE transports

Usage:
    from services.mcp_client import discover_tools, execute_tool

    tools = discover_tools("https://mcp.example.com/sse", auth_headers={})
    result = execute_tool("https://mcp.example.com/sse", "tool_name", {"arg": "value"}, auth_headers={})
"""
import json
import time
import urllib.request
import urllib.error
from dataclasses import dataclass


@dataclass
class McpTool:
    """A tool discovered from an MCP server."""
    name: str
    description: str
    input_schema: dict

    def to_claude_format(self) -> dict:
        """Convert to Claude API tool definition."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


@dataclass
class McpResult:
    """Result of an MCP operation."""
    ok: bool
    data: dict | list | None = None
    error: str = ""
    latency_ms: int = 0


# ── JSON-RPC helpers ──

_request_id = 0

def _next_id() -> int:
    global _request_id
    _request_id += 1
    return _request_id


def _jsonrpc_request(method: str, params: dict = None) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": _next_id(),
        "method": method,
        "params": params or {},
    }


def _build_auth_headers(auth_type: str, auth_header: str, auth_value: str) -> dict:
    """Build HTTP headers from MCP server auth config."""
    headers = {"Content-Type": "application/json"}
    if not auth_value or auth_type == "none":
        return headers

    if auth_type == "bearer":
        headers[auth_header or "Authorization"] = f"Bearer {auth_value}"
    elif auth_type == "api_key":
        headers[auth_header or "X-API-Key"] = auth_value
    elif auth_type == "header":
        headers[auth_header or "Authorization"] = auth_value

    return headers


# ── Streamable HTTP transport ──

def _post_jsonrpc(url: str, payload: dict, headers: dict, timeout: int = 15) -> dict:
    """Send a JSON-RPC request via HTTP POST and return the parsed response."""
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8", errors="replace")

        # Some MCP servers return SSE-wrapped responses
        if body.strip().startswith("event:") or body.strip().startswith("data:"):
            return _parse_sse_response(body)

        return json.loads(body)


def _parse_sse_response(body: str) -> dict:
    """Extract JSON-RPC response from SSE-formatted body."""
    for line in body.split("\n"):
        line = line.strip()
        if line.startswith("data:"):
            json_str = line[5:].strip()
            if json_str and json_str != "[DONE]":
                try:
                    return json.loads(json_str)
                except json.JSONDecodeError:
                    continue
    return {"error": {"code": -1, "message": "No valid response in SSE stream"}}


# ── SSE transport (connect, get endpoint, then POST) ──

def _discover_sse_endpoint(url: str, headers: dict, timeout: int = 10) -> str | None:
    """
    Connect to an SSE endpoint and look for the session endpoint URL.
    MCP SSE servers send an 'endpoint' event with the URL to POST to.
    """
    get_headers = {k: v for k, v in headers.items() if k != "Content-Type"}
    get_headers["Accept"] = "text/event-stream"
    req = urllib.request.Request(url, headers=get_headers, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if line.startswith("data:"):
                    data = line[5:].strip()
                    # Some servers send the endpoint as plain text
                    if data.startswith("http"):
                        return data
                    # Others send JSON
                    try:
                        parsed = json.loads(data)
                        if isinstance(parsed, dict) and "endpoint" in parsed:
                            return parsed["endpoint"]
                    except json.JSONDecodeError:
                        pass
                # Also check for event: endpoint
                if line.startswith("event:") and "endpoint" in line.lower():
                    continue  # Next data: line will have the URL
    except Exception:
        pass

    return None


# ── Public API ──

def discover_tools(
    server_url: str,
    auth_type: str = "none",
    auth_header: str = "Authorization",
    auth_value: str = "",
) -> McpResult:
    """
    Connect to an MCP server and discover available tools.

    Tries Streamable HTTP first, falls back to SSE transport.
    Returns McpResult with data=[list of tool dicts].
    """
    headers = _build_auth_headers(auth_type, auth_header, auth_value)
    start = time.time()

    # 1) Try initialization + tools/list via Streamable HTTP
    try:
        # Initialize
        init_req = _jsonrpc_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "cane", "version": "1.0.0"},
        })
        init_resp = _post_jsonrpc(server_url, init_req, headers, timeout=10)

        if "error" in init_resp and "result" not in init_resp:
            # Might be SSE transport — try that path
            raise ValueError("Streamable HTTP failed, trying SSE")

        # Send initialized notification (no response expected, but some servers need it)
        try:
            notif = {"jsonrpc": "2.0", "method": "notifications/initialized"}
            _post_jsonrpc(server_url, notif, headers, timeout=5)
        except Exception:
            pass

        # List tools
        list_req = _jsonrpc_request("tools/list")
        list_resp = _post_jsonrpc(server_url, list_req, headers, timeout=15)

        tools = _extract_tools(list_resp)
        latency = int((time.time() - start) * 1000)

        return McpResult(ok=True, data=tools, latency_ms=latency)

    except Exception as http_err:
        pass

    # 2) Fallback: try SSE transport
    try:
        endpoint = _discover_sse_endpoint(server_url, headers)
        if endpoint:
            # Initialize via the SSE endpoint
            init_req = _jsonrpc_request("initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "cane", "version": "1.0.0"},
            })
            _post_jsonrpc(endpoint, init_req, headers, timeout=10)

            # List tools
            list_req = _jsonrpc_request("tools/list")
            list_resp = _post_jsonrpc(endpoint, list_req, headers, timeout=15)

            tools = _extract_tools(list_resp)
            latency = int((time.time() - start) * 1000)

            return McpResult(ok=True, data=tools, latency_ms=latency)
    except Exception as sse_err:
        latency = int((time.time() - start) * 1000)
        return McpResult(
            ok=False,
            error=f"Could not connect to MCP server: {str(sse_err)[:200]}",
            latency_ms=latency,
        )

    latency = int((time.time() - start) * 1000)
    return McpResult(ok=False, error="Could not connect via HTTP or SSE transport", latency_ms=latency)


def execute_tool(
    server_url: str,
    tool_name: str,
    arguments: dict,
    auth_type: str = "none",
    auth_header: str = "Authorization",
    auth_value: str = "",
) -> McpResult:
    """
    Execute a tool on an MCP server.

    Returns McpResult with data=tool execution result.
    """
    headers = _build_auth_headers(auth_type, auth_header, auth_value)
    start = time.time()

    call_req = _jsonrpc_request("tools/call", {
        "name": tool_name,
        "arguments": arguments,
    })

    try:
        resp = _post_jsonrpc(server_url, call_req, headers, timeout=30)
        latency = int((time.time() - start) * 1000)

        if "error" in resp and "result" not in resp:
            error = resp["error"]
            msg = error.get("message", str(error)) if isinstance(error, dict) else str(error)
            return McpResult(ok=False, error=msg, latency_ms=latency)

        result = resp.get("result", {})
        return McpResult(ok=True, data=result, latency_ms=latency)

    except Exception as e:
        latency = int((time.time() - start) * 1000)
        return McpResult(ok=False, error=str(e)[:500], latency_ms=latency)


def _extract_tools(response: dict) -> list[dict]:
    """Extract tool definitions from a tools/list response."""
    result = response.get("result", {})

    # Standard: result.tools is the array
    tools = result.get("tools", [])
    if isinstance(tools, list):
        return tools

    # Some servers put tools directly in result
    if isinstance(result, list):
        return result

    return []
