-- Audit log for all auto-enable decisions (auto and manual)
CREATE TABLE IF NOT EXISTS auto_enable_audit_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ai_rule_id INTEGER NOT NULL REFERENCES ai_detection_rules(id),
  sigma_rule_id TEXT,
  action TEXT NOT NULL, -- 'auto_enabled' | 'auto_rejected' | 'manual_enabled' | 'manual_disabled' | 'promotion_failed'
  reason TEXT,
  triggered_by TEXT, -- 'incident' | 'gap' | 'manual' | 'anomaly' | 'bulk'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aeal_tenant ON auto_enable_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_aeal_rule ON auto_enable_audit_log(ai_rule_id);
CREATE INDEX IF NOT EXISTS idx_aeal_created ON auto_enable_audit_log(created_at);
