"""
mcp_catalog.py — Pre-built MCP connector catalog.

Known MCP servers that users can connect with one click.
Each entry provides the server URL template and auth requirements.
"""

CONNECTORS = {
    "google_calendar": {
        "name": "Google Calendar",
        "icon": "GC",
        "description": "Read and create calendar events. Check availability, schedule meetings, manage RSVPs.",
        "category": "productivity",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Create a Google Cloud project, enable Calendar API, generate an OAuth token, and paste it here.",
        "example_tools": ["list_events", "create_event", "delete_event", "check_availability"],
    },
    "slack": {
        "name": "Slack",
        "icon": "SL",
        "description": "Send messages, read channels, manage conversations. Post alerts, summaries, and updates.",
        "category": "communication",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Create a Slack app at api.slack.com, add Bot Token Scopes (chat:write, channels:read), install to workspace, and paste the Bot Token here.",
        "example_tools": ["send_message", "list_channels", "read_channel_history"],
    },
    "gmail": {
        "name": "Gmail",
        "icon": "GM",
        "description": "Send emails, read inbox, search messages. Automate follow-ups, notifications, and replies.",
        "category": "communication",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Enable Gmail API in Google Cloud, generate OAuth credentials, and paste the access token here.",
        "example_tools": ["send_email", "search_emails", "read_email", "list_labels"],
    },
    "notion": {
        "name": "Notion",
        "icon": "NT",
        "description": "Read and write Notion pages and databases. Create entries, update records, search content.",
        "category": "productivity",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Create a Notion integration at notion.so/my-integrations, connect it to your workspace, and paste the Internal Integration Token here.",
        "example_tools": ["search_pages", "create_page", "update_database", "query_database"],
    },
    "hubspot": {
        "name": "HubSpot CRM",
        "icon": "HS",
        "description": "Manage contacts, deals, and companies. Create records, update pipelines, log activities.",
        "category": "crm",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Go to HubSpot Settings → Integrations → Private Apps, create an app with CRM scopes, and paste the access token here.",
        "example_tools": ["search_contacts", "create_contact", "update_deal", "list_deals"],
    },
    "airtable": {
        "name": "Airtable",
        "icon": "AT",
        "description": "Read and write Airtable bases. Query records, create entries, update fields.",
        "category": "productivity",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Go to airtable.com/create/tokens, create a personal access token with the scopes you need, and paste it here.",
        "example_tools": ["list_records", "create_record", "update_record", "search_records"],
    },
    "github": {
        "name": "GitHub",
        "icon": "GH",
        "description": "Manage repos, issues, and pull requests. Create issues, comment, search code.",
        "category": "development",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Generate a Personal Access Token at github.com/settings/tokens with the repo scope, and paste it here.",
        "example_tools": ["search_repos", "create_issue", "list_issues", "get_file_contents"],
    },
    "jira": {
        "name": "Jira",
        "icon": "JR",
        "description": "Manage projects, issues, and sprints. Create tickets, update statuses, assign work.",
        "category": "development",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Go to id.atlassian.com/manage-profile/security/api-tokens, create an API token, then use Base64(email:token) as the bearer value.",
        "example_tools": ["search_issues", "create_issue", "update_issue", "list_projects"],
    },
    "stripe": {
        "name": "Stripe",
        "icon": "ST",
        "description": "Look up customers, payments, subscriptions, and invoices. Read-only financial data.",
        "category": "finance",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Go to dashboard.stripe.com/apikeys, copy your Secret Key (starts with sk_), and paste it here. Use a restricted key for safety.",
        "example_tools": ["search_customers", "get_subscription", "list_invoices", "get_balance"],
    },
    "twilio": {
        "name": "Twilio SMS",
        "icon": "TW",
        "description": "Send and receive SMS messages. Look up phone numbers, check message status.",
        "category": "communication",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Get your Account SID and Auth Token from console.twilio.com. Use Base64(SID:Token) as the bearer value.",
        "example_tools": ["send_sms", "list_messages", "lookup_number"],
    },
    "salesforce": {
        "name": "Salesforce",
        "icon": "SF",
        "description": "Manage leads, contacts, opportunities, and accounts. Query and update CRM records.",
        "category": "crm",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Create a Connected App in Salesforce Setup, get an access token via OAuth, and paste it here.",
        "example_tools": ["search_leads", "create_lead", "update_opportunity", "query_soql"],
    },
    "sendgrid": {
        "name": "SendGrid Email",
        "icon": "SG",
        "description": "Send transactional and marketing emails. Manage contacts, templates, and campaigns.",
        "category": "communication",
        "server_url": "",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "setup_instructions": "Go to app.sendgrid.com/settings/api_keys, create an API key with Mail Send permission, and paste it here.",
        "example_tools": ["send_email", "list_contacts", "get_templates"],
    },
}

# ── Categories for UI grouping ──
CATEGORIES = {
    "communication": {"name": "Communication", "icon": "SL"},
    "productivity": {"name": "Productivity", "icon": "PR"},
    "crm": {"name": "CRM & Sales", "icon": "HS"},
    "development": {"name": "Development", "icon": "DV"},
    "finance": {"name": "Finance", "icon": "FN"},
}


def get_catalog() -> list[dict]:
    """Return all connectors as a list for the API."""
    result = []
    for key, c in CONNECTORS.items():
        result.append({
            "id": key,
            "name": c["name"],
            "icon": c["icon"],
            "description": c["description"],
            "category": c["category"],
            "auth_type": c["auth_type"],
            "setup_instructions": c["setup_instructions"],
            "example_tools": c["example_tools"],
            "has_url": bool(c.get("server_url")),
        })
    return result


def get_connector(connector_id: str) -> dict | None:
    """Get a specific connector definition."""
    return CONNECTORS.get(connector_id)


def get_categories() -> list[dict]:
    """Return categories for UI grouping."""
    return [{"id": k, **v} for k, v in CATEGORIES.items()]
