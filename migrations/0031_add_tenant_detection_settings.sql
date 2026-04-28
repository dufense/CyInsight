-- Tenant-level auto-enable configuration for Sigma detection rules
CREATE TABLE IF NOT EXISTS tenant_detection_settings (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auto_enable_sigma_rules BOOLEAN DEFAULT false,
  min_ai_confidence INTEGER DEFAULT 80,
  max_false_positive_rate TEXT DEFAULT 'low',
  min_backtest_matched_events INTEGER DEFAULT 1,
  min_quality_grade TEXT DEFAULT 'B',
  auto_enable_from_incidents BOOLEAN DEFAULT true,
  auto_enable_from_gaps BOOLEAN DEFAULT false,
  gap_generation_batch_size INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tds_tenant ON tenant_detection_settings(tenant_id);
