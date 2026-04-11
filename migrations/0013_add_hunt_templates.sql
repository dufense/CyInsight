-- Hunt Templates table for NL threat hunting saved queries (idempotent)

CREATE TABLE IF NOT EXISTS hunt_templates (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  nl_query TEXT NOT NULL,
  resolved_filters JSONB DEFAULT '{}',
  search_description TEXT,
  created_by VARCHAR(255),
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hunt_templates_tenant_idx ON hunt_templates (tenant_id);
CREATE INDEX IF NOT EXISTS hunt_templates_shared_idx ON hunt_templates (tenant_id, is_shared);
