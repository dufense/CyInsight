CREATE TABLE IF NOT EXISTS "platform_settings" (
  "key" varchar(128) PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "updated_by" varchar(255)
);
