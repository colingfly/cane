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
