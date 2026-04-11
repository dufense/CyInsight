-- Synapse Serverless SQL: Create security_events Delta Lake external table
-- Run AFTER 01-synapse-external-tables.sql (requires ccc_adls_processed data source).
-- Table is dropped and recreated for idempotency on re-runs.

USE ccc_datalake;
GO

IF OBJECT_ID(N'dbo.security_events', N'ET') IS NOT NULL
  DROP EXTERNAL TABLE dbo.security_events;
GO

CREATE EXTERNAL TABLE dbo.security_events (
  event_id            NVARCHAR(36)    NOT NULL,
  tenant_id           INT             NOT NULL,
  source_type         NVARCHAR(64)    NULL,
  severity            NVARCHAR(16)    NULL,
  event_type          NVARCHAR(64)    NULL,
  raw_event           NVARCHAR(MAX)   NULL,
  normalized_event    NVARCHAR(MAX)   NULL,
  host                NVARCHAR(256)   NULL,
  src_ip              NVARCHAR(45)    NULL,
  dst_ip              NVARCHAR(45)    NULL,
  user_name           NVARCHAR(256)   NULL,
  process_name        NVARCHAR(512)   NULL,
  mitre_tactic        NVARCHAR(128)   NULL,
  mitre_technique_id  NVARCHAR(32)    NULL,
  kill_chain_phase    NVARCHAR(64)    NULL,
  confidence_score    INT             NULL,
  data_region         NVARCHAR(32)    NULL,
  ingested_at         DATETIME2       NULL,
  event_date          DATE            NOT NULL
)
WITH (
  DATA_SOURCE       = ccc_adls_processed,
  LOCATION          = 'security_events/**',
  FILE_FORMAT       = ccc_parquet_format
);
GO
