# Cane — Product & Sales Playbook

## What Cane Does

Cane is document intelligence for teams. Businesses upload their files — SOPs, training docs, HR policies, forms, product guides, compliance docs — and get AI-powered search and Q&A across everything. Instead of digging through Google Drive or asking the person who "just knows where it is," anyone on the team can type a question and get an answer pulled from their own documents.

## Elevator Pitch (under 30 seconds)

"Cane lets your team search and ask questions across all your business documents using AI. Upload your SOPs, training materials, and policies — and anyone on the team can find answers instantly instead of hunting through folders or interrupting the person who knows."

## Key Features

### Document Intelligence
- Upload PDFs, Word docs, images, audio, video — Cane extracts text, runs OCR, transcribes media, and indexes everything for search.
- Smart chunking breaks documents into meaningful sections, not arbitrary splits.
- Quality filtering removes junk content automatically.

### AI Search & Q&A
- Three modes: Search (find relevant sections), Deep Search (reranked results), and Ask AI (conversational answers with citations).
- Workspace filtering — organize documents by department or topic, search within specific areas.
- Relevance scoring shows how confident the system is in each result.

### Agent Builder
- Create specialized AI agents from templates or from scratch.
- Auto-generate expert prompts from your documents.
- Each agent becomes a domain expert — customer support, compliance, internal ops, sales.
- Agents can be embedded on websites via a single script tag (widget).

### API Access
- Every agent is API-accessible.
- Embed document Q&A into Slack bots, internal portals, or customer support widgets.
- Tenant-scoped API keys with rate limiting.

### Tools & Integrations
- Agents can send emails (Gmail), book calendar events (Google Calendar), log data to spreadsheets (Google Sheets).
- MCP server connections for Slack, HubSpot, and other tools.
- Webhook-based tool system — connect to any API.

### Analytics & Admin
- See what your team searches for most.
- Zero-result query tracking — find gaps in your documentation.
- Multi-tenant architecture — each client is fully isolated.
- Role-based access: admin, owner, member.

### Evaluation System
- Built-in eval framework to test agent accuracy before deployment.
- Custom test cases, scoring criteria, and automated grading.
- Track performance over time as you add documents.

## Architecture

- **Backend:** Python / FastAPI
- **Frontend:** React + Vite
- **Database:** MySQL (multi-tenant)
- **Vector Search:** ChromaDB
- **LLM:** Claude (Anthropic)
- **Deployment:** Railway
- **Auth:** JWT with role-based access (admin / owner / member)
- **Security:** Rate limiting, input sanitization, file validation, security headers

## Who It's For

### Primary Verticals

**Dental & Medical Offices**
- Upload patient forms, handbooks, insurance guides.
- Staff gets instant answers without interrupting the office manager.
- Use case: "Does our insurance cover veneers?" → instant answer from the uploaded guide.

**Small Businesses & Nonprofits**
- Upload SOPs, HR policies, training materials.
- New hires onboard faster. Compliance questions answered in seconds.
- Use case: New employee asks "What's the PTO policy?" → pulled from the handbook.

**Beauty & Wellness (MedSpas, Salons)**
- Upload treatment protocols, consent forms, product guides, aftercare instructions.
- Staff can look up contraindications or pricing during client consultations.
- Use case: "What's the aftercare for micro-needling?" → instant, accurate answer.

**Financial Services**
- Upload underwriting guidelines, compliance docs, deal templates, product guides.
- Loan officers find the right criteria instantly instead of searching shared drives.
- Use case: "What's the minimum credit score for an SBA 7(a) loan?" → pulled from the guidelines.

**HVAC & Field Services**
- Upload equipment manuals, warranty policies, installation guides, safety procedures.
- Technicians in the field get answers on their phone.
- Use case: "What's the warranty on a Carrier 24ACC636?" → answer from the manual.

**Hospitality (Hotels, Event Venues)**
- Upload SOPs for every department, event coordination docs, vendor contracts, safety procedures.
- High-turnover staff gets answers without asking the GM.
- Use case: "What's the checkout procedure for VIP suites?" → pulled from the SOP.

**Real Estate**
- Upload listing agreements, market analyses, transaction checklists, property management docs.
- Agents and staff find procedures and forms without asking the broker.

## Pricing

- Pricing is currently flexible for early customers.
- Typical engagement: free pilot (60 days) in exchange for feedback and a testimonial.
- Target price range: $50-200/month per business depending on document volume and features.
- Enterprise / larger teams: custom pricing.

## Competitive Advantages

- **Multi-modal:** Handles PDFs, images, audio, video — not just text files.
- **Agent builder:** Not just search, but specialized AI agents that can take actions (email, calendar, CRM).
- **Evaluation system:** Built-in testing so you know the agent works before you deploy it.
- **White-label ready:** Embed on any website with a widget. API for custom integrations.
- **SMB-focused:** Built for small businesses, not enterprise complexity.
- **Tenant isolation:** Each customer's data is fully isolated. No data mixing.

## Objection Handling

**"We already use Google Drive / Dropbox"**
→ Cane doesn't replace your file storage. It sits on top of it. Upload the same docs you already have — Cane makes them searchable and answerable by AI. Google Drive search finds filenames. Cane finds answers inside documents.

**"We're too small to need this"**
→ The smaller you are, the more each person's time matters. If your office manager spends 20 minutes a day answering questions that are already documented somewhere, that's 80+ hours a year. Cane gives those hours back.

**"How is this different from ChatGPT?"**
→ ChatGPT doesn't know your business. It can't answer "What's our refund policy?" or "What's the aftercare for EmSculpt?" because it doesn't have your documents. Cane is trained on YOUR files and only answers from YOUR data.

**"Is our data secure?"**
→ Tenant isolation means your data is completely separated from other customers. JWT authentication, role-based access, rate limiting, and security headers. Your documents never touch another customer's environment.

**"What if it gives wrong answers?"**
→ Cane includes a built-in evaluation system. You write test questions, define what good answers look like, and run automated grading. You know exactly how accurate the agent is before you deploy it.

**"We don't have time to set this up"**
→ Setup is upload and go. Drop your docs in, and the system indexes them automatically. Most businesses are searching within 15 minutes of uploading their first batch.

## Sales Process

1. **Identify pain:** Use discovery questions to find the document search problem.
2. **Demo:** Show Cane with their actual industry's docs (or similar).
3. **Pilot:** Free 60-day pilot with 5-10 of their most-used docs.
4. **Expand:** After pilot, add more docs and move to paid plan.
5. **Refer:** Happy customers refer others in their industry.

## Discovery Questions

- "When someone on your team needs to find a specific piece of information in your files, what does that process look like today?"
- "How often does someone spend more than 10-15 minutes looking for a document or answer that already exists somewhere?"
- "What happens when the person who knows where everything is goes on vacation or leaves?"
- "How many documents or files are we talking roughly — hundreds, thousands?"
- "Who on the team would actually be searching day to day?"
- "Are there compliance or client reasons you need to find things quickly?"
- "If your team could just type a question and get the answer pulled from your own files, what would that change for you?"

## Email Signature Block

Colin
Founder, Cane
cane.fy
