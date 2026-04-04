"""
Cane -- Open-source agentic infrastructure.

Build, eval, fine-tune, and deploy AI agents.

Usage:
    from cane import Cane

    app = Cane()
    agent = app.agents.create(name="Dusty", personality="A retired gunslinger")
    agent.ingest("docs/")
    response = agent.ask("What's in these documents?")
    app.serve(port=8000)
"""

__version__ = "0.1.0"

from cane.app import Cane

__all__ = ["Cane", "__version__"]
