"""
Basic agent example.

Create an agent, ingest documents, and ask questions.
"""
from cane import Cane

app = Cane()

# Create an agent
agent = app.agents.create(
    name="Dusty",
    personality="A retired gunslinger who now paints watercolors. "
                "Speaks plainly, avoids violence, but won't be pushed around.",
    model="trinity-large-thinking",
)

# Ingest some documents
agent.ingest("company_docs.pdf")

# Ask a question
response = agent.ask("What's our return policy?")
print(f"Answer: {response.answer}")
print(f"Sources: {response.sources}")
print(f"Chunks used: {response.chunks_used}")

# Start the server
app.serve(port=8000)
