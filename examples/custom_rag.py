"""
Custom RAG example.

Use Cane's RAG pipeline directly without the agent wrapper.
"""
from cane import Cane

app = Cane()

# Use the RAG pipeline directly
from cane.rag.context import build_context, build_system_prompt, call_claude

# Build context from a workspace's documents
ctx = build_context(
    query="What are the key metrics?",
    tenant_id="your-tenant-id",
    workspace_id="your-workspace-id",
    n=5,
)

print(f"Found {ctx.chunks_used} relevant chunks")
print(f"Sources: {ctx.sources}")

# Generate answer
system = build_system_prompt("You are a data analyst.")
answer = call_claude(
    f"Question: What are the key metrics?\n\nDocuments:\n{ctx.context}",
    system=system,
)
print(f"Answer: {answer}")
