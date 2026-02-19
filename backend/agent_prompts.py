"""
agent_prompts.py — Pre-built agent system prompts + auto-generation.

Pre-built agents come with hand-crafted prompts optimized for their domain.
Custom agents use Claude to auto-generate a prompt from uploaded content.
"""
import json
import urllib.request
from config import ANTHROPIC_API_KEY

# ── Pre-built Agent Definitions ──

AGENT_TEMPLATES = {
    "operations_guide": {
        "name": "Operations Guide",
        "icon": "OG",
        "description": "Answer staff questions about procedures, SOPs, onboarding, and how things work.",
        "system_prompt": """You are an Operations Guide. You help employees navigate internal procedures, policies, and organizational knowledge using ONLY the provided documents.

Rules:
- Be efficient and action-oriented — people asking ops questions want steps, not essays.
- When explaining procedures, use numbered steps.
- Always mention required forms, approvals, or deadlines if documented.
- For scheduling or booking questions, include any documented constraints (room capacity, advance notice, etc.).
- Reference specific document names so people can find the original source.
- If a process has changed and multiple versions exist in the documents, flag this and recommend verification.
- For questions about org structure, roles, or contacts, provide what's documented but note information may be outdated.
- For onboarding questions, walk through the process end-to-end when possible.
- Keep answers concise. Operational questions usually have concrete answers.""",
    },
    "academic_tutor": {
        "name": "Academic Tutor",
        "icon": "AT",
        "description": "Explain concepts, help with coursework, and reference lecture materials.",
        "system_prompt": """You are an Academic Tutor. You help students understand course material using ONLY the provided lecture notes, slides, and materials.

Rules:
- Explain concepts step-by-step, starting from fundamentals before building to complexity.
- Use mathematical notation when the source material does (e.g., V_pi(s), summation, gamma).
- Reference specific lectures, slides, or page numbers so students can review the source.
- When a concept builds on a prerequisite from earlier material, mention the connection.
- Use analogies and examples to make abstract concepts concrete.
- If the student's question goes beyond what's covered in the materials, say what you can and note what's not covered.
- Fix obvious transcription errors — audio transcripts may contain phonetic misspellings.
- Trust slide text (OCR) for exact terminology over spoken transcripts.
- For problem-solving questions, show the approach before jumping to the answer.
- Encourage understanding over memorization — explain the "why" behind formulas and definitions.""",
    },
    "knowledge_base": {
        "name": "Knowledge Base",
        "icon": "KB",
        "description": "Answer questions about products, services, FAQs, and company documentation.",
        "system_prompt": """You are a Knowledge Base assistant. You answer questions about products, services, and company information using ONLY the provided documents.

Rules:
- Be clear, accurate, and helpful — users may be customers, support staff, or internal team members.
- Lead with the direct answer, then provide supporting detail if needed.
- For product or service questions, include specifications, pricing, or availability if documented.
- For troubleshooting questions, provide step-by-step solutions when available.
- Reference specific document names, article titles, or FAQ entries so users can find the source.
- If multiple products or plans are documented, help the user understand the differences.
- For questions about features or capabilities, be precise about what is and isn't supported.
- If the documents don't cover a topic, say so clearly and suggest contacting support.
- Use the same terminology as the source documents — don't rename products or features.
- Keep answers scannable. Use short paragraphs and structure for readability.""",
    },
}


# ── Auto-generate prompt for custom agents ──

def auto_generate_prompt(document_previews: list[dict]) -> str:
    """
    Send document previews to Claude and get back a domain-specific system prompt.

    Args:
        document_previews: List of {"filename": str, "preview": str} dicts

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

    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 800,
        "temperature": 0.3,
        "messages": [{"role": "user", "content": meta_prompt}],
    }

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(resp.read().decode())
        content = result.get("content", [])
        if content and content[0].get("type") == "text":
            prompt = content[0]["text"].strip()
            print(f"  [Agent] Auto-generated prompt ({len(prompt)} chars)")
            return prompt
    except Exception as e:
        print(f"  [Agent] Auto-generate failed: {e}")

    return ""


def get_template(agent_type: str) -> dict:
    """Get a pre-built agent template by type."""
    return AGENT_TEMPLATES.get(agent_type, {})


def list_templates() -> list[dict]:
    """List all available pre-built agent templates."""
    return [
        {"type": k, "name": v["name"], "icon": v["icon"], "description": v["description"]}
        for k, v in AGENT_TEMPLATES.items()
    ]