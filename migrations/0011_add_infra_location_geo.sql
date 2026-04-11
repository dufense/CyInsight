ALTER TABLE infrastructure_locations
  ADD COLUMN IF NOT EXISTS city varchar(150),
  ADD COLUMN IF NOT EXISTS country_code varchar(5),
  ADD COLUMN IF NOT EXISTS latitude real,
  ADD COLUMN IF NOT EXISTS longitude real,
  ADD COLUMN IF NOT EXISTS hostname_keywords text[] DEFAULT '{}';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'infra_locations_tenant_name_unique'
      AND conrelid = 'infrastructure_locations'::regclass
  ) THEN
    ALTER TABLE infrastructure_locations
      ADD CONSTRAINT infra_locations_tenant_name_unique UNIQUE (tenant_id, name);
  END IF;
END $$;
