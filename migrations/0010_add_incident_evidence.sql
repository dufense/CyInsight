CREATE TABLE IF NOT EXISTS "incident_evidence" (
  "id" serial PRIMARY KEY NOT NULL,
  "incident_id" integer NOT NULL REFERENCES incidents(id),
  "tenant_id" integer NOT NULL REFERENCES tenants(id),
  "type" varchar(50) NOT NULL DEFAULT 'note',
  "value" text NOT NULL,
  "description" text,
  "added_by" varchar(255),
  "chain_of_custody_hash" varchar(64),
  "created_at" timestamp NOT NULL DEFAULT now()
);
