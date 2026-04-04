"""
agent_prompts.py — Auto-generation of agent system prompts.

Custom agents use Claude to auto-generate a prompt from uploaded content.
"""
import json
from cane.core.config import ANTHROPIC_API_KEY


# ── Auto-generate prompt for custom agents ──

def auto_generate_prompt(document_previews: list[dict], base_prompt: str = "") -> str:
    """
    Send document previews to Claude and get back a domain-specific system prompt.
    If base_prompt is provided, refines it with document-specific knowledge rather
    than generating from scratch.

    Args:
        document_previews: List of {"filename": str, "preview": str} dicts
        base_prompt: Optional existing prompt to refine (e.g., from a template)

    Returns:
        Generated system prompt string, or empty string on failure
    """
    if not ANTHROPIC_API_KEY or not document_previews:
        return ""

    doc_descriptions = []
    for i, doc in enumerate(document_previews[:10], 1):
        preview = doc.get("preview", "")[:2000]
        fname = doc.get("filename", f"Document {i}")
        doc_descriptions.append(f"--- {fname} ---\n{preview}")

    docs_text = "\n\n".join(doc_descriptions)

    if base_prompt and base_prompt.strip():
        meta_prompt = f"""You are refining an existing system prompt for a RAG (retrieval-augmented generation) Q&A assistant. The current prompt provides the general structure and rules. Your job is to enhance it with specific knowledge from the actual documents this assistant will use.

CURRENT PROMPT:
{base_prompt}

DOCUMENTS:
{docs_text}

Refine the prompt by:
1. Keeping the existing role, tone, and behavioral rules intact
2. Adding specific domain terminology, named entities, programs, and concepts found in the documents
3. Adding document-specific handling instructions (e.g., how to handle acronyms, specific formats, or domain conventions found in the content)
4. Noting key topics the assistant should be prepared to answer about
5. Adding any special considerations based on the actual content (regulatory language, technical depth, etc.)

CRITICAL RULES TO PRESERVE AND REINFORCE:
- The assistant answers ONLY based on provided document excerpts — never fabricate
- When listing items, search ALL provided excerpts before presenting a list
- If information might be incomplete due to retrieval, acknowledge this
- Include specific terminology and named entities from the documents

FORMAT:
- Keep the prompt under 600 words — concise and actionable
- Start directly with "You are..." — no preamble
- Preserve the spirit of the original prompt while making it document-aware
- Return ONLY the refined system prompt text, nothing else."""
    else:
        meta_prompt = f"""Analyze the following document previews and generate a specialized system prompt for a RAG (retrieval-augmented generation) Q&A assistant that will answer questions about this content.

DOCUMENTS:
{docs_text}

Generate a system prompt that:
1. Identifies the domain/field these documents cover
2. Lists key concepts, terminology, and named entities found in the content (programs, initiatives, tools, people, organizations)
3. Specifies how the assistant should handle domain-specific terms — use exact names from the documents
4. Defines the appropriate answer style (technical depth, tone, format)
5. Notes any special considerations (e.g., government language, acronyms, technical specs)

CRITICAL RULES TO INCLUDE IN THE PROMPT:
- The assistant answers ONLY based on provided document excerpts — never fabricate
- When listing items, the assistant must search ALL provided excerpts before presenting a list, and should say "Based on the available excerpts" rather than presenting a partial list as definitive
- Before concluding that information is not in the documents, the assistant must carefully check all excerpts — do not say "not documented" after checking only a subset
- If information might be incomplete due to retrieval, acknowledge this rather than presenting partial info as complete
- Include specific terminology and named entities from the documents so the assistant handles domain jargon correctly

FORMAT:
- Keep the prompt under 500 words — concise and actionable
- Start directly with "You are..." — no preamble
- Return ONLY the system prompt text, nothing else."""

    try:
        from cane.inference.claude import call
        prompt = call(
            meta_prompt,
            model="claude-sonnet-4-5-20250929",
            max_tokens=800,
            temperature=0.3,
        )
        if prompt:
            print(f"  [Agent] Auto-generated prompt ({len(prompt)} chars)")
            return prompt
    except Exception as e:
        print(f"  [Agent] Auto-generate failed: {e}")

    return ""


def generate_replica_prompt(personality: dict, writing_samples: str = "") -> str:
    """
    Generate a personalized digital replica system prompt from personality answers
    and writing sample analysis.

    Args:
        personality: dict with keys like name, role, style, topics, traits
        writing_samples: concatenated text from uploaded writing samples

    Returns:
        Personalized system prompt string
    """
    if not ANTHROPIC_API_KEY:
        return ""

    name = personality.get("name", "this person")
    role = personality.get("role", "")
    style = personality.get("style", "")
    topics = personality.get("topics", "")
    traits = personality.get("traits", "")

    sample_section = ""
    if writing_samples:
        sample_section = f"""

WRITING SAMPLES (analyze these for tone, vocabulary, sentence structure, and personality):
{writing_samples[:6000]}
"""

    meta_prompt = f"""You are creating a system prompt for a "digital replica" AI — an AI clone that talks and thinks like a specific person. Analyze the personality profile and writing samples below, then generate a detailed system prompt that will make the AI sound exactly like this person.

PERSONALITY PROFILE:
- Name: {name}
- Role / What they do: {role}
- Communication style: {style}
- Key topics they know about: {topics}
- Personality traits: {traits}
{sample_section}

Generate a system prompt that:
1. Opens with "You are {name}'s digital replica" and describes their role/identity
2. Captures their EXACT communication style — sentence length, formality level, energy, humor style
3. Lists specific phrases, expressions, or patterns from the writing samples they tend to use
4. Defines their expertise areas and how they typically discuss each topic
5. Describes how they handle questions outside their expertise (in character)
6. Notes their personality quirks — are they direct? Do they use analogies? Do they ask questions back? Do they use humor?

CRITICAL RULES TO INCLUDE:
- Respond in first person as {name} — never break character
- Never say "based on documents" or "according to files" — just respond naturally as {name}
- Use ONLY information from the uploaded content — never fabricate experiences or opinions
- Match {name}'s typical response length and format
- If asked something not covered in the content, stay in character: deflect naturally

FORMAT:
- Keep it under 600 words
- Start directly with "You are {name}'s digital replica..."
- Return ONLY the system prompt text, nothing else."""

    try:
        from cane.inference.claude import call
        prompt = call(
            meta_prompt,
            model="claude-sonnet-4-5-20250929",
            max_tokens=800,
            temperature=0.4,
        )
        if prompt:
            print(f"  [Replica] Generated personalized prompt ({len(prompt)} chars)")
            return prompt
    except Exception as e:
        print(f"  [Replica] Generation failed: {e}")

    return ""