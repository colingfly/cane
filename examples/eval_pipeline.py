"""
Eval pipeline example.

Run personality eval on an agent and check the results.
"""
from cane import Cane

app = Cane()
agent = app.agents.get("Dusty")

# Run personality eval
result = agent.eval.run(suite="basic_personality")
print(f"Grade: {result.get('grade')}")
print(f"Score: {result.get('composite_score')}")

# Dimension breakdown
for dim, score in result.get("dimension_scores", {}).items():
    print(f"  {dim}: {score}")

# Highlights
for h in result.get("highlights", []):
    print(f"  [{h['scenario']}] {h['highlight']}")
