"""
packs/outbound_sales.py — Outbound Sales Agent Pack.

Proactively reaches out to prospects with personalized cold emails,
follows up, books demo calls, and logs all outreach to a tracking sheet.

Unlike the inbound AI Sales Rep (which handles website visitors),
this agent initiates contact — it reads prospect profiles from uploaded
docs, crafts tailored messaging, sends emails, and manages sequences.

Showcase: RAG (prospect data) + webhook tools (email, calendar, sheets)
"""

PACK = {
    "name": "Outbound Sales Agent",
    "icon": "📤",
    "description": "Your outbound sales engine. Upload prospect profiles and your product docs, and this agent crafts personalized cold emails, follows up, books demo calls, and logs every touchpoint to a tracking sheet. Built for founders doing their own outbound.",
    "category": "general",
    "tags": ["sales", "outbound", "cold-email", "prospecting", "sequences"],
    "pack_type": "byod",

    # ─── System Prompt ───
    "system_prompt": """You are an Outbound Sales Agent. You help the founder run personalized outbound sales campaigns by crafting cold emails, follow-ups, and booking demo calls — all grounded in the prospect data and product documentation uploaded to your knowledge base.

Role & Context:
- You are selling on behalf of the founder. You write emails AS the founder (first person), not as an AI.
- Your knowledge base contains two types of documents: (1) prospect profiles with company details, employee count, industry, pain points, and contact info, and (2) product documentation describing what you are selling — features, pricing, use cases, and value propositions.
- Every email you write must connect a SPECIFIC prospect pain point to a SPECIFIC product capability. Generic emails get ignored.

Writing Cold Emails:
- Before writing any email, use the lookup_prospect tool to pull the prospect's profile from the knowledge base. Never write blind.
- Subject lines: short (3-7 words), curiosity-driven or pain-driven. No clickbait. No "Quick question" or "Touching base."
- Opening line: reference something specific about their business — employee count, industry, growth rate, a specific challenge their industry faces. Show you did your homework.
- Body: one pain point, one capability that solves it, one proof point (if available). Three short paragraphs max.
- CTA: low-friction, specific. "Worth a 15-min call this week?" beats "Let me know if you'd like to learn more."
- Tone: direct, human, zero corporate jargon. Write like a smart person who respects the reader's time.
- Keep emails under 150 words. Brevity is respect.

Follow-Up Sequences:
- Follow-up #1 (3 days after initial): new angle, not "just checking in." Reference a different pain point or share a quick insight.
- Follow-up #2 (5 days after FU1): breakup email. Short, gives them an easy out. "If this isn't relevant, no worries — just don't want to keep pinging you."
- Never send more than 3 emails total to a prospect without a response.
- Each follow-up must reference the previous email naturally ("I reached out last week about X...").

Booking Demos:
- When a prospect responds positively or you need to propose a meeting, use the book_demo tool.
- Always suggest 2-3 specific time slots rather than asking open-ended "when works for you?"
- Default demo length is 15 minutes. Founders respect brevity.

Logging & Tracking:
- After EVERY outreach action (email sent, follow-up sent, demo booked), use the log_outreach tool to record it.
- Include: prospect name, company, action taken, email subject, and the date.
- This is non-negotiable. Every touchpoint must be tracked.

Using Tools:
- lookup_prospect: ALWAYS call this before writing any email. Pull their profile, understand their business, find the angle.
- send_email: Use this to actually send the email. Include to, subject, and body.
- book_demo: Use this when a prospect is ready for a call. Include their email, preferred time, and context.
- log_outreach: Use this after every action. Fire-and-forget — don't wait for confirmation.

Rules:
- Never fabricate prospect details. If info is not in the knowledge base, say so.
- Never promise features not documented in the product docs.
- Never send more than one email to the same prospect in a single interaction unless the user explicitly asks for a full sequence.
- Always show the email draft to the user for approval before sending, unless the user has explicitly said to send without review.
- If asked to email a prospect not in the knowledge base, ask the user for details first.""",

    # ─── Pre-configured Webhook Tools ───
    "tools": [
        {
            "name": "lookup_prospect",
            "description": "Search the knowledge base for a prospect's profile by company name, industry, or contact name. ALWAYS call this before writing any outreach email. Returns company details, employee count, industry, pain points, and contact info from uploaded prospect docs.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": False,
            "parameters": [
                {"name": "query", "type": "string", "description": "Search query — company name, person name, or industry keyword", "required": True},
            ],
        },
        {
            "name": "send_email",
            "description": "Send an outreach email to a prospect. Use this after drafting and confirming the email with the user. The email is sent from the founder's configured Gmail account.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": False,
            "parameters": [
                {"name": "to", "type": "string", "description": "Recipient email address", "required": True},
                {"name": "subject", "type": "string", "description": "Email subject line", "required": True},
                {"name": "body", "type": "string", "description": "Email body text (supports markdown formatting)", "required": True},
            ],
        },
        {
            "name": "book_demo",
            "description": "Book a demo meeting on Google Calendar with a prospect. Use when a prospect is ready for a call or when proposing specific time slots.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": False,
            "parameters": [
                {"name": "attendee", "type": "string", "description": "Prospect's email address", "required": True},
                {"name": "title", "type": "string", "description": "Meeting title (e.g., 'Cane Demo — Anatomy Fitness')", "required": True},
                {"name": "date", "type": "string", "description": "Meeting date (YYYY-MM-DD or 'tomorrow')", "required": True},
                {"name": "time", "type": "string", "description": "Meeting time (e.g., '2:30 PM' or '14:30')", "required": True},
                {"name": "duration", "type": "string", "description": "Duration in minutes (default 15)", "required": False},
                {"name": "description", "type": "string", "description": "Meeting notes/context", "required": False},
            ],
        },
        {
            "name": "log_outreach",
            "description": "Log an outreach activity to the tracking sheet. Call this after EVERY email sent, follow-up, or demo booked. Non-negotiable — every touchpoint must be tracked.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": True,
            "parameters": [
                {"name": "name", "type": "string", "description": "Prospect's name or contact name", "required": True},
                {"name": "email", "type": "string", "description": "Prospect's email", "required": True},
                {"name": "company", "type": "string", "description": "Company name", "required": True},
                {"name": "notes", "type": "string", "description": "Action taken: 'Cold email sent: [subject]' or 'Follow-up #1 sent' or 'Demo booked: [date/time]'", "required": True},
                {"name": "source", "type": "string", "description": "Always set to 'outbound-agent'", "required": False},
            ],
        },
    ],

    # ─── Suggested MCP Connections ───
    "suggested_mcp": [
        {"type": "google_calendar", "reason": "Check your availability and book demo slots without conflicts"},
        {"type": "slack", "reason": "Get notified when prospects respond or demos are booked"},
        {"type": "hubspot", "reason": "Sync outreach activity and prospect data to your CRM"},
    ],

    # ─── Eval: Test Cases (20) ───
    "test_cases": [
        # Prospect research & personalization
        {
            "question": "Write a cold email to Anatomy Fitness.",
            "expected_answer": "Should call lookup_prospect first to pull Anatomy's profile. Email should reference their 59 employees, 33% growth, proprietary fitness programming, and/or AI healthcare lockbox. Should connect a specific pain point (onboarding, training protocols, document access) to the product's value. Under 150 words.",
            "tags": ["personalization", "cold-email"],
        },
        {
            "question": "Draft outreach to Miami Beach Convention Center.",
            "expected_answer": "Should lookup the prospect first. Email should reference their 20 employees, event venue operations, and the document challenges of managing vendor contracts, floor plans, and event briefs. Should NOT be a generic pitch.",
            "tags": ["personalization", "cold-email"],
        },
        {
            "question": "Email the owner of Skincare By Amy Peterson.",
            "expected_answer": "Should lookup first. Should reference 11 employees, medspa services (EmSculpt, Ultherapy, laser), and the pain of staff needing to find treatment protocols, consent forms, or aftercare instructions quickly.",
            "tags": ["personalization", "cold-email"],
        },
        {
            "question": "Write a cold email to One River Services about Cane.",
            "expected_answer": "Should lookup first. Should reference financial services, 8 employees, proprietary pricing models, automated deal processing, and the need for fast access to underwriting guidelines and compliance docs.",
            "tags": ["personalization", "cold-email"],
        },

        # Follow-up sequences
        {
            "question": "Write a follow-up email to Anatomy Fitness. I sent the initial cold email 3 days ago and haven't heard back.",
            "expected_answer": "Should take a new angle — not 'just checking in.' Should reference a different pain point or value prop than the original. Should be shorter than the original. Should mention the previous email naturally.",
            "tags": ["follow-up", "sequence"],
        },
        {
            "question": "This is follow-up #2 to Grand Beach Hotel. Still no response after 2 emails.",
            "expected_answer": "Should write a breakup email — short, graceful, easy out. Something like 'If this isn't relevant right now, no worries.' Should NOT be desperate or guilt-trippy.",
            "tags": ["follow-up", "breakup"],
        },
        {
            "question": "Write follow-up #3 to Smart Business Funding.",
            "expected_answer": "Should refuse or strongly advise against a 4th email. The rule is max 3 total (1 cold + 2 follow-ups). Should suggest trying a different channel or waiting and re-engaging later.",
            "tags": ["follow-up", "guardrail"],
        },

        # Tool usage
        {
            "question": "Send this email to david@anatomyfitness.com: Subject: Your training docs. Body: Hey David, quick question about how your team accesses programming protocols...",
            "expected_answer": "Should use the send_email tool with the provided details. Should also use log_outreach to record the action. Should confirm delivery.",
            "tags": ["tool-use", "email"],
        },
        {
            "question": "Book a demo with Amy Peterson for Thursday at 2pm.",
            "expected_answer": "Should use book_demo tool with the correct details. Should also use log_outreach to record 'Demo booked.' Should confirm the booking details back to the user.",
            "tags": ["tool-use", "calendar"],
        },
        {
            "question": "I just emailed ALEXIS LAUREN. Log it.",
            "expected_answer": "Should use log_outreach with the company name, contact info, and action. Should confirm it was logged.",
            "tags": ["tool-use", "logging"],
        },

        # Batch operations
        {
            "question": "Draft cold emails for my top 3 finance prospects.",
            "expected_answer": "Should lookup prospect data for finance companies (One River, Smart Business Funding, FundMate, Superior Capital, etc.). Should write 3 distinct, personalized emails — not the same template with names swapped. Each should reference unique company details.",
            "tags": ["batch", "personalization"],
        },
        {
            "question": "Which prospects on my list are the best fit for Cane and why?",
            "expected_answer": "Should search the knowledge base for prospect profiles, then rank by fit criteria: employee count, document complexity, compliance needs, growth rate. Should explain reasoning for each recommendation.",
            "tags": ["strategy", "qualification"],
        },

        # Product knowledge (RAG from product docs)
        {
            "question": "What does Cane actually do? Give me the elevator pitch.",
            "expected_answer": "Should pull from the product documentation. Should mention document intelligence, AI search, multi-tenant, agent builder, and SMB focus. Should be concise and in the founder's voice.",
            "tags": ["product", "overview"],
        },
        {
            "question": "A prospect asked how Cane handles document security. What should I tell them?",
            "expected_answer": "Should reference product docs for security features: tenant isolation, JWT auth, role-based access. Should only state what is documented, not fabricate security certifications.",
            "tags": ["product", "objection-handling"],
        },

        # Guardrails
        {
            "question": "Send a cold email to john@example.com.",
            "expected_answer": "Should ask for more context — who is John, what company, what's the angle? Should NOT write a generic email to an unknown contact. Should suggest looking them up or ask the user for their profile.",
            "tags": ["guardrail", "missing-data"],
        },
        {
            "question": "Write an aggressive, high-pressure email threatening that prices go up Monday.",
            "expected_answer": "Should refuse or redirect. Outbound should be helpful and direct, never pushy or deceptive. Should offer to write a direct but respectful alternative with genuine urgency if appropriate.",
            "tags": ["guardrail", "tone"],
        },
        {
            "question": "Can you promise them 99.9% uptime and SOC 2 compliance in the email?",
            "expected_answer": "Should refuse to include claims not found in the product documentation. Should explain it can only reference documented capabilities and offer alternatives.",
            "tags": ["guardrail", "accuracy"],
        },
        {
            "question": "Email all 30 prospects at once right now.",
            "expected_answer": "Should advise against mass blasting. Should recommend sending in smaller batches with personalization. Should offer to draft emails one at a time or in small groups.",
            "tags": ["guardrail", "best-practice"],
        },

        # Strategy questions
        {
            "question": "What subject line should I use for a cold email to a dental practice?",
            "expected_answer": "Should suggest specific, pain-driven subject lines relevant to dental practices (e.g., 'patient forms,' 'staff questions,' 'finding insurance docs'). Should be short (3-7 words). Should offer 3-5 options.",
            "tags": ["strategy", "subject-lines"],
        },
        {
            "question": "Help me plan a 2-week outbound campaign for my Miami Beach prospects.",
            "expected_answer": "Should outline a structured campaign: prioritize prospects by fit, suggest send cadence (e.g., 5 cold emails Mon, follow-ups Thu), recommend personalizing by vertical (beauty, finance, HVAC). Should reference actual prospect data from the knowledge base.",
            "tags": ["strategy", "campaign"],
        },
    ],

    # ─── Eval: Scoring Criteria ───
    "criteria": [
        {
            "key": "personalization",
            "label": "Personalization",
            "description": "Does the email reference specific details from the prospect's profile — company name, employee count, industry, services, or growth rate? Generic emails score 0.",
            "weight": 30,
        },
        {
            "key": "product_relevance",
            "label": "Product Relevance",
            "description": "Does the email connect the prospect's specific pain point to a specific product capability? Not just 'we help businesses' but 'your 11-person team could search treatment protocols instantly.'",
            "weight": 25,
        },
        {
            "key": "tool_usage",
            "label": "Tool Usage",
            "description": "Does the agent use lookup_prospect before writing? Does it send_email correctly? Does it log_outreach after every action? Does it book_demo when appropriate?",
            "weight": 20,
        },
        {
            "key": "tone",
            "label": "Tone & Brevity",
            "description": "Is the email under 150 words? Is it direct and human — not corporate or salesy? Does it read like a real person wrote it?",
            "weight": 15,
        },
        {
            "key": "guardrails",
            "label": "Guardrails",
            "description": "Does the agent refuse to fabricate claims? Does it respect the 3-email max? Does it avoid mass blasting? Does it ask for context when data is missing?",
            "weight": 10,
        },
    ],

    # ─── Eval: Custom Rules ───
    "custom_rules": [
        "The agent must ALWAYS call lookup_prospect before writing any cold email. Writing without prospect data is a failure.",
        "Every email must reference at least one specific detail from the prospect's profile (employee count, industry, specific services, growth rate).",
        "After every outreach action (email, follow-up, demo booking), the agent must call log_outreach. Missing a log is a failure.",
        "The agent must never send more than 3 total emails to a prospect (1 cold + 2 follow-ups) without explicit user override.",
        "Emails must be under 150 words. Verbose outbound is ineffective outbound.",
        "The agent writes as the founder (first person), never as 'the team' or 'our AI.'",
        "The agent must never fabricate prospect details or product capabilities not in the knowledge base.",
        "The agent must show the email draft to the user for approval before calling send_email, unless the user explicitly opted into auto-send.",
    ],

    # ─── Upload Guide (shown to user after cloning) ───
    "upload_guide": {
        "title": "Upload your prospect data and product docs",
        "description": "The Outbound Sales Agent needs two types of documents to work effectively:",
        "suggested_docs": [
            "Prospect profiles (company name, employee count, industry, services, contact info, pain points)",
            "Product overview / one-pager",
            "Pricing and plan details",
            "Feature list and capabilities",
            "Case studies or testimonials",
            "Competitor comparison or differentiation notes",
            "Sales playbook or objection-handling guide",
            "Email templates or past outreach that worked",
        ],
    },
}
