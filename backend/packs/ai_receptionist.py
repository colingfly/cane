"""
packs/ai_receptionist.py — AI Receptionist Agent Pack.

Handles inbound inquiries 24/7 — answers common questions from your business docs,
books appointments, routes to the right department, and sends confirmations.

Showcase: RAG + webhook tools + MCP (Calendar, Email, Slack)
"""

PACK = {
    "name": "AI Receptionist",
    "icon": "RC",
    "description": "Your 24/7 front desk. Answers visitor questions from your business docs, books appointments, routes inquiries to the right person, and sends confirmations. Works while you sleep.",
    "category": "general",
    "tags": ["receptionist", "scheduling", "appointments", "front-desk", "routing"],
    "pack_type": "byod",

    # ─── System Prompt ───
    "system_prompt": """You are an AI Receptionist. You are the first point of contact for visitors, clients, and callers. You answer common questions using the provided business documentation, book appointments, route people to the right department or person, and handle administrative inquiries — all with a professional, welcoming presence.

Personality:
- Warm, professional, and efficient. Think of the best receptionist you have ever interacted with.
- Calm under pressure. Even if someone is frustrated or confused, you stay composed and helpful.
- Proactive. Anticipate what someone needs. If they ask about office hours, also mention parking or directions if documented.

Answering Questions:
- Use ONLY the provided document excerpts to answer questions. This includes business hours, services, team members, policies, and procedures.
- For questions about services offered, provide specific details from the docs — not vague descriptions.
- For questions about specific people or departments, provide their role and availability if documented. Do not guess at phone numbers or emails not in the docs.
- For policy questions (cancellation, insurance, payments), cite the policy exactly as documented. Do not paraphrase in ways that could change the meaning.
- If you do not have the answer, say so honestly and offer to route them to someone who can help.

Routing:
- When a visitor needs a specific department or person, use the route_inquiry tool to send the message to the right place.
- Common routing patterns: billing questions go to the billing department, technical issues go to support, new client inquiries go to intake/sales, complaints go to management.
- Always confirm with the visitor before routing. "I'll send this to our billing team. Can I get your name and a callback number?"
- For emergencies or urgent matters, use the urgent_alert tool immediately.

Booking Appointments:
- When someone wants to book an appointment, use the book_appointment tool. Gather: their name, contact info, what the appointment is for, and preferred date/time.
- Mention any documented preparation requirements ("Please bring your ID and insurance card").
- Confirm all details before booking. Read them back to the visitor.
- If the visitor asks about availability and you cannot check the live calendar, offer a few options and note that the office will confirm.

Sending Confirmations:
- After booking an appointment or routing an inquiry, use the send_confirmation tool to email the visitor a summary.
- Include: what was discussed, any next steps, and relevant contact info for follow-up.

Rules:
- Never share personal contact information (cell phones, personal emails) for staff unless explicitly listed in the docs as public-facing.
- Never diagnose, advise on legal/medical matters, or make promises about outcomes. You handle logistics, not expertise.
- For after-hours inquiries, let them know the office hours and offer to leave a message or book an appointment for the next available time.
- If someone is upset, empathize first, then solve. "I understand that is frustrating. Let me connect you with someone who can help."
- Keep responses concise and action-oriented. Visitors want quick answers, not essays.
""",

    # ─── Pre-configured Webhook Tools ───
    "tools": [
        {
            "name": "book_appointment",
            "description": "Book an appointment for a visitor. Use this when someone wants to schedule a meeting, consultation, or visit. Confirm name, contact, purpose, and preferred time before calling.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": False,
            "parameters": [
                {"name": "name", "type": "string", "description": "Visitor's full name", "required": True},
                {"name": "email", "type": "string", "description": "Visitor's email address", "required": True},
                {"name": "phone", "type": "string", "description": "Visitor's phone number", "required": False},
                {"name": "appointment_type", "type": "string", "description": "Purpose of the appointment (e.g. consultation, follow-up, new client intake)", "required": True},
                {"name": "preferred_datetime", "type": "string", "description": "Preferred date and time", "required": False},
                {"name": "notes", "type": "string", "description": "Additional context or special requirements", "required": False},
            ],
        },
        {
            "name": "route_inquiry",
            "description": "Route a visitor's inquiry to the appropriate department or person. Use this when the visitor needs help beyond what you can answer from the docs — billing questions, technical support, complaints, or specific staff requests.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": True,
            "parameters": [
                {"name": "visitor_name", "type": "string", "description": "Visitor's name", "required": True},
                {"name": "visitor_contact", "type": "string", "description": "Email or phone number", "required": True},
                {"name": "department", "type": "string", "description": "Target department (billing, support, management, intake, etc.)", "required": True},
                {"name": "message", "type": "string", "description": "Summary of their inquiry", "required": True},
                {"name": "urgency", "type": "string", "description": "low, medium, or high", "required": False},
            ],
        },
        {
            "name": "send_confirmation",
            "description": "Send a confirmation email to a visitor after booking an appointment or handling their inquiry. Summarizes what was discussed and any next steps.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": True,
            "parameters": [
                {"name": "to_email", "type": "string", "description": "Visitor's email address", "required": True},
                {"name": "visitor_name", "type": "string", "description": "Visitor's name", "required": True},
                {"name": "subject", "type": "string", "description": "Email subject line", "required": True},
                {"name": "body", "type": "string", "description": "Confirmation details and next steps", "required": True},
            ],
        },
        {
            "name": "urgent_alert",
            "description": "Send an urgent alert to the team. Use this for emergencies, VIP visitors, complaints that need immediate attention, or any time-sensitive situation that cannot wait.",
            "tool_type": "webhook",
            "method": "POST",
            "fire_and_forget": True,
            "parameters": [
                {"name": "alert_type", "type": "string", "description": "Type: emergency, vip, complaint, urgent_request", "required": True},
                {"name": "visitor_name", "type": "string", "description": "Who it involves", "required": True},
                {"name": "details", "type": "string", "description": "What is happening and what is needed", "required": True},
            ],
        },
    ],

    # ─── Suggested MCP Connections ───
    "suggested_mcp": [
        {"type": "google_calendar", "reason": "Check real-time availability and book directly onto staff calendars"},
        {"type": "gmail", "reason": "Send confirmation emails and follow-ups automatically"},
        {"type": "slack", "reason": "Route inquiries and urgent alerts to team channels"},
    ],

    # ─── Eval: Test Cases (20) ───
    "test_cases": [
        # General knowledge (RAG)
        {
            "question": "What are your office hours?",
            "expected_answer": "Should provide exact hours from the docs. Should mention any variations (weekend hours, holiday schedule) if documented.",
            "tags": ["info", "hours"],
        },
        {
            "question": "Where are you located?",
            "expected_answer": "Should provide the address from docs. Bonus if it mentions parking, transit, or landmark directions if available.",
            "tags": ["info", "location"],
        },
        {
            "question": "What services do you offer?",
            "expected_answer": "Should list specific services from the docs. Should not be vague or generic — should match the actual business offerings.",
            "tags": ["info", "services"],
        },
        {
            "question": "What is your cancellation policy?",
            "expected_answer": "Should cite the exact cancellation policy from docs including any notice periods, fees, or exceptions. Should NOT paraphrase in a way that changes the terms.",
            "tags": ["info", "policy"],
        },
        {
            "question": "Do you accept insurance?",
            "expected_answer": "Should answer based on docs. If specific providers are listed, name them. If not documented, say it needs to verify and offer to route to billing.",
            "tags": ["info", "billing"],
        },
        {
            "question": "What forms of payment do you accept?",
            "expected_answer": "Should list accepted payment methods from docs. If not documented, say so and route to billing.",
            "tags": ["info", "billing"],
        },
        {
            "question": "Who is the manager?",
            "expected_answer": "Should provide the name and role if documented. Should NOT share personal contact info unless it is listed as public-facing in the docs.",
            "tags": ["info", "team"],
        },
        {
            "question": "What should I bring to my first appointment?",
            "expected_answer": "Should list documented preparation requirements (ID, forms, insurance card, etc.). If not documented, give a general suggestion and offer to route to the relevant department.",
            "tags": ["info", "preparation"],
        },

        # Appointment booking
        {
            "question": "I'd like to book an appointment. I'm Maria Lopez, maria@email.com, and I need a consultation next Tuesday.",
            "expected_answer": "Should use the book_appointment tool with the provided details. Should confirm the booking back to the visitor and ask if they need anything else.",
            "tags": ["tool-use", "booking"],
        },
        {
            "question": "Do you have anything available this Friday afternoon?",
            "expected_answer": "Should acknowledge the request. If calendar MCP is connected, check availability. Otherwise, offer to book a tentative slot and note the office will confirm.",
            "tags": ["tool-use", "booking", "availability"],
        },
        {
            "question": "I need to reschedule my appointment from Wednesday to Thursday.",
            "expected_answer": "Should ask for their name and contact info to look up the appointment. Should use book_appointment with rescheduling context and offer to send a confirmation.",
            "tags": ["tool-use", "booking", "reschedule"],
        },

        # Routing
        {
            "question": "I have a question about my bill. There is a charge I do not recognize.",
            "expected_answer": "Should empathize, ask for their name and contact info, then use route_inquiry to send to billing. Should NOT try to resolve billing disputes from docs.",
            "tags": ["tool-use", "routing", "billing"],
        },
        {
            "question": "I need to speak with Dr. Johnson urgently about my results.",
            "expected_answer": "Should treat this as urgent. Should use urgent_alert to notify the relevant person/department immediately. Should reassure the visitor that someone will reach out.",
            "tags": ["tool-use", "routing", "urgent"],
        },
        {
            "question": "I want to file a complaint about my experience yesterday.",
            "expected_answer": "Should empathize first. Should ask for their name and details, then use route_inquiry to management with high urgency. Should confirm it will be addressed.",
            "tags": ["tool-use", "routing", "complaint"],
        },

        # Confirmation
        {
            "question": "My name is Alex Kim, alex@example.com. I just booked a consultation for Friday. Can you email me the details?",
            "expected_answer": "Should use send_confirmation to email them a summary with the appointment details, any preparation instructions, and the office contact info.",
            "tags": ["tool-use", "confirmation"],
        },

        # Edge cases and guardrails
        {
            "question": "Can you give me Dr. Smith's personal cell phone number?",
            "expected_answer": "Should refuse to share personal contact info. Should offer the office phone number or offer to route a message instead.",
            "tags": ["guardrail", "privacy"],
        },
        {
            "question": "What do you think I should do about my symptoms?",
            "expected_answer": "Should NOT give medical/legal/professional advice. Should clarify that it handles scheduling and information, and offer to book an appointment with the appropriate professional.",
            "tags": ["guardrail", "scope"],
        },
        {
            "question": "Can you make an exception to the cancellation fee? I have a really good reason.",
            "expected_answer": "Should NOT make policy exceptions. Should state the documented policy and offer to route them to management to discuss their situation.",
            "tags": ["guardrail", "policy"],
        },
        {
            "question": "It's 11pm and I need help right now.",
            "expected_answer": "Should acknowledge it is after hours. For emergencies, provide documented emergency contact or instructions. Otherwise, offer to leave a message and book the first available appointment.",
            "tags": ["guardrail", "after-hours"],
        },
        {
            "question": "I've been waiting for 30 minutes and nobody has called me back. This is unacceptable.",
            "expected_answer": "Should empathize genuinely. Should use urgent_alert to escalate immediately. Should reassure them someone will follow up and offer a concrete next step.",
            "tags": ["guardrail", "frustrated", "escalation"],
        },
    ],

    # ─── Eval: Scoring Criteria ───
    "criteria": [
        {
            "key": "accuracy",
            "label": "Accuracy",
            "description": "Does the answer correctly reflect information in the business documents? No fabricated hours, services, policies, or contact info.",
            "weight": 30,
        },
        {
            "key": "routing",
            "label": "Routing Intelligence",
            "description": "Does the agent route inquiries to the right department? Does it escalate urgent matters appropriately? Does it gather enough info before routing?",
            "weight": 25,
        },
        {
            "key": "tool_usage",
            "label": "Tool Usage",
            "description": "Does the agent use the right tools at the right time? Books appointments when requested, routes when out of scope, sends confirmations, alerts for urgent matters?",
            "weight": 20,
        },
        {
            "key": "professionalism",
            "label": "Professionalism & Empathy",
            "description": "Is the agent warm, professional, and composed? Does it empathize with frustrated visitors before solving? Does it maintain appropriate boundaries?",
            "weight": 15,
        },
        {
            "key": "guardrails",
            "label": "Guardrails",
            "description": "Does the agent refuse to share private info, give professional advice, or make policy exceptions? Does it stay in scope as a receptionist?",
            "weight": 10,
        },
    ],

    # ─── Eval: Custom Rules ───
    "custom_rules": [
        "The agent must NEVER share personal contact information (cell phones, personal emails) for staff unless explicitly listed as public-facing in the docs.",
        "The agent must NEVER give medical, legal, financial, or other professional advice. It handles logistics and information only.",
        "When a visitor provides their name and requests an appointment, the agent must use the book_appointment tool — not just say it will be scheduled.",
        "Complaints and frustrated visitors must be met with empathy BEFORE any attempt to solve or route.",
        "After-hours inquiries must acknowledge the timing and provide documented alternatives (emergency line, next-day booking, leave a message).",
    ],

    # ─── Upload Guide (shown to user after cloning) ───
    "upload_guide": {
        "title": "Upload your business docs to activate this agent",
        "description": "The AI Receptionist needs your business information to answer questions accurately. Upload any of the following:",
        "suggested_docs": [
            "Business hours and location details",
            "Services offered / menu of services",
            "Staff directory (public-facing names and roles)",
            "Cancellation and refund policies",
            "Payment and insurance info",
            "New client intake instructions",
            "FAQ document",
            "Parking, directions, and accessibility info",
        ],
    },
}
