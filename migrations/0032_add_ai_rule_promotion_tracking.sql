-- Track when AI detection rules are promoted to Sigma runtime
ALTER TABLE ai_detection_rules
  ADD COLUMN IF NOT EXISTS promoted_to_sigma_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS promoted_to_sigma_rule_id TEXT,
  ADD COLUMN IF NOT EXISTS auto_enable_reason TEXT;
