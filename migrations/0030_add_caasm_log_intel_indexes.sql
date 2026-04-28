-- Indexes for CAASM performance and Log Intelligence module queries
-- Created: 2026-04-27

-- security_events: used by Log Explorer, Detection Feed, Log Investigation, and Source Trend
CREATE INDEX IF NOT EXISTS idx_security_events_tenant_occurred
  ON security_events (tenant_id, occurred_at DESC);

-- security_events: used by event-type filtered queries (trend, investigation)
CREATE INDEX IF NOT EXISTS idx_security_events_tenant_occurred_type
  ON security_events (tenant_id, occurred_at, event_type);

-- risk_scores: used by CAASM devices endpoint (LEFT JOIN on tenant_id + entity_type + entity_identifier)
CREATE INDEX IF NOT EXISTS idx_risk_scores_tenant_entity
  ON risk_scores (tenant_id, entity_type, entity_identifier);
