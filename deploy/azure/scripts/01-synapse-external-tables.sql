-- Synapse Serverless SQL: Create external data source for Delta Lake tables
-- Run via: sqlcmd ... -v ADLS_ACCOUNT=<name> SQL_ADMIN_PASSWORD=<pw> -i 01-synapse-external-tables.sql
-- All statements are idempotent (IF NOT EXISTS guards).

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'ccc_datalake')
  CREATE DATABASE ccc_datalake;
GO

USE ccc_datalake;
GO

IF NOT EXISTS (SELECT 1 FROM sys.symmetric_keys WHERE name = '##MS_DatabaseMasterKey##')
  CREATE MASTER KEY ENCRYPTION BY PASSWORD = '$(SQL_ADMIN_PASSWORD)';
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_credentials WHERE name = N'ccc_adls_msi_cred')
  CREATE DATABASE SCOPED CREDENTIAL ccc_adls_msi_cred
  WITH IDENTITY = 'Managed Identity';
GO

IF NOT EXISTS (SELECT 1 FROM sys.external_data_sources WHERE name = N'ccc_adls_processed')
  CREATE EXTERNAL DATA SOURCE ccc_adls_processed
  WITH (
    LOCATION   = 'abfss://processed@$(ADLS_ACCOUNT).dfs.core.windows.net',
    CREDENTIAL = ccc_adls_msi_cred
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.external_file_formats WHERE name = N'ccc_parquet_format')
  CREATE EXTERNAL FILE FORMAT ccc_parquet_format
  WITH (
    FORMAT_TYPE = PARQUET,
    DATA_COMPRESSION = 'org.apache.hadoop.io.compress.SnappyCodec'
  );
GO
