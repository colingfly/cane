"""
judge_providers.py -- Multi-model judge providers for the eval engine.

Abstracts the LLM call so the judge can use any supported model provider:
Anthropic, OpenAI, Google Gemini, or any OpenAI-compatible endpoint
(Ollama, Mistral, vLLM, LiteLLM, Together, Groq).

Ported from cane-eval's providers.py for platform-side multi-model judging.

Usage:
    from cane.inference.providers import get_provider

    # Anthropic (default)
    provider = get_provider("anthropic", model="claude-sonnet-4-5-20250929")

    # OpenAI
    provider = get_provider("openai", model="gpt-4o")

    # Any provider
    text = provider.call(prompt="Evaluate this.", system="You are a judge.")
"""

import os
from typing import Optional, Protocol


class LLMProvider(Protocol):
    """Interface that all judge providers implement."""

    model: str

    def call(
        self,
        prompt: str,
        system: str = "",
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> str: ...

    @staticmethod
    def env_key() -> str: ...

    @staticmethod
    def display_name() -> str: ...


# ---- Anthropic ----

class AnthropicProvider:
    """Anthropic Claude provider (default)."""

    def __init__(self, model: str = "claude-sonnet-4-5-20250929", api_key: Optional[str] = None):
        import anthropic
        self.model = model
        key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self._client = anthropic.Anthropic(api_key=key)

    def call(self, prompt: str, system: str = "", max_tokens: int = 1024, temperature: float = 0.2) -> str:
        response = self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text

    @staticmethod
    def env_key() -> str:
        return "ANTHROPIC_API_KEY"

    @staticmethod
    def display_name() -> str:
        return "Anthropic"


# ---- OpenAI ----

class OpenAIProvider:
    """OpenAI provider (GPT-4o, GPT-4.1, etc)."""

    def __init__(self, model: str = "gpt-4o", api_key: Optional[str] = None):
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("OpenAI provider requires the openai package: pip install openai")
        self.model = model
        self._client = OpenAI(api_key=api_key) if api_key else OpenAI()

    def call(self, prompt: str, system: str = "", max_tokens: int = 1024, temperature: float = 0.2) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        response = self._client.chat.completions.create(
            model=self.model, messages=messages, max_tokens=max_tokens, temperature=temperature,
        )
        return response.choices[0].message.content

    @staticmethod
    def env_key() -> str:
        return "OPENAI_API_KEY"

    @staticmethod
    def display_name() -> str:
        return "OpenAI"


# ---- Google Gemini ----

class GeminiProvider:
    """Google Gemini provider."""

    def __init__(self, model: str = "gemini-2.0-flash", api_key: Optional[str] = None):
        try:
            from google import genai
        except ImportError:
            raise ImportError("Gemini provider requires the google-genai package: pip install google-genai")
        key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self.model = model
        self._client = genai.Client(api_key=key)

    def call(self, prompt: str, system: str = "", max_tokens: int = 1024, temperature: float = 0.2) -> str:
        from google.genai import types
        config = types.GenerateContentConfig(
            system_instruction=system if system else None,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        response = self._client.models.generate_content(model=self.model, contents=prompt, config=config)
        return response.text

    @staticmethod
    def env_key() -> str:
        return "GEMINI_API_KEY"

    @staticmethod
    def display_name() -> str:
        return "Google Gemini"


# ---- OpenAI-Compatible (Ollama, Mistral, vLLM, LiteLLM, Together, Groq) ----

class OpenAICompatibleProvider:
    """Any OpenAI-compatible endpoint (Ollama, Mistral, vLLM, Together, Groq, Deepseek, Fireworks)."""

    def __init__(self, model: str = "llama3", api_key: Optional[str] = None, base_url: Optional[str] = None):
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("OpenAI-compatible provider requires the openai package: pip install openai")
        if not base_url:
            raise ValueError("OpenAI-compatible provider requires a base_url (e.g. http://localhost:11434/v1)")
        self.model = model
        self.base_url = base_url
        self._client = OpenAI(api_key=api_key or "none", base_url=base_url)

    def call(self, prompt: str, system: str = "", max_tokens: int = 1024, temperature: float = 0.2) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        response = self._client.chat.completions.create(
            model=self.model, messages=messages, max_tokens=max_tokens, temperature=temperature,
        )
        return response.choices[0].message.content

    @staticmethod
    def env_key() -> str:
        return "OPENAI_API_KEY"

    @staticmethod
    def display_name() -> str:
        return "OpenAI-Compatible"


# ---- Provider registry ----

PROVIDERS = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
    "openai-compatible": OpenAICompatibleProvider,
}

PROVIDER_ALIASES = {
    "claude": "anthropic",
    "gpt": "openai",
    "google": "gemini",
    "openrouter": "openai-compatible",
    "ollama": "openai-compatible",
    "mistral": "openai-compatible",
    "vllm": "openai-compatible",
    "litellm": "openai-compatible",
    "together": "openai-compatible",
    "groq": "openai-compatible",
    "deepseek": "openai-compatible",
    "fireworks": "openai-compatible",
    "trinity": "openai-compatible",
    "qwen": "openai-compatible",
    "arcee": "openai-compatible",
}

DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-5-20250929",
    "openai": "gpt-4o",
    "gemini": "gemini-2.0-flash",
    "openai-compatible": "llama3",
}


def get_provider(
    provider: str = "anthropic",
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> LLMProvider:
    """Get an LLM provider instance by name (or alias)."""
    resolved = PROVIDER_ALIASES.get(provider.lower(), provider.lower())

    if resolved not in PROVIDERS:
        available = ", ".join(sorted(set(list(PROVIDERS.keys()) + list(PROVIDER_ALIASES.keys()))))
        raise ValueError(f"Unknown provider: {provider!r}. Available: {available}")

    cls = PROVIDERS[resolved]
    model = model or DEFAULT_MODELS.get(resolved, "")

    kwargs = {"model": model}
    if api_key:
        kwargs["api_key"] = api_key

    # Auto-configure OpenRouter when detected
    if resolved == "openai-compatible":
        if base_url:
            kwargs["base_url"] = base_url
        elif provider.lower() == "openrouter":
            kwargs["base_url"] = "https://openrouter.ai/api/v1"
            if not api_key:
                kwargs["api_key"] = os.environ.get("OPENROUTER_API_KEY", "none")

    return cls(**kwargs)


def detect_provider_from_model(model: str) -> str:
    """Auto-detect provider from model name prefix or path."""
    model_lower = model.lower()
    if model_lower.startswith("claude"):
        return "anthropic"
    if model_lower.startswith(("gpt-", "o1-", "o3-", "ft:")):
        return "openai"
    if model_lower.startswith("gemini"):
        return "gemini"
    # OpenRouter-style model IDs use org/model format
    if "/" in model_lower:
        return "openrouter"
    return "anthropic"
