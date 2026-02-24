"""
packs/ai_sales_rep.py — AI Sales Rep Agent Pack.

Answers product questions from your sales docs, qualifies leads by asking
the right questions, books demo calls, and pushes qualified leads to your CRM.

Showcase: RAG + webhook tools + MCP (CRM, Calendar, Slack)
"""

PACK = {
    "name": "AI Sales Rep",
    "icon": "SR",
    "description": "Your 24/7 sales agent. Answers product questions from your docs, qualifies inbound leads, books demo calls, and pushes hot leads to your CRM. Embed on your site and wake up to booked meetings.",
    "category": "general",
    "tags": ["sales", "lead-gen", "demos", "crm", "inbound"],
    "pack_type": "byod",

    # ─── System Prompt ───
    "system_prompt": """You are an AI Sales Representative. You engage website visitors, answer their product questions using the provided sales documentation, qualify them as leads, and help them take the next step — whether that is booking a demo, starting a trial, or getting connected with the sales team.

Personality:
- Confident but not pushy. You are helpful first, salesy second.
- Conversational and warm. No corporate jargon. Talk like a smart colleague, not a brochure.
- Responsive to buying signals. If someone asks about pricing, integrations, or timelines, they are evaluating — lean in.

Answering Questions:
- Use ONLY the provided document excerpts to answer product questions. Never fabricate features, pricing, or capabilities.
- When describing features, be specific about what is included and what is not. Vague promises kill trust.
- If the documents mention multiple plans or tiers, help the visitor understand which fits their situation. Ask about their team size, use case, or budget if needed.
- For competitive questions ("How do you compare to X?"), stick to what the documents say about your product. Never disparage competitors. Focus on your strengths.
- If you genuinely do not know something, say so and offer to connect them with a human rep.

Qualification:
- Naturally gather qualification info during the conversation. You are looking for: company size, use case, timeline, budget range, and decision-making role.
- Do not interrogate. Weave questions into the conversation. For example, after answering a feature question, you might ask "How big is your team? That will help me recommend the right plan."
- Once you have enough context, make a recommendation: book a demo, start a free trial, or request a custom quote.

Taking Action:
- When a visitor wants to book a demo, use the book_demo tool. Confirm the details before submitting.
- When you have identified a qualified lead, use the log_lead tool to push their info to the CRM.
- For urgent or high-value leads (enterprise, mentions of large team size, or immediate timeline), use the notify_sales tool to alert the team in real-time.
- Always confirm with the visitor before taking an action. "I can get you booked for a demo — would Thursday work?"

Rules:
- Never make up pricing, discounts, or promotions not in the documents.
- Never promise features that are not documented.
- If asked about contracts, legal terms, or SLAs, direct them to the sales team for specifics.
- Keep responses concise. Visitors are scanning, not reading essays.
- If the conversation stalls, offer a clear next step: "Want me to book you a quick 15-min demo?"
""",

    # ─── Pre-configured Webhook Tools ───
    "tools": [
        {
            "name": "book_demo",
            "description": "Book a product demo for a qualified lead. Use this when a visitor wants to schedule a demo call. Confirm the name, email, and preferred time before calling.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": False,
            "parameters": [
                {"name": "name", "type": "string", "description": "Visitor's full name", "required": True},
                {"name": "email", "type": "string", "description": "Visitor's email address", "required": True},
                {"name": "company", "type": "string", "description": "Company name", "required": False},
                {"name": "preferred_time", "type": "string", "description": "Preferred demo time/day", "required": False},
                {"name": "notes", "type": "string", "description": "Context about what they are interested in", "required": False},
            ],
        },
        {
            "name": "log_lead",
            "description": "Log a qualified lead to the CRM. Use this when you have gathered enough info to identify a real prospect: name, email, company, and their use case or interest.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": True,
            "parameters": [
                {"name": "name", "type": "string", "description": "Lead's full name", "required": True},
                {"name": "email", "type": "string", "description": "Lead's email", "required": True},
                {"name": "company", "type": "string", "description": "Company name", "required": False},
                {"name": "team_size", "type": "string", "description": "Estimated team size", "required": False},
                {"name": "use_case", "type": "string", "description": "What they want to use the product for", "required": False},
                {"name": "qualification_notes", "type": "string", "description": "Summary of the conversation and lead quality", "required": False},
            ],
        },
        {
            "name": "notify_sales",
            "description": "Send an urgent alert to the sales team on Slack. Use this for high-value leads: enterprise companies, large teams (50+), mentions of immediate purchase timeline, or requests for custom pricing.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": True,
            "parameters": [
                {"name": "lead_name", "type": "string", "description": "Lead's name", "required": True},
                {"name": "company", "type": "string", "description": "Company name", "required": True},
                {"name": "urgency_reason", "type": "string", "description": "Why this is a hot lead", "required": True},
                {"name": "conversation_summary", "type": "string", "description": "Brief summary of the conversation so far", "required": False},
            ],
        },
    ],

    # ─── Suggested MCP Connections ───
    "suggested_mcp": [
        {"type": "hubspot", "reason": "Auto-create contacts and deals when leads are qualified"},
        {"type": "google_calendar", "reason": "Check rep availability and book demo slots directly"},
        {"type": "slack", "reason": "Real-time alerts when hot leads come in"},
    ],

    # ─── Eval: Test Cases (20) ───
    "test_cases": [
        # Product knowledge (RAG)
        {
            "question": "What does your product do?",
            "expected_answer": "Should give a clear, concise product overview based on the uploaded docs. Not generic — specific to the actual product.",
            "tags": ["product", "overview"],
        },
        {
            "question": "How much does it cost?",
            "expected_answer": "Should reference specific pricing from the docs (plans, tiers, per-seat cost). If pricing is not in the docs, should say so and offer to connect with sales.",
            "tags": ["pricing"],
        },
        {
            "question": "What integrations do you support?",
            "expected_answer": "Should list specific integrations mentioned in the docs. Should not fabricate integrations that are not documented.",
            "tags": ["product", "integrations"],
        },
        {
            "question": "Do you have an API?",
            "expected_answer": "Should answer based on docs. If API is documented, describe capabilities. If not mentioned, say so clearly.",
            "tags": ["product", "technical"],
        },
        {
            "question": "How does your product compare to [competitor]?",
            "expected_answer": "Should focus on own product strengths from docs. Should NOT make up competitor weaknesses or claims not in the documentation.",
            "tags": ["competitive", "product"],
        },
        {
            "question": "Is there a free trial?",
            "expected_answer": "Should answer based on docs. Include trial length, limitations, and what happens after if documented.",
            "tags": ["pricing", "trial"],
        },
        {
            "question": "What security certifications do you have?",
            "expected_answer": "Should only cite certifications explicitly mentioned in docs (SOC 2, HIPAA, GDPR, etc.). Should not guess or assume certifications.",
            "tags": ["security", "compliance"],
        },
        {
            "question": "Can it handle 500 users?",
            "expected_answer": "Should reference documented scale limits or enterprise tier. If not documented, should offer to connect with sales for custom needs.",
            "tags": ["product", "scale"],
        },

        # Lead qualification behavior
        {
            "question": "We're a 200-person company looking to roll this out across our engineering team next quarter.",
            "expected_answer": "Should recognize this as a qualified enterprise lead. Should ask clarifying questions (use case, current tools) and suggest booking a demo. Should trigger notify_sales for the enterprise signal.",
            "tags": ["qualification", "enterprise"],
        },
        {
            "question": "Just browsing, not sure if we need this yet.",
            "expected_answer": "Should be helpful and not pushy. Should ask what problem they are trying to solve to understand fit. Should NOT immediately try to book a demo.",
            "tags": ["qualification", "early-stage"],
        },
        {
            "question": "I'm the CTO and we need to make a decision by end of month.",
            "expected_answer": "Should recognize urgency + decision-maker role. Should prioritize getting them to a demo or trial quickly. Should trigger notify_sales for the urgent timeline.",
            "tags": ["qualification", "urgent"],
        },
        {
            "question": "Can you send me a proposal for 50 seats?",
            "expected_answer": "Should recognize this as a buying signal. Should gather company name and email, then either provide pricing from docs or offer to connect with sales for a custom quote. Should log the lead.",
            "tags": ["qualification", "buying-signal"],
        },

        # Tool usage
        {
            "question": "I'd like to book a demo. I'm Sarah Chen, sarah@acme.co, and Thursdays work best.",
            "expected_answer": "Should use the book_demo tool with the provided details. Should confirm the booking back to the user.",
            "tags": ["tool-use", "booking"],
        },
        {
            "question": "My name is James Park, james@bigcorp.com. We're a 300-person fintech and we need this deployed by March.",
            "expected_answer": "Should use log_lead to capture the lead info AND notify_sales because this is a large, time-sensitive enterprise deal. Should also offer to book a demo.",
            "tags": ["tool-use", "enterprise", "urgent"],
        },
        {
            "question": "Can someone from your team call me? I have some specific questions about compliance.",
            "expected_answer": "Should ask for their name and email/phone, then use log_lead or notify_sales to route the request. Should not try to answer compliance questions beyond what is in the docs.",
            "tags": ["tool-use", "escalation"],
        },

        # Edge cases and guardrails
        {
            "question": "Can you give me a 30% discount if I sign today?",
            "expected_answer": "Should NOT promise any discount. Should say it cannot authorize discounts and offer to connect with the sales team for pricing discussions.",
            "tags": ["guardrail", "pricing"],
        },
        {
            "question": "Your competitor told me you don't support SSO. Is that true?",
            "expected_answer": "Should answer based on docs only. If SSO is documented, correct the claim with specifics. If not mentioned, say it needs to verify with the team rather than guessing.",
            "tags": ["guardrail", "competitive"],
        },
        {
            "question": "Will you support [feature X] by next quarter?",
            "expected_answer": "Should NOT commit to a roadmap timeline. Should say it cannot speak to future plans and suggest contacting the product team or sales for roadmap discussions.",
            "tags": ["guardrail", "roadmap"],
        },
        {
            "question": "I want to cancel my subscription.",
            "expected_answer": "Should recognize this is a retention/support issue, not a sales conversation. Should direct to customer support or account management rather than trying to handle cancellation.",
            "tags": ["guardrail", "out-of-scope"],
        },
        {
            "question": "Tell me about features you're planning but haven't launched yet.",
            "expected_answer": "Should decline to share unannounced features. Should describe current capabilities from docs and offer to connect with product team for roadmap inquiries.",
            "tags": ["guardrail", "confidential"],
        },
    ],

    # ─── Eval: Scoring Criteria ───
    "criteria": [
        {
            "key": "accuracy",
            "label": "Accuracy",
            "description": "Does the answer correctly reflect information in the source documents? No fabricated features, pricing, or capabilities.",
            "weight": 30,
        },
        {
            "key": "qualification",
            "label": "Lead Qualification",
            "description": "Does the agent appropriately identify lead quality signals (company size, urgency, buying intent) and adjust its approach accordingly?",
            "weight": 25,
        },
        {
            "key": "tool_usage",
            "label": "Tool Usage",
            "description": "Does the agent use the right tools at the right time? Books demos when asked, logs leads when qualified, escalates enterprise/urgent leads?",
            "weight": 20,
        },
        {
            "key": "tone",
            "label": "Tone & Helpfulness",
            "description": "Is the agent conversational, helpful, and non-pushy? Does it match the situation — excited for hot leads, patient for early-stage browsers?",
            "weight": 15,
        },
        {
            "key": "guardrails",
            "label": "Guardrails",
            "description": "Does the agent refuse to make unauthorized promises (discounts, roadmap, legal terms)? Does it escalate appropriately when out of scope?",
            "weight": 10,
        },
    ],

    # ─── Eval: Custom Rules ───
    "custom_rules": [
        "The agent must NEVER fabricate pricing, discounts, or feature availability not found in the source documents.",
        "When a visitor provides their name and email and asks to book a demo, the agent must use the book_demo tool — not just say it will be arranged.",
        "Enterprise signals (50+ users, C-level title, immediate timeline) must trigger the notify_sales tool.",
        "The agent should never disparage competitors by name.",
        "If the agent cannot answer from the docs, it should say so clearly and offer a human handoff — never guess.",
    ],

    # ─── Upload Guide (shown to user after cloning) ───
    "upload_guide": {
        "title": "Upload your sales docs to activate this agent",
        "description": "The AI Sales Rep needs your product and sales documentation to answer questions accurately. Upload any of the following:",
        "suggested_docs": [
            "Product overview / one-pager",
            "Pricing page or plan comparison",
            "Feature list or capabilities doc",
            "FAQ document",
            "Sales deck / pitch deck (PDF)",
            "Integration or API documentation",
            "Case studies or testimonials",
            "Security / compliance overview",
        ],
    },
}
