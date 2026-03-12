# Cane Python SDK

Python client for the [Cane](https://cane.fyi) agentic AI platform.

## Install

```bash
pip install cane
```

## Quick Start

```python
from cane import Cane

client = Cane(api_key="cane_your_key_here")

# Ask a question against your documents
result = client.ask("What is our refund policy?", workspace_id="your-agent-id")
print(result["answer"])

# Search documents
results = client.search("onboarding procedures", workspace_id="your-agent-id")
for chunk in results["results"]:
    print(chunk["text"][:100], chunk["score"])
```

## Register External Agents

Plug agents from any framework into Cane's network graph and observability layer.

```python
# Register an agent running on your own infrastructure
agent = client.register_agent(
    name="Compliance Checker",
    description="Validates documents against SEC regulations",
    endpoint="https://your-server.com/agents/compliance",
    auth_type="bearer",
    auth_token="your-agent-api-key",
)
print(agent["agent_id"])

# Link it as a sub-agent of an existing Cane agent
client.link_agent(
    agent_id=agent["agent_id"],
    parent_agent_id="your-parent-agent-id",
    tool_name="compliance_check",
    tool_description="Check documents for regulatory compliance",
)

# List all agents (native + external)
agents = client.agents()
for a in agents["agents"]:
    print(f"{a['name']} ({a['type']})")
```

## Observability

Log communications between your agents so they show up in Cane's network graph.

```python
# Log a call between two agents
client.log(
    caller_id="agent-a-id",
    callee_id="agent-b-id",
    query="What are the Q4 revenue numbers?",
    response="Q4 revenue was $12.3M, up 18% YoY.",
    duration_ms=1250,
)

# Get the full network graph
network = client.network()
print(f"Agents: {len(network['nodes'])}")
print(f"Connections: {len(network['edges'])}")
print(f"Total calls: {network['stats']['total_communications']}")
```

## External Agent Endpoint Format

When Cane delegates to your external agent, it sends a POST request:

```json
{
    "query": "The user's question or delegated task"
}
```

Your endpoint should return JSON with the response in one of these fields:

```json
{
    "response": "Your agent's answer"
}
```

Also accepted: `{"answer": "..."}` or `{"result": "..."}`.

## Error Handling

```python
from cane import Cane, CaneAPIError, CaneConnectionError

client = Cane(api_key="cane_xxx")

try:
    result = client.ask("question", workspace_id="xxx")
except CaneAPIError as e:
    print(f"API error {e.status_code}: {e.message}")
except CaneConnectionError as e:
    print(f"Connection failed: {e.message}")
```

## Context Manager

```python
with Cane(api_key="cane_xxx") as client:
    result = client.ask("question", workspace_id="xxx")
```
