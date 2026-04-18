-- Add unique constraint on threat_intel_iocs for proper ON CONFLICT handling
-- Prevents duplicate IOC entries per tenant from TAXII/OpenCTI cross-population
-- Idempotent: skip if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'threat_intel_iocs_tenant_type_value_source_unique'
  ) THEN
    ALTER TABLE "threat_intel_iocs"
      ADD CONSTRAINT "threat_intel_iocs_tenant_type_value_source_unique"
      UNIQUE ("tenant_id", "indicator_type", "indicator_value", "source");
  END IF;
END
$$;
