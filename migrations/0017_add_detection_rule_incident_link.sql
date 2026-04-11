-- Migration 0017: Add incident linkage to AI detection rules

ALTER TABLE ai_detection_rules
  ADD COLUMN IF NOT EXISTS generated_from_incident_id integer;

CREATE INDEX IF NOT EXISTS idx_ai_detection_rules_incident
  ON ai_detection_rules (tenant_id, generated_from_incident_id)
  WHERE generated_from_incident_id IS NOT NULL;
