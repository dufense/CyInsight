import { Pool } from 'pg';
import { encryptCredential, decryptCredential } from './credential-crypto';
import { DbConnector } from '../shared/schema';

export type ConnectorRow = Omit<DbConnector, 'credentialBlob'> & { has_credentials: boolean };

const SELECT_SAFE = `
  id, name, connector_type, host, port, database, ssl_mode, extra_params,
  scope, tenant_id, is_active, status, last_tested_at, created_at, updated_at,
  (credential_blob IS NOT NULL AND credential_blob <> '') AS has_credentials
`;

export async function listConnectors(pool: Pool): Promise<ConnectorRow[]> {
  const r = await pool.query(`SELECT ${SELECT_SAFE} FROM db_connectors ORDER BY created_at DESC`);
  return r.rows;
}

export async function getConnectorById(pool: Pool, id: number): Promise<ConnectorRow | null> {
  const r = await pool.query(`SELECT ${SELECT_SAFE} FROM db_connectors WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function getConnectorRaw(pool: Pool, id: number): Promise<DbConnector | null> {
  const r = await pool.query(`SELECT * FROM db_connectors WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export interface CreateConnectorInput {
  name: string;
  connectorType: string;
  host?: string | null;
  port?: number | null;
  database?: string | null;
  credentialBlob?: string | null;
  sslMode?: string;
  extraParams?: Record<string, unknown> | null;
  scope?: 'global' | 'tenant';
  tenantId?: number | null;
}

export async function createConnector(pool: Pool, input: CreateConnectorInput): Promise<ConnectorRow> {
  const enc = input.credentialBlob ? encryptCredential(input.credentialBlob) : null;
  const r = await pool.query(
    `INSERT INTO db_connectors (name, connector_type, host, port, database, credential_blob, ssl_mode, extra_params, scope, tenant_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${SELECT_SAFE}`,
    [
      input.name, input.connectorType, input.host ?? null, input.port ?? null,
      input.database ?? null, enc, input.sslMode ?? 'prefer',
      input.extraParams ? JSON.stringify(input.extraParams) : null,
      input.scope ?? 'global', input.tenantId ?? null,
    ]
  );
  return r.rows[0];
}

export interface PatchConnectorInput extends Partial<CreateConnectorInput> {
  isActive?: boolean | null;
}

export async function patchConnector(pool: Pool, id: number, input: PatchConnectorInput): Promise<ConnectorRow | null> {
  const enc = input.credentialBlob ? encryptCredential(input.credentialBlob) : null;
  const r = await pool.query(
    `UPDATE db_connectors SET
       name             = COALESCE($2, name),
       connector_type   = COALESCE($3::db_connector_type, connector_type),
       host             = COALESCE($4, host),
       port             = COALESCE($5::integer, port),
       database         = COALESCE($6, database),
       credential_blob  = CASE WHEN $7 IS NOT NULL AND $7 <> '' THEN $7 ELSE credential_blob END,
       ssl_mode         = COALESCE($8, ssl_mode),
       extra_params     = COALESCE($9::jsonb, extra_params),
       is_active        = COALESCE($10, is_active),
       scope            = COALESCE($11, scope),
       tenant_id        = COALESCE($12, tenant_id),
       updated_at       = NOW()
     WHERE id = $1
     RETURNING ${SELECT_SAFE}`,
    [
      id,
      input.name ?? null, input.connectorType ?? null, input.host ?? null,
      input.port ?? null, input.database ?? null, enc,
      input.sslMode ?? null,
      input.extraParams ? JSON.stringify(input.extraParams) : null,
      input.isActive ?? null, input.scope ?? null, input.tenantId ?? null,
    ]
  );
  return r.rows[0] ?? null;
}

export async function deleteConnector(pool: Pool, id: number): Promise<void> {
  await pool.query(`DELETE FROM db_connectors WHERE id = $1`, [id]);
}

export async function updateConnectorStatus(
  pool: Pool, id: number, status: 'connected' | 'unreachable' | 'unconfigured'
): Promise<void> {
  await pool.query(
    `UPDATE db_connectors SET status = $2, last_tested_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id, status]
  );
}

export async function listConnectorsForPlatformHealth(pool: Pool): Promise<Array<{
  id: number; name: string; connector_type: string; status: string | null; last_tested_at: string | null;
}>> {
  const r = await pool.query(
    `SELECT id, name, connector_type, status, last_tested_at FROM db_connectors ORDER BY connector_type, name`
  );
  return r.rows;
}

export function getDecryptedCredential(raw: DbConnector): string | null {
  if (!raw.credentialBlob) return null;
  try { return decryptCredential(raw.credentialBlob); } catch { return null; }
}
