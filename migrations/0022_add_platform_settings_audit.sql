CREATE TABLE IF NOT EXISTS "platform_settings_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" varchar(128) NOT NULL,
  "prev_value" jsonb,
  "new_value" jsonb NOT NULL,
  "changed_by" varchar(255),
  "changed_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "platform_settings_audit_key_changed_at_idx"
  ON "platform_settings_audit" ("key", "changed_at" DESC);
