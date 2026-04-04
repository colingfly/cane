"""
softmax/app.py -- Softmax.pro application entry point.

This is how softmax.pro uses the Cane package. It's just a Cane app
with specific configuration for the hosted platform.

Usage:
    python -m softmax.app
"""
from cane import Cane

app = Cane(
    enable_game=True,
    enable_marketplace=True,
)

if __name__ == "__main__":
    app.serve(host="0.0.0.0", port=8000)
