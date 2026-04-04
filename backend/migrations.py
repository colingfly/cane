"""
migrations.py — Database schema migrations.

Run automatically at startup to ensure all tables and columns exist.
"""
from sqlalchemy import inspect, text
from database import engine


def run_all():
    """Run all migrations. Safe to call multiple times."""
    _migrate_agent_columns()
    _migrate_api_keys_table()
    _migrate_marketplace_tables()
    _migrate_agent_tools_table()
    _migrate_mcp_servers_table()
    _migrate_conversation_logs_table()
    _migrate_widget_config_columns()
    _migrate_connector_tables()
    _migrate_agent_links_table()
    _migrate_agent_schedules_table()
    _migrate_agent_memories_table()
    _migrate_conversations_table()
    _migrate_schedule_condition_columns()
    _migrate_tool_chaining_column()
    _migrate_agent_communications_table()
    _migrate_orchestrator_mode_column()
    _migrate_external_agents_table()
    _migrate_environment_webhook_columns()
    _migrate_eval_target_columns()
    _migrate_eval_run_api_columns()
    _migrate_marketplace_badge_columns()
    _migrate_agent_versions_table()
    _migrate_finetune_jobs_table()
    _migrate_mining_tables()
    _migrate_eval_schedules_table()
    _migrate_osint_briefings_table()
    _migrate_osint_tools_fire_and_forget()
    _migrate_osint_system_prompt_v2()
    _migrate_eval_reliability_columns()
    _migrate_judge_model_columns()
    _migrate_guest_access_columns()
    _migrate_workspace_model_config()
    _migrate_finetune_auto_deploy()


def _migrate_guest_access_columns():
    """Add guest_session_id columns and make marketplace FKs nullable for anonymous access."""
    insp = inspect(engine)

    # Workspaces: add guest_session_id
    ws_cols = {c["name"] for c in insp.get_columns("workspaces")}
    if "guest_session_id" not in ws_cols:
        try:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE workspaces ADD COLUMN guest_session_id VARCHAR(36) NULL"))
                conn.execute(text("CREATE INDEX idx_ws_guest_session ON workspaces(guest_session_id)"))
            print("  [DB] Added guest_session_id to workspaces")
        except Exception as e:
            print(f"  [DB] workspaces guest_session_id failed: {e}")

    # Marketplace listings: add guest_session_id, make publisher_user_id nullable
    if "marketplace_listings" in insp.get_table_names():
        ml_cols = {c["name"] for c in insp.get_columns("marketplace_listings")}
        if "guest_session_id" not in ml_cols:
            try:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE marketplace_listings ADD COLUMN guest_session_id VARCHAR(36) NULL"))
                    conn.execute(text("ALTER TABLE marketplace_listings MODIFY COLUMN publisher_user_id VARCHAR(36) NULL"))
                print("  [DB] Added guest columns to marketplace_listings")
            except Exception as e:
                print(f"  [DB] marketplace_listings guest migration failed: {e}")

    # Marketplace clones: add guest_session_id, make cloned_by_user_id nullable
    if "marketplace_clones" in insp.get_table_names():
        mc_cols = {c["name"] for c in insp.get_columns("marketplace_clones")}
        if "guest_session_id" not in mc_cols:
            try:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE marketplace_clones ADD COLUMN guest_session_id VARCHAR(36) NULL"))
                    conn.execute(text("ALTER TABLE marketplace_clones MODIFY COLUMN cloned_by_user_id VARCHAR(36) NULL"))
                print("  [DB] Added guest columns to marketplace_clones")
            except Exception as e:
                print(f"  [DB] marketplace_clones guest migration failed: {e}")

    print("  [DB] Guest access migration complete")


def _migrate_osint_system_prompt_v2():
    """Update OSINT agent system prompt to demand explicit URLs and citations."""
    try:
        with engine.begin() as conn:
            # Only update if still using old prompt (check for old marker text)
            result = conn.execute(text(
                "SELECT id, system_prompt FROM workspaces WHERE agent_type = 'osint'"
            ))
            for row in result:
                prompt = row[1] or ""
                if "Source URLs" not in prompt and "COPY exact data" not in prompt:
                    from seeds.seed_osint_agent import SYSTEM_PROMPT
                    conn.execute(text(
                        "UPDATE workspaces SET system_prompt = :prompt WHERE id = :wid"
                    ), {"prompt": SYSTEM_PROMPT, "wid": row[0]})
                    print(f"  [Migration] Updated OSINT system prompt for workspace {row[0]}")
    except Exception as e:
        print(f"  [Migration] OSINT prompt update skipped: {e}")


def _migrate_osint_tools_fire_and_forget():
    """Fix OSINT agent tools to NOT be fire-and-forget so Claude sees the response data."""
    try:
        with engine.begin() as conn:
            # Find OSINT workspaces and set their tools to fire_and_forget=0
            conn.execute(text(
                "UPDATE agent_tools SET fire_and_forget = 0 "
                "WHERE workspace_id IN (SELECT id FROM workspaces WHERE agent_type = 'osint') "
                "AND fire_and_forget = 1"
            ))
    except Exception:
        pass  # Safe to fail silently


def _migrate_agent_columns():
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("workspaces")}
    migrations = {
        "agent_type": "ALTER TABLE workspaces ADD COLUMN agent_type VARCHAR(50) NULL",
        "system_prompt": "ALTER TABLE workspaces ADD COLUMN system_prompt TEXT NULL",
        "agent_icon": "ALTER TABLE workspaces ADD COLUMN agent_icon VARCHAR(10) NULL",
        "agent_description": "ALTER TABLE workspaces ADD COLUMN agent_description TEXT NULL",
        "show_on_homepage": "ALTER TABLE workspaces ADD COLUMN show_on_homepage TINYINT(1) DEFAULT 0",
    }
    added = []
    for col_name, sql in migrations.items():
        if col_name not in cols:
            try:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
            except Exception as e:
                print(f"  [DB] Failed to add {col_name}: {e}")
    if added:
        print(f"  [DB] Agent columns added: {', '.join(added)}")
    else:
        print("  [DB] Agent columns already present")


def _migrate_api_keys_table():
    insp = inspect(engine)
    if "api_keys" not in insp.get_table_names():
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE api_keys (
                    id VARCHAR(36) PRIMARY KEY,
                    tenant_id VARCHAR(36) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    key_hash VARCHAR(255) NOT NULL,
                    key_prefix VARCHAR(12) NOT NULL,
                    workspace_id VARCHAR(36) NULL,
                    is_active TINYINT(1) DEFAULT 1,
                    requests_today INT DEFAULT 0,
                    rate_limit INT DEFAULT 1000,
                    last_used_at DATETIME NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
                )
            """))
        print("  [DB] api_keys table created")
    else:
        print("  [DB] api_keys table already exists")


def _migrate_marketplace_tables():
    insp = inspect(engine)
    tables = insp.get_table_names()

    if "marketplace_listings" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE marketplace_listings (
                    id VARCHAR(36) PRIMARY KEY,
                    publisher_tenant_id VARCHAR(36) NOT NULL,
                    publisher_user_id VARCHAR(36) NOT NULL,
                    publisher_name VARCHAR(255) DEFAULT '',
                    source_workspace_id VARCHAR(36) NOT NULL,
                    source_environment_id VARCHAR(36),
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    icon VARCHAR(10) DEFAULT '',
                    system_prompt TEXT NOT NULL,
                    agent_type VARCHAR(50) DEFAULT 'custom',
                    category VARCHAR(100) DEFAULT 'general',
                    tags TEXT,
                    pack_type VARCHAR(20) DEFAULT 'byod',
                    included_documents TEXT,
                    document_count INT DEFAULT 0,
                    overall_score FLOAT,
                    eval_snapshot TEXT,
                    test_cases_snapshot TEXT,
                    criteria_snapshot TEXT,
                    custom_rules_snapshot TEXT,
                    test_case_count INT DEFAULT 0,
                    clone_count INT DEFAULT 0,
                    verify_count INT DEFAULT 0,
                    avg_verify_score FLOAT,
                    status VARCHAR(20) DEFAULT 'active',
                    is_featured TINYINT(1) DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (publisher_tenant_id) REFERENCES tenants(id),
                    FOREIGN KEY (publisher_user_id) REFERENCES users(id)
                )
            """))
        print("  [DB] marketplace_listings table created")
    else:
        print("  [DB] marketplace_listings table already exists")

    # Add tools columns if missing
    try:
        cols = {c["name"] for c in insp.get_columns("marketplace_listings")}
        if "tools_snapshot" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE marketplace_listings ADD COLUMN tools_snapshot TEXT NULL"))
                conn.execute(text("ALTER TABLE marketplace_listings ADD COLUMN tool_count INT DEFAULT 0"))
            print("  [DB] Added tools_snapshot + tool_count to marketplace_listings")
    except Exception as e:
        print(f"  [DB] Marketplace tools migration skipped: {e}")

    if "marketplace_clones" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE marketplace_clones (
                    id VARCHAR(36) PRIMARY KEY,
                    listing_id VARCHAR(36) NOT NULL,
                    cloned_by_tenant_id VARCHAR(36) NOT NULL,
                    cloned_by_user_id VARCHAR(36) NOT NULL,
                    cloned_workspace_id VARCHAR(36),
                    cloned_environment_id VARCHAR(36),
                    verify_score FLOAT,
                    verified_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE,
                    FOREIGN KEY (cloned_by_tenant_id) REFERENCES tenants(id),
                    FOREIGN KEY (cloned_by_user_id) REFERENCES users(id)
                )
            """))
        print("  [DB] marketplace_clones table created")
    else:
        print("  [DB] marketplace_clones table already exists")


def _migrate_agent_tools_table():
    insp = inspect(engine)
    if "agent_tools" not in insp.get_table_names():
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE agent_tools (
                    id VARCHAR(36) PRIMARY KEY,
                    workspace_id VARCHAR(36) NOT NULL,
                    tenant_id VARCHAR(36) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    tool_type VARCHAR(50) DEFAULT 'webhook',
                    url TEXT NOT NULL,
                    method VARCHAR(10) DEFAULT 'POST',
                    headers TEXT DEFAULT '{}',
                    payload_template TEXT DEFAULT '{}',
                    auth_type VARCHAR(50) DEFAULT 'none',
                    auth_value TEXT DEFAULT '',
                    parameters TEXT DEFAULT '[]',
                    is_enabled TINYINT(1) DEFAULT 1,
                    fire_and_forget TINYINT(1) DEFAULT 1,
                    execution_count INT DEFAULT 0,
                    last_executed_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
                )
            """))
        print("  [DB] agent_tools table created")
    else:
        print("  [DB] agent_tools table already exists")


def _migrate_mcp_servers_table():
    insp = inspect(engine)
    if "mcp_servers" not in insp.get_table_names():
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE mcp_servers (
                    id VARCHAR(36) PRIMARY KEY,
                    workspace_id VARCHAR(36) NOT NULL,
                    tenant_id VARCHAR(36) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    server_url TEXT NOT NULL,
                    server_type VARCHAR(50) DEFAULT 'custom',
                    icon VARCHAR(10) DEFAULT '🔌',
                    auth_type VARCHAR(50) DEFAULT 'none',
                    auth_header VARCHAR(255) DEFAULT 'Authorization',
                    auth_value TEXT DEFAULT '',
                    discovered_tools TEXT DEFAULT '[]',
                    tool_count INT DEFAULT 0,
                    is_enabled TINYINT(1) DEFAULT 1,
                    status VARCHAR(20) DEFAULT 'pending',
                    status_message TEXT DEFAULT '',
                    last_synced_at DATETIME,
                    total_calls INT DEFAULT 0,
                    avg_latency_ms FLOAT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
                )
            """))
        print("  [DB] mcp_servers table created")
    else:
        print("  [DB] mcp_servers table already exists")


def _migrate_conversation_logs_table():
    insp = inspect(engine)
    if "conversation_logs" not in insp.get_table_names():
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE conversation_logs (
                        id VARCHAR(36) PRIMARY KEY,
                        tenant_id VARCHAR(36) NOT NULL,
                        workspace_id VARCHAR(36) NOT NULL,
                        user_id VARCHAR(36),
                        session_id VARCHAR(100),
                        channel VARCHAR(20) DEFAULT 'internal',
                        query TEXT NOT NULL,
                        chunks_used INT DEFAULT 0,
                        answer_preview TEXT,
                        sources_used TEXT,
                        tools_called TEXT,
                        response_time_ms INT,
                        thumbs_up INT DEFAULT 0,
                        thumbs_down INT DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                    )
                """))
                conn.execute(text(
                    "CREATE INDEX idx_convlog_workspace ON conversation_logs(workspace_id, created_at)"
                ))
                conn.execute(text(
                    "CREATE INDEX idx_convlog_tenant ON conversation_logs(tenant_id, created_at)"
                ))
            print("  [DB] conversation_logs table created")
        except Exception as e:
            print(f"  [DB] conversation_logs migration failed: {e}")
    else:
        print("  [DB] conversation_logs table already exists")


def _migrate_widget_config_columns():
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("workspaces")}
    if "widget_config" not in cols:
        try:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE workspaces ADD COLUMN widget_config TEXT NULL"
                ))
            print("  [DB] Added widget_config column to workspaces")
        except Exception as e:
            print(f"  [DB] widget_config migration failed: {e}")


def _migrate_connector_tables():
    """Create connector_credentials, connector_syncs, and connector_files tables."""
    insp = inspect(engine)
    tables = insp.get_table_names()

    if "connector_credentials" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE connector_credentials (
                    id VARCHAR(36) PRIMARY KEY,
                    tenant_id VARCHAR(36) NOT NULL,
                    provider VARCHAR(50) NOT NULL,
                    refresh_token TEXT DEFAULT '',
                    access_token TEXT DEFAULT '',
                    token_expires_at DATETIME NULL,
                    account_email VARCHAR(255) DEFAULT '',
                    is_active TINYINT(1) DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
                )
            """))
        print("  [DB] connector_credentials table created")
    else:
        print("  [DB] connector_credentials table already exists")

    if "connector_syncs" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE connector_syncs (
                    id VARCHAR(36) PRIMARY KEY,
                    tenant_id VARCHAR(36) NOT NULL,
                    credential_id VARCHAR(36) NOT NULL,
                    workspace_id VARCHAR(36) NOT NULL,
                    provider VARCHAR(50) DEFAULT 'google_drive',
                    remote_folder_id VARCHAR(255) NOT NULL,
                    remote_folder_name VARCHAR(500) DEFAULT '',
                    status VARCHAR(20) DEFAULT 'active',
                    last_sync_at DATETIME NULL,
                    last_sync_status VARCHAR(20) DEFAULT '',
                    last_sync_message TEXT DEFAULT '',
                    files_synced INT DEFAULT 0,
                    sync_interval_minutes INT DEFAULT 60,
                    last_change_token TEXT DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                    FOREIGN KEY (credential_id) REFERENCES connector_credentials(id),
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                )
            """))
            conn.execute(text(
                "CREATE INDEX idx_connector_syncs_active ON connector_syncs(status, last_sync_at)"
            ))
        print("  [DB] connector_syncs table created")
    else:
        print("  [DB] connector_syncs table already exists")

    if "connector_files" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE connector_files (
                    id VARCHAR(36) PRIMARY KEY,
                    sync_id VARCHAR(36) NOT NULL,
                    tenant_id VARCHAR(36) NOT NULL,
                    document_id VARCHAR(36) NULL,
                    remote_file_id VARCHAR(255) NOT NULL,
                    remote_name VARCHAR(500) DEFAULT '',
                    remote_mime_type VARCHAR(255) DEFAULT '',
                    remote_modified_at DATETIME NULL,
                    remote_size_bytes INT DEFAULT 0,
                    local_path VARCHAR(1000) DEFAULT '',
                    status VARCHAR(20) DEFAULT 'pending',
                    error_message TEXT DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (sync_id) REFERENCES connector_syncs(id) ON DELETE CASCADE,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
                )
            """))
            conn.execute(text(
                "CREATE INDEX idx_connector_files_sync ON connector_files(sync_id, status)"
            ))
        print("  [DB] connector_files table created")
    else:
        print("  [DB] connector_files table already exists")


def _migrate_agent_links_table():
    """Create agent_links table for agent-as-tool orchestration."""
    insp = inspect(engine)
    if "agent_links" not in insp.get_table_names():
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE agent_links (
                    id VARCHAR(36) PRIMARY KEY,
                    parent_workspace_id VARCHAR(36) NOT NULL,
                    child_workspace_id VARCHAR(36) NOT NULL,
                    tenant_id VARCHAR(36) NOT NULL,
                    tool_name VARCHAR(64) NOT NULL,
                    tool_description TEXT NOT NULL,
                    is_enabled TINYINT(1) DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (parent_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (child_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                    UNIQUE KEY uq_agent_link (parent_workspace_id, child_workspace_id)
                )
            """))
        print("  [DB] agent_links table created")
    else:
        print("  [DB] agent_links table already exists")


def _migrate_agent_schedules_table():
    """Create agent_schedules and agent_schedule_runs tables."""
    insp = inspect(engine)
    tables = insp.get_table_names()

    if "agent_schedules" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE agent_schedules (
                    id VARCHAR(36) PRIMARY KEY,
                    workspace_id VARCHAR(36) NOT NULL,
                    tenant_id VARCHAR(36) NOT NULL,
                    prompt TEXT NOT NULL,
                    schedule_type VARCHAR(20) DEFAULT 'interval',
                    interval_minutes INT DEFAULT 60,
                    daily_time VARCHAR(5) DEFAULT '',
                    is_enabled TINYINT(1) DEFAULT 1,
                    last_run_at DATETIME NULL,
                    last_run_status VARCHAR(20) DEFAULT '',
                    next_run_at DATETIME NULL,
                    run_count INT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                    INDEX idx_schedules_next_run (is_enabled, next_run_at)
                )
            """))
        print("  [DB] agent_schedules table created")
    else:
        print("  [DB] agent_schedules table already exists")

    if "agent_schedule_runs" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE agent_schedule_runs (
                    id VARCHAR(36) PRIMARY KEY,
                    schedule_id VARCHAR(36) NOT NULL,
                    workspace_id VARCHAR(36) NOT NULL,
                    tenant_id VARCHAR(36) NOT NULL,
                    prompt TEXT NOT NULL,
                    response TEXT DEFAULT '',
                    status VARCHAR(20) DEFAULT 'running',
                    error_message TEXT DEFAULT '',
                    duration_ms INT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (schedule_id) REFERENCES agent_schedules(id) ON DELETE CASCADE,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                    INDEX idx_schedule_runs_schedule (schedule_id, created_at)
                )
            """))
        print("  [DB] agent_schedule_runs table created")
    else:
        print("  [DB] agent_schedule_runs table already exists")


def _migrate_agent_memories_table():
    """Create agent_memories table for persistent agent memory."""
    insp = inspect(engine)
    if "agent_memories" not in insp.get_table_names():
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE agent_memories (
                    id VARCHAR(36) PRIMARY KEY,
                    workspace_id VARCHAR(36) NOT NULL,
                    tenant_id VARCHAR(36) NOT NULL,
                    user_id VARCHAR(36) NULL,
                    memory_type VARCHAR(50) DEFAULT 'fact',
                    content TEXT NOT NULL,
                    source_query TEXT DEFAULT '',
                    confidence FLOAT DEFAULT 1.0,
                    is_active TINYINT(1) DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                    INDEX idx_memories_workspace_user (workspace_id, user_id, is_active)
                )
            """))
        print("  [DB] agent_memories table created")
    else:
        print("  [DB] agent_memories table already exists")


def _migrate_conversations_table():
    """Create conversations and conversation_messages tables."""
    insp = inspect(engine)
    tables = insp.get_table_names()

    if "conversations" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE conversations (
                    id VARCHAR(36) PRIMARY KEY,
                    workspace_id VARCHAR(36) NOT NULL,
                    tenant_id VARCHAR(36) NOT NULL,
                    user_id VARCHAR(36) NULL,
                    session_id VARCHAR(100) NULL,
                    title VARCHAR(500) DEFAULT '',
                    channel VARCHAR(20) DEFAULT 'internal',
                    message_count INT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                    INDEX idx_conversations_workspace (workspace_id, created_at)
                )
            """))
        print("  [DB] conversations table created")
    else:
        print("  [DB] conversations table already exists")

    if "conversation_messages" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE conversation_messages (
                    id VARCHAR(36) PRIMARY KEY,
                    conversation_id VARCHAR(36) NOT NULL,
                    role VARCHAR(20) NOT NULL,
                    content TEXT NOT NULL,
                    sources TEXT NULL,
                    chunks_used INT DEFAULT 0,
                    response_time_ms INT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                    INDEX idx_conv_messages_conv (conversation_id, created_at)
                )
            """))
        print("  [DB] conversation_messages table created")
    else:
        print("  [DB] conversation_messages table already exists")


def _migrate_schedule_condition_columns():
    """Add condition columns to agent_schedules and condition_met to agent_schedule_runs."""
    insp = inspect(engine)
    try:
        cols = {c["name"] for c in insp.get_columns("agent_schedules")}
        condition_cols = {
            "condition_enabled": "ALTER TABLE agent_schedules ADD COLUMN condition_enabled TINYINT(1) DEFAULT 0",
            "condition_prompt": "ALTER TABLE agent_schedules ADD COLUMN condition_prompt TEXT NULL",
            "condition_action": "ALTER TABLE agent_schedules ADD COLUMN condition_action VARCHAR(50) DEFAULT 'store_only'",
            "condition_webhook_url": "ALTER TABLE agent_schedules ADD COLUMN condition_webhook_url TEXT NULL",
            "condition_webhook_headers": "ALTER TABLE agent_schedules ADD COLUMN condition_webhook_headers TEXT NULL",
        }
        added = []
        for col_name, sql in condition_cols.items():
            if col_name not in cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
        if added:
            print(f"  [DB] Schedule condition columns added: {', '.join(added)}")
        else:
            print("  [DB] Schedule condition columns already present")
    except Exception as e:
        print(f"  [DB] Schedule condition migration skipped: {e}")

    # Add condition_met to agent_schedule_runs
    try:
        run_cols = {c["name"] for c in insp.get_columns("agent_schedule_runs")}
        if "condition_met" not in run_cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE agent_schedule_runs ADD COLUMN condition_met TINYINT(1) NULL"
                ))
            print("  [DB] Added condition_met to agent_schedule_runs")
    except Exception as e:
        print(f"  [DB] Schedule runs condition_met migration skipped: {e}")


def _migrate_tool_chaining_column():
    """Add tool_chaining_enabled column to workspaces."""
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("workspaces")}
    if "tool_chaining_enabled" not in cols:
        try:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE workspaces ADD COLUMN tool_chaining_enabled TINYINT(1) DEFAULT 0"
                ))
            print("  [DB] Added tool_chaining_enabled to workspaces")
        except Exception as e:
            print(f"  [DB] tool_chaining_enabled migration failed: {e}")
    else:
        print("  [DB] tool_chaining_enabled column already present")


def _migrate_agent_communications_table():
    """Create agent_communications table for inter-agent call logging."""
    insp = inspect(engine)
    if "agent_communications" not in insp.get_table_names():
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE agent_communications (
                        id VARCHAR(36) PRIMARY KEY,
                        tenant_id VARCHAR(36) NOT NULL,
                        parent_agent_id VARCHAR(36) NOT NULL,
                        child_agent_id VARCHAR(36) NOT NULL,
                        session_id VARCHAR(100) DEFAULT '',
                        query_sent TEXT,
                        response_received TEXT,
                        depth_level INT DEFAULT 0,
                        duration_ms INT DEFAULT 0,
                        status VARCHAR(20) DEFAULT 'ok',
                        error_message TEXT DEFAULT '',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        INDEX idx_comms_tenant (tenant_id, created_at),
                        INDEX idx_comms_parent (parent_agent_id, created_at)
                    )
                """))
            print("  [DB] agent_communications table created")
        except Exception as e:
            print(f"  [DB] agent_communications migration failed: {e}")
    else:
        print("  [DB] agent_communications table already exists")


def _migrate_orchestrator_mode_column():
    """Add orchestrator_mode column to workspaces."""
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("workspaces")}
    if "orchestrator_mode" not in cols:
        try:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE workspaces ADD COLUMN orchestrator_mode TINYINT(1) DEFAULT 0"
                ))
            print("  [DB] Added orchestrator_mode to workspaces")
        except Exception as e:
            print(f"  [DB] orchestrator_mode migration failed: {e}")
    else:
        print("  [DB] orchestrator_mode column already present")


def _migrate_external_agents_table():
    """Create external_agents table for agents registered from outside Cane."""
    insp = inspect(engine)
    if "external_agents" not in insp.get_table_names():
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE external_agents (
                        id VARCHAR(36) PRIMARY KEY,
                        workspace_id VARCHAR(36) NOT NULL,
                        tenant_id VARCHAR(36) NOT NULL,
                        endpoint_url TEXT NOT NULL,
                        auth_type VARCHAR(20) DEFAULT 'none',
                        auth_token TEXT DEFAULT '',
                        parameters TEXT DEFAULT '[]',
                        is_active TINYINT(1) DEFAULT 1,
                        last_called_at DATETIME NULL,
                        avg_response_ms INT DEFAULT 0,
                        total_calls INT DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        INDEX idx_ext_tenant (tenant_id),
                        INDEX idx_ext_workspace (workspace_id)
                    )
                """))
            print("  [DB] external_agents table created")
        except Exception as e:
            print(f"  [DB] external_agents migration failed: {e}")
    else:
        print("  [DB] external_agents table already exists")


def _migrate_environment_webhook_columns():
    """Add webhook notification columns to environments table."""
    insp = inspect(engine)
    try:
        cols = {c["name"] for c in insp.get_columns("environments")}
        webhook_cols = {
            "webhook_url": "ALTER TABLE environments ADD COLUMN webhook_url VARCHAR(500) NULL DEFAULT ''",
            "webhook_headers": "ALTER TABLE environments ADD COLUMN webhook_headers TEXT NULL",
            "webhook_enabled": "ALTER TABLE environments ADD COLUMN webhook_enabled TINYINT(1) DEFAULT 0",
        }
        added = []
        for col_name, sql in webhook_cols.items():
            if col_name not in cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
        if added:
            print(f"  [DB] Environment webhook columns added: {', '.join(added)}")
        else:
            print("  [DB] Environment webhook columns already present")
    except Exception as e:
        print(f"  [DB] Environment webhook migration skipped: {e}")


def _migrate_eval_target_columns():
    """Add external agent target columns to environments table."""
    insp = inspect(engine)
    try:
        cols = {c["name"] for c in insp.get_columns("environments")}
        target_cols = {
            "target_type": "ALTER TABLE environments ADD COLUMN target_type VARCHAR(20) DEFAULT 'internal'",
            "target_url": "ALTER TABLE environments ADD COLUMN target_url VARCHAR(500) NULL DEFAULT ''",
            "target_method": "ALTER TABLE environments ADD COLUMN target_method VARCHAR(10) DEFAULT 'POST'",
            "target_headers": "ALTER TABLE environments ADD COLUMN target_headers TEXT NULL",
            "target_payload_template": "ALTER TABLE environments ADD COLUMN target_payload_template TEXT NULL",
            "target_response_path": "ALTER TABLE environments ADD COLUMN target_response_path VARCHAR(255) DEFAULT 'response'",
            "is_public": "ALTER TABLE environments ADD COLUMN is_public TINYINT(1) DEFAULT 0",
        }
        added = []
        for col_name, sql in target_cols.items():
            if col_name not in cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
        if added:
            print(f"  [DB] Eval target columns added: {', '.join(added)}")
        else:
            print("  [DB] Eval target columns already present")
    except Exception as e:
        print(f"  [DB] Eval target migration skipped: {e}")


def _migrate_eval_run_api_columns():
    """Add target_snapshot and api_key_id columns to eval_runs table."""
    insp = inspect(engine)
    try:
        cols = {c["name"] for c in insp.get_columns("eval_runs")}
        run_cols = {
            "target_snapshot": "ALTER TABLE eval_runs ADD COLUMN target_snapshot TEXT NULL",
            "api_key_id": "ALTER TABLE eval_runs ADD COLUMN api_key_id VARCHAR(36) NULL",
        }
        added = []
        for col_name, sql in run_cols.items():
            if col_name not in cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
        if added:
            print(f"  [DB] Eval run API columns added: {', '.join(added)}")
        else:
            print("  [DB] Eval run API columns already present")
    except Exception as e:
        print(f"  [DB] Eval run API migration skipped: {e}")


def _migrate_marketplace_badge_columns():
    """Add badge columns to marketplace_listings table."""
    insp = inspect(engine)
    try:
        cols = {c["name"] for c in insp.get_columns("marketplace_listings")}
        badge_cols = {
            "badge_level": "ALTER TABLE marketplace_listings ADD COLUMN badge_level VARCHAR(20) DEFAULT 'unverified'",
            "badge_updated_at": "ALTER TABLE marketplace_listings ADD COLUMN badge_updated_at DATETIME NULL",
        }
        added = []
        for col_name, sql in badge_cols.items():
            if col_name not in cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
        if added:
            print(f"  [DB] Marketplace badge columns added: {', '.join(added)}")
        else:
            print("  [DB] Marketplace badge columns already present")
    except Exception as e:
        print(f"  [DB] Marketplace badge migration skipped: {e}")


def _migrate_agent_versions_table():
    """Create agent_versions table for agent config versioning."""
    insp = inspect(engine)
    if "agent_versions" not in insp.get_table_names():
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE agent_versions (
                        id VARCHAR(36) PRIMARY KEY,
                        workspace_id VARCHAR(36) NOT NULL,
                        tenant_id VARCHAR(36) NOT NULL,
                        version_number INT NOT NULL,
                        label VARCHAR(255) DEFAULT '',
                        config_snapshot TEXT NOT NULL,
                        changes TEXT DEFAULT '[]',
                        created_by VARCHAR(36) NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        INDEX idx_versions_workspace (workspace_id, version_number)
                    )
                """))
            print("  [DB] agent_versions table created")
        except Exception as e:
            print(f"  [DB] agent_versions migration failed: {e}")
    else:
        print("  [DB] agent_versions table already exists")


def _migrate_finetune_jobs_table():
    """Create finetune_jobs table for fine-tune lineage tracking."""
    insp = inspect(engine)
    if "finetune_jobs" not in insp.get_table_names():
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE finetune_jobs (
                        id VARCHAR(36) PRIMARY KEY,
                        tenant_id VARCHAR(36) NOT NULL,
                        environment_id VARCHAR(36) NULL,
                        openai_job_id VARCHAR(100) DEFAULT '',
                        base_model VARCHAR(100) DEFAULT '',
                        fine_tuned_model VARCHAR(255) DEFAULT '',
                        training_file_id VARCHAR(100) DEFAULT '',
                        training_examples INT DEFAULT 0,
                        n_epochs INT DEFAULT 3,
                        min_score FLOAT DEFAULT 80,
                        status VARCHAR(50) DEFAULT 'pending',
                        created_by VARCHAR(36) NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        INDEX idx_finetune_tenant (tenant_id, created_at),
                        INDEX idx_finetune_env (environment_id)
                    )
                """))
            print("  [DB] finetune_jobs table created")
        except Exception as e:
            print(f"  [DB] finetune_jobs migration failed: {e}")
    else:
        print("  [DB] finetune_jobs table already exists")


def _migrate_mining_tables():
    """Create mining_jobs and mined_examples tables for failure mining pipeline."""
    insp = inspect(engine)

    if "mining_jobs" not in insp.get_table_names():
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE mining_jobs (
                        id VARCHAR(36) PRIMARY KEY,
                        environment_id VARCHAR(36) NOT NULL,
                        tenant_id VARCHAR(36) NOT NULL,
                        status VARCHAR(20) DEFAULT 'pending',
                        source_run_ids TEXT NULL,
                        config TEXT NULL,
                        total_failures INT DEFAULT 0,
                        total_mined INT DEFAULT 0,
                        error_message TEXT NULL,
                        created_by VARCHAR(36) NULL,
                        api_key_id VARCHAR(36) NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        completed_at DATETIME NULL,
                        FOREIGN KEY (environment_id) REFERENCES environments(id),
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        INDEX idx_mining_tenant (tenant_id, created_at),
                        INDEX idx_mining_env (environment_id)
                    )
                """))
            print("  [DB] mining_jobs table created")
        except Exception as e:
            print(f"  [DB] mining_jobs migration failed: {e}")
    else:
        print("  [DB] mining_jobs table already exists")

    if "mined_examples" not in insp.get_table_names():
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE mined_examples (
                        id VARCHAR(36) PRIMARY KEY,
                        mining_job_id VARCHAR(36) NOT NULL,
                        eval_result_id VARCHAR(36) NULL,
                        failure_type VARCHAR(50) DEFAULT 'other',
                        original_answer TEXT NULL,
                        improved_answer TEXT NULL,
                        improvement_reasoning TEXT NULL,
                        prompt TEXT NULL,
                        expected_answer TEXT NULL,
                        sources_context TEXT NULL,
                        original_score FLOAT DEFAULT 0,
                        estimated_improved_score FLOAT NULL,
                        export_format VARCHAR(10) DEFAULT 'dpo',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (mining_job_id) REFERENCES mining_jobs(id) ON DELETE CASCADE,
                        INDEX idx_mined_job (mining_job_id),
                        INDEX idx_mined_failure_type (failure_type)
                    )
                """))
            print("  [DB] mined_examples table created")
        except Exception as e:
            print(f"  [DB] mined_examples migration failed: {e}")
    else:
        print("  [DB] mined_examples table already exists")


def _migrate_eval_schedules_table():
    """Create eval_schedules table for automated eval runs."""
    insp = inspect(engine)
    if "eval_schedules" not in insp.get_table_names():
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE eval_schedules (
                        id VARCHAR(36) PRIMARY KEY,
                        environment_id VARCHAR(36) NOT NULL,
                        tenant_id VARCHAR(36) NOT NULL,
                        is_enabled TINYINT(1) DEFAULT 1,
                        schedule_type VARCHAR(20) DEFAULT 'daily',
                        daily_time VARCHAR(5) DEFAULT '09:00',
                        interval_hours INT DEFAULT 24,
                        cron_expression VARCHAR(100) NULL,
                        auto_mine TINYINT(1) DEFAULT 0,
                        mine_max_score INT DEFAULT 60,
                        notify_on_regression TINYINT(1) DEFAULT 1,
                        last_run_id VARCHAR(36) NULL,
                        last_run_at DATETIME NULL,
                        last_score FLOAT NULL,
                        next_run_at DATETIME NULL,
                        run_count INT DEFAULT 0,
                        last_status VARCHAR(20) DEFAULT 'idle',
                        consecutive_failures INT DEFAULT 0,
                        created_by VARCHAR(36) NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        INDEX idx_eval_sched_env (environment_id),
                        INDEX idx_eval_sched_tenant (tenant_id),
                        INDEX idx_eval_sched_next (is_enabled, next_run_at)
                    )
                """))
            print("  [DB] eval_schedules table created")
        except Exception as e:
            print(f"  [DB] eval_schedules migration failed: {e}")
    else:
        print("  [DB] eval_schedules table already exists")


def _migrate_osint_briefings_table():
    """Create osint_briefings table for OSINT intelligence briefings."""
    insp = inspect(engine)
    if "osint_briefings" not in insp.get_table_names():
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE osint_briefings (
                        id VARCHAR(36) PRIMARY KEY,
                        workspace_id VARCHAR(36) NOT NULL,
                        tenant_id VARCHAR(36) NOT NULL,
                        schedule_run_id VARCHAR(36) NULL,
                        title VARCHAR(500) DEFAULT '',
                        briefing_type VARCHAR(50) DEFAULT 'combined',
                        severity VARCHAR(20) DEFAULT 'info',
                        content TEXT,
                        sources_json TEXT DEFAULT '[]',
                        entities_json TEXT DEFAULT '[]',
                        alert_sent TINYINT(1) DEFAULT 0,
                        alert_channel VARCHAR(50) NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                        INDEX idx_osint_workspace (workspace_id, created_at),
                        INDEX idx_osint_severity (workspace_id, severity)
                    )
                """))
            print("  [DB] osint_briefings table created")
        except Exception as e:
            print(f"  [DB] osint_briefings migration failed: {e}")
    else:
        print("  [DB] osint_briefings table already exists")


def _migrate_eval_reliability_columns():
    """Add reliability layer columns to eval tables (v0.4.0).

    EvalRun: latency stats, schema stats, reliability score/grade
    EvalResult: per-result schema validation
    Environment: response schema + latency target config
    """
    insp = inspect(engine)
    try:
        # -- EvalRun reliability columns --
        run_cols = {c["name"] for c in insp.get_columns("eval_runs")}
        run_new = {
            "latency_p50_ms": "ALTER TABLE eval_runs ADD COLUMN latency_p50_ms INT NULL",
            "latency_p95_ms": "ALTER TABLE eval_runs ADD COLUMN latency_p95_ms INT NULL",
            "latency_p99_ms": "ALTER TABLE eval_runs ADD COLUMN latency_p99_ms INT NULL",
            "latency_max_ms": "ALTER TABLE eval_runs ADD COLUMN latency_max_ms INT NULL",
            "latency_mean_ms": "ALTER TABLE eval_runs ADD COLUMN latency_mean_ms INT NULL",
            "schema_pass": "ALTER TABLE eval_runs ADD COLUMN schema_pass INT NULL",
            "schema_fail": "ALTER TABLE eval_runs ADD COLUMN schema_fail INT NULL",
            "reliability_score": "ALTER TABLE eval_runs ADD COLUMN reliability_score FLOAT NULL",
            "reliability_grade": "ALTER TABLE eval_runs ADD COLUMN reliability_grade VARCHAR(2) NULL",
        }
        added = []
        for col_name, sql in run_new.items():
            if col_name not in run_cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
        if added:
            print(f"  [DB] EvalRun reliability columns added: {', '.join(added)}")

        # -- EvalResult schema columns --
        result_cols = {c["name"] for c in insp.get_columns("eval_results")}
        result_new = {
            "schema_valid": "ALTER TABLE eval_results ADD COLUMN schema_valid TINYINT(1) NULL",
            "schema_errors": "ALTER TABLE eval_results ADD COLUMN schema_errors TEXT NULL",
        }
        added2 = []
        for col_name, sql in result_new.items():
            if col_name not in result_cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added2.append(col_name)
        if added2:
            print(f"  [DB] EvalResult reliability columns added: {', '.join(added2)}")

        # -- Environment reliability config --
        env_cols = {c["name"] for c in insp.get_columns("environments")}
        env_new = {
            "response_schema": "ALTER TABLE environments ADD COLUMN response_schema TEXT NULL",
            "latency_target_ms": "ALTER TABLE environments ADD COLUMN latency_target_ms INT NULL",
        }
        added3 = []
        for col_name, sql in env_new.items():
            if col_name not in env_cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added3.append(col_name)
        if added3:
            print(f"  [DB] Environment reliability config added: {', '.join(added3)}")

        if not added and not added2 and not added3:
            print("  [DB] Eval reliability columns already present")

    except Exception as e:
        print(f"  [DB] Eval reliability migration skipped: {e}")


def _migrate_judge_model_columns():
    """Add multi-model judge config columns to environments table."""
    insp = inspect(engine)
    try:
        env_cols = {c["name"] for c in insp.get_columns("environments")}
        new_cols = {
            "judge_provider": "ALTER TABLE environments ADD COLUMN judge_provider VARCHAR(30) DEFAULT 'anthropic'",
            "judge_model": "ALTER TABLE environments ADD COLUMN judge_model VARCHAR(100) NULL",
            "judge_config": "ALTER TABLE environments ADD COLUMN judge_config TEXT NULL",
        }
        added = []
        for col_name, sql in new_cols.items():
            if col_name not in env_cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
        if added:
            print(f"  [DB] Environment judge model columns added: {', '.join(added)}")
        else:
            print("  [DB] Judge model columns already present")
    except Exception as e:
        print(f"  [DB] Judge model migration skipped: {e}")


def _migrate_workspace_model_config():
    """Add per-workspace model override columns for fine-tuned model deployment."""
    try:
        insp = inspect(engine)
        ws_cols = {c["name"] for c in insp.get_columns("workspaces")}
        new_cols = {
            "inference_provider": "ALTER TABLE workspaces ADD COLUMN inference_provider VARCHAR(30) NULL",
            "inference_model": "ALTER TABLE workspaces ADD COLUMN inference_model VARCHAR(255) NULL",
            "inference_config": "ALTER TABLE workspaces ADD COLUMN inference_config TEXT NULL",
        }
        added = []
        for col_name, sql in new_cols.items():
            if col_name not in ws_cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
        if added:
            print(f"  [DB] Workspace model config columns added: {', '.join(added)}")
        else:
            print("  [DB] Workspace model config columns already present")
    except Exception as e:
        print(f"  [DB] Workspace model config migration skipped: {e}")


def _migrate_finetune_auto_deploy():
    """Add auto_deploy and workspace_id columns to finetune_jobs."""
    try:
        insp = inspect(engine)
        ft_cols = {c["name"] for c in insp.get_columns("finetune_jobs")}
        new_cols = {
            "auto_deploy": "ALTER TABLE finetune_jobs ADD COLUMN auto_deploy BOOLEAN DEFAULT FALSE",
            "workspace_id": "ALTER TABLE finetune_jobs ADD COLUMN workspace_id VARCHAR(36) NULL",
            "mined_examples_count": "ALTER TABLE finetune_jobs ADD COLUMN mined_examples_count INT DEFAULT 0",
        }
        added = []
        for col_name, sql in new_cols.items():
            if col_name not in ft_cols:
                with engine.begin() as conn:
                    conn.execute(text(sql))
                added.append(col_name)
        if added:
            print(f"  [DB] Finetune jobs columns added: {', '.join(added)}")
        else:
            print("  [DB] Finetune auto_deploy columns already present")
    except Exception as e:
        print(f"  [DB] Finetune auto_deploy migration skipped: {e}")