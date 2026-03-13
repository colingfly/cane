"""
Cane Python SDK client.

Usage:
    from cane import Cane

    client = Cane(api_key="cane_xxx")
    result = client.ask("What is our refund policy?", workspace_id="xxx")
"""
import httpx
from .exceptions import CaneAPIError, CaneConnectionError


class Cane:
    """Client for the Cane agentic AI platform API."""

    def __init__(self, api_key: str, base_url: str = "https://cane.fyi", timeout: float = 30.0):
        """
        Initialize the Cane client.

        Args:
            api_key: Your Cane API key (starts with "cane_").
            base_url: Base URL of your Cane instance.
            timeout: Request timeout in seconds.
        """
        if not api_key or not api_key.startswith("cane_"):
            raise ValueError("api_key must start with 'cane_'")

        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )

    def _request(self, method: str, path: str, json: dict = None) -> dict:
        """Send a request and return the parsed JSON response."""
        try:
            resp = self._client.request(method, path, json=json)
        except httpx.ConnectError as e:
            raise CaneConnectionError(f"Cannot connect to {self._base_url}: {e}")
        except httpx.TimeoutException as e:
            raise CaneConnectionError(f"Request timed out: {e}")
        except httpx.HTTPError as e:
            raise CaneConnectionError(f"HTTP error: {e}")

        if resp.status_code >= 400:
            try:
                body = resp.json()
            except Exception:
                body = {"detail": resp.text}
            message = body.get("detail", body.get("message", resp.text))
            raise CaneAPIError(resp.status_code, str(message), body)

        try:
            return resp.json()
        except Exception:
            return {"raw": resp.text}

    # ---- Existing endpoints ----

    def ask(self, query: str, workspace_id: str = "", max_chunks: int = 5, history: list = None) -> dict:
        """
        Ask a question against your documents.

        Args:
            query: The question to ask.
            workspace_id: Agent/workspace to query. Uses API key scope if omitted.
            max_chunks: Max document chunks to include (1-20).
            history: Conversation history as [{role, content}, ...].

        Returns:
            Dict with answer, sources, chunks_used, model.
        """
        payload = {"query": query, "max_chunks": max_chunks}
        if workspace_id:
            payload["workspace_id"] = workspace_id
        if history:
            payload["history"] = history
        return self._request("POST", "/v1/ask", json=payload)

    def search(self, query: str, workspace_id: str = "", max_results: int = 10) -> dict:
        """
        Search documents and return raw chunks with scores.

        Args:
            query: Search query.
            workspace_id: Agent/workspace to search. Uses API key scope if omitted.
            max_results: Max results to return (1-50).

        Returns:
            Dict with results, query, total.
        """
        payload = {"query": query, "max_results": max_results}
        if workspace_id:
            payload["workspace_id"] = workspace_id
        return self._request("POST", "/v1/search", json=payload)

    def health(self) -> dict:
        """Check API health. Returns {status, service, api_version}."""
        return self._request("GET", "/v1/health")

    # ---- Agent registry ----

    def register_agent(
        self,
        name: str,
        description: str,
        endpoint: str,
        auth_type: str = "none",
        auth_token: str = "",
        icon: str = "",
        parameters: list = None,
    ) -> dict:
        """
        Register an external agent into the Cane network.

        The agent gets a workspace ID and appears in the network graph.
        When a native Cane agent delegates to it, Cane POSTs to the endpoint.

        Args:
            name: Agent name.
            description: What this agent does (used for routing decisions).
            endpoint: HTTP endpoint URL that accepts POST with {"query": "..."}.
            auth_type: "bearer", "header", or "none".
            auth_token: Auth token (encrypted at rest).
            icon: Emoji or short icon string.
            parameters: Expected input parameters as a JSON array.

        Returns:
            Dict with agent_id, name, type.
        """
        payload = {
            "name": name,
            "description": description,
            "endpoint": endpoint,
            "auth_type": auth_type,
        }
        if auth_token:
            payload["auth_token"] = auth_token
        if icon:
            payload["icon"] = icon
        if parameters:
            payload["parameters"] = parameters
        return self._request("POST", "/v1/agents/register", json=payload)

    def agents(self) -> dict:
        """
        List all agents (native and external) in your tenant.

        Returns:
            Dict with agents list and total count.
        """
        return self._request("GET", "/v1/agents")

    def link_agent(
        self,
        agent_id: str,
        parent_agent_id: str,
        tool_name: str,
        tool_description: str,
    ) -> dict:
        """
        Link an agent as a sub-agent of another (create a delegation edge).

        Args:
            agent_id: The child agent to be called.
            parent_agent_id: The parent agent that will delegate.
            tool_name: Name Claude sees for this tool (e.g. "compliance_check").
            tool_description: When to delegate (e.g. "Check regulatory compliance").

        Returns:
            Dict with link_id, parent, child.
        """
        return self._request("POST", f"/v1/agents/{agent_id}/link", json={
            "parent_agent_id": parent_agent_id,
            "tool_name": tool_name,
            "tool_description": tool_description,
        })

    def delete_agent(self, agent_id: str) -> dict:
        """
        Remove an external agent and its workspace.

        Args:
            agent_id: The agent to delete.

        Returns:
            Dict with deleted agent_id.
        """
        return self._request("DELETE", f"/v1/agents/{agent_id}")

    # ---- Observability ----

    def network(self) -> dict:
        """
        Get the full agent network graph.

        Returns:
            Dict with nodes (agents), edges (links), and stats.
        """
        return self._request("GET", "/v1/network")

    def log(
        self,
        caller_id: str,
        callee_id: str,
        query: str,
        response: str,
        duration_ms: int,
        status: str = "ok",
    ) -> dict:
        """
        Log an agent-to-agent communication for observability.

        Logged calls appear in the network graph and audit trail.

        Args:
            caller_id: The agent that made the call.
            callee_id: The agent that was called.
            query: What was sent.
            response: What was returned.
            duration_ms: How long the call took.
            status: "ok" or "error".

        Returns:
            Dict with logged status and communication ID.
        """
        return self._request("POST", "/v1/log", json={
            "caller_id": caller_id,
            "callee_id": callee_id,
            "query": query,
            "response": response,
            "duration_ms": duration_ms,
            "status": status,
        })

    # ── Failure Mining ──

    def mine_failures(
        self,
        environment_id: str,
        run_ids: list = None,
        max_score: float = 60,
        strategy: str = "llm_rewrite",
        max_examples: int = 100,
    ) -> dict:
        """
        Trigger failure mining on eval results. Generates improved answers
        for low-scoring responses to create DPO training pairs.

        Args:
            environment_id: ID of the eval environment to mine.
            run_ids: Optional list of specific run IDs to mine. Defaults to all completed runs.
            max_score: Mine results scoring at or below this threshold (0-100, default 60).
            strategy: Rewrite strategy. Currently only "llm_rewrite" is supported.
            max_examples: Maximum number of failures to process (default 100).

        Returns:
            dict with job_id and status ("pending"). Poll with mining_job() to check progress.
        """
        import json
        from urllib.parse import urlencode
        params = {
            "environment_id": environment_id,
            "max_score": max_score,
            "strategy": strategy,
            "max_examples": max_examples,
        }
        if run_ids:
            params["run_ids"] = json.dumps(run_ids)
        qs = urlencode(params)
        return self._request("POST", f"/v1/eval/mine?{qs}")

    def mining_job(self, job_id: str) -> dict:
        """
        Get mining job status and results.

        Args:
            job_id: ID of the mining job.

        Returns:
            dict with job status, failure type distribution, and mined examples.
        """
        return self._request("GET", f"/v1/eval/mine/{job_id}")

    def export_mined(self, job_id: str, format: str = "dpo") -> str:
        """
        Export mined training data as JSONL.

        Args:
            job_id: ID of the completed mining job.
            format: Export format - "dpo" or "sft" (default "dpo").

        Returns:
            JSONL string of training examples.
        """
        response = self._client.get(
            f"{self._base_url}/v1/eval/mine/{job_id}/export",
            params={"format": format},
        )
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail", response.text)
            except Exception:
                detail = response.text
            raise CaneAPIError(response.status_code, detail)
        return response.text

    # -- Eval Scheduling --

    def create_eval_schedule(
        self,
        environment_id: str,
        schedule_type: str = "daily",
        daily_time: str = "09:00",
        interval_hours: int = 24,
        auto_mine: bool = False,
        notify_on_regression: bool = True,
    ) -> dict:
        """
        Create or update an eval schedule for an environment.

        Args:
            environment_id: The eval environment ID.
            schedule_type: "daily" or "interval".
            daily_time: HH:MM (UTC) for daily schedules.
            interval_hours: Hours between runs for interval schedules.
            auto_mine: Auto-trigger failure mining after each run.
            notify_on_regression: Fire webhook when score drops.

        Returns:
            Schedule info with schedule_id and next_run_at.
        """
        from urllib.parse import urlencode
        params = urlencode({
            "schedule_type": schedule_type,
            "daily_time": daily_time,
            "interval_hours": interval_hours,
            "auto_mine": str(auto_mine).lower(),
            "notify_on_regression": str(notify_on_regression).lower(),
        })
        return self._request("POST", f"/v1/eval/schedule/{environment_id}?{params}")

    def get_eval_schedule(self, environment_id: str) -> dict:
        """
        Get the eval schedule for an environment.

        Args:
            environment_id: The eval environment ID.

        Returns:
            Schedule details or None if not configured.
        """
        return self._request("GET", f"/v1/eval/schedule/{environment_id}")

    def delete_eval_schedule(self, environment_id: str) -> dict:
        """
        Delete the eval schedule for an environment.

        Args:
            environment_id: The eval environment ID.

        Returns:
            Confirmation dict.
        """
        return self._request("DELETE", f"/v1/eval/schedule/{environment_id}")

    def close(self):
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
