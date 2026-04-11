-- UEBA 2.0: behavioral_baselines and behavior_anomalies tables (idempotent)

CREATE TABLE IF NOT EXISTS behavioral_baselines (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  dimension_key TEXT NOT NULL,
  baseline_mean DOUBLE PRECISION NOT NULL DEFAULT 0,
  baseline_std_dev DOUBLE PRECISION NOT NULL DEFAULT 1,
  peer_group_mean DOUBLE PRECISION NOT NULL DEFAULT 0,
  peer_group_std_dev DOUBLE PRECISION NOT NULL DEFAULT 1,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS behavioral_baselines_unique
  ON behavioral_baselines (tenant_id, entity_type, entity_name, dimension_key);

-- Add FK constraint if not already present (idempotent via DO block)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'behavioral_baselines'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'behavioral_baselines_tenant_id_fkey'
  ) THEN
    ALTER TABLE behavioral_baselines ADD CONSTRAINT behavioral_baselines_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS behavior_anomalies (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_name VARCHAR(255) NOT NULL,
  anomaly_type VARCHAR(100) NOT NULL,
  dimensions JSONB,
  confidence_score INTEGER NOT NULL DEFAULT 0,
  marked_expected BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_to_incident BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_incident_id INTEGER,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS behavior_anomalies_tenant_entity
  ON behavior_anomalies (tenant_id, entity_type, entity_name);
CREATE INDEX IF NOT EXISTS behavior_anomalies_occurred
  ON behavior_anomalies (occurred_at DESC);
