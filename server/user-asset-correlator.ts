import pg from "pg";
type Pool = pg.Pool;

interface UserAssetRow {
  id: number;
  user_name: string | null;
  email: string | null;
  linked_asset_ids: string[] | null;
}

function normaliseUsername(raw: string): string {
  return raw.replace(/^[^\\]+\\/, "").replace(/@.*$/, "").toLowerCase().trim();
}

async function addToLinkedUserIds(assetId: number, userId: string, pool: Pool): Promise<void> {
  const row = await pool.query(`SELECT linked_user_ids FROM assets WHERE id = $1 LIMIT 1`, [assetId]);
  if (!row.rows[0]) return;
  const existing: string[] = Array.isArray(row.rows[0].linked_user_ids) ? row.rows[0].linked_user_ids : [];
  if (existing.includes(userId)) return;
  const updated = [...existing, userId];
  await pool.query(
    `UPDATE assets SET linked_user_ids = $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(updated), assetId]
  );
}

export async function correlateUsersForTenant(
  tenantId: number,
  pool: Pool
): Promise<{ matched: number; checked: number }> {
  const [assetsRes, usersRes] = await Promise.all([
    pool.query(
      `SELECT id, hostname, user_name, last_logged_in_user, primary_user_id, primary_user_email
       FROM assets WHERE tenant_id = $1`,
      [tenantId]
    ),
    pool.query<UserAssetRow>(
      `SELECT id, user_name, email, linked_asset_ids FROM user_assets WHERE tenant_id = $1`,
      [tenantId]
    ),
  ]);

  const assets = assetsRes.rows;
  const users = usersRes.rows;

  const byUsername = new Map<string, UserAssetRow>();
  const byEmail = new Map<string, UserAssetRow>();
  for (const u of users) {
    if (u.user_name) byUsername.set(normaliseUsername(u.user_name), u);
    if (u.email) byEmail.set(u.email.toLowerCase().trim(), u);
  }

  let matched = 0;
  for (const asset of assets) {
    if (asset.primary_user_id) continue;

    const candidates = [asset.last_logged_in_user, asset.user_name].filter(Boolean) as string[];
    let matchedUser: UserAssetRow | undefined;

    for (const raw of candidates) {
      const norm = normaliseUsername(raw);
      matchedUser = byUsername.get(norm) || byEmail.get(raw.toLowerCase().trim());
      if (matchedUser) break;
    }

    if (!matchedUser) continue;

    await pool.query(
      `UPDATE assets SET primary_user_id = $1, primary_user_email = $2, updated_at = now()
       WHERE id = $3 AND tenant_id = $4`,
      [String(matchedUser.id), matchedUser.email || matchedUser.user_name, asset.id, tenantId]
    );

    // Maintain linked_user_ids on the asset
    await addToLinkedUserIds(asset.id, String(matchedUser.id), pool);

    const existing = matchedUser.linked_asset_ids || [];
    if (!existing.includes(String(asset.id))) {
      const updated = [...existing, String(asset.id)];
      await pool.query(
        `UPDATE user_assets SET linked_asset_ids = $1::jsonb WHERE id = $2`,
        [JSON.stringify(updated), matchedUser.id]
      );
    }

    matched++;
  }

  return { matched, checked: assets.length };
}

export async function assignUserToAsset(
  tenantId: number,
  assetId: number,
  userId: string,
  email: string | null,
  displayName: string | null,
  pool: Pool
): Promise<void> {
  // Update primary_user_id by id only — asset may be in a descendant tenant (tenantId is the MSSP root)
  await pool.query(
    `UPDATE assets SET primary_user_id = $1, primary_user_email = $2, updated_at = now()
     WHERE id = $3`,
    [userId, email || displayName, assetId]
  );
  // Maintain linked_user_ids on the asset
  await addToLinkedUserIds(assetId, userId, pool);
}

export async function unassignUserFromAsset(
  tenantId: number,
  assetId: number,
  pool: Pool
): Promise<void> {
  // Fetch the current primary user before unassigning so we can remove from linked_user_ids
  const row = await pool.query(`SELECT primary_user_id, linked_user_ids FROM assets WHERE id = $1 LIMIT 1`, [assetId]);
  const asset = row.rows[0];
  if (!asset) return;

  if (asset.primary_user_id && Array.isArray(asset.linked_user_ids)) {
    const updated = asset.linked_user_ids.filter((uid: string) => uid !== String(asset.primary_user_id));
    await pool.query(
      `UPDATE assets SET primary_user_id = NULL, primary_user_email = NULL, linked_user_ids = $1::jsonb, updated_at = now()
       WHERE id = $2`,
      [JSON.stringify(updated), assetId]
    );
  } else {
    await pool.query(
      `UPDATE assets SET primary_user_id = NULL, primary_user_email = NULL, updated_at = now()
       WHERE id = $1`,
      [assetId]
    );
  }
}

export async function correlateUserForAsset(
  tenantId: number,
  assetId: number,
  pool: Pool
): Promise<{ matched: boolean; email: string | null; userId: string | null }> {
  // Fetch asset by id only — it may be in a descendant tenant
  const assetRes = await pool.query(
    `SELECT id, hostname, user_name, last_logged_in_user, primary_user_id, primary_user_email, tenant_id
     FROM assets WHERE id = $1`,
    [assetId]
  );
  if (assetRes.rows.length === 0) return { matched: false, email: null, userId: null };
  const asset = assetRes.rows[0];
  if (asset.primary_user_id) return { matched: false, email: asset.primary_user_email, userId: asset.primary_user_id };

  // Look up user_assets for the asset's actual tenant (may differ from MSSP root tenantId)
  const effectiveTenantId = asset.tenant_id || tenantId;
  const usersRes = await pool.query<UserAssetRow>(
    `SELECT id, user_name, email, linked_asset_ids FROM user_assets WHERE tenant_id = $1`,
    [effectiveTenantId]
  );
  const users = usersRes.rows;

  const byUsername = new Map<string, UserAssetRow>();
  const byEmail = new Map<string, UserAssetRow>();
  for (const u of users) {
    if (u.user_name) byUsername.set(normaliseUsername(u.user_name), u);
    if (u.email) byEmail.set(u.email.toLowerCase().trim(), u);
  }

  const candidates = [asset.last_logged_in_user, asset.user_name].filter(Boolean) as string[];
  let matchedUser: UserAssetRow | undefined;
  for (const raw of candidates) {
    const norm = normaliseUsername(raw);
    matchedUser = byUsername.get(norm) || byEmail.get(raw.toLowerCase().trim());
    if (matchedUser) break;
  }

  if (!matchedUser) return { matched: false, email: null, userId: null };

  await pool.query(
    `UPDATE assets SET primary_user_id = $1, primary_user_email = $2, updated_at = now()
     WHERE id = $3`,
    [String(matchedUser.id), matchedUser.email || matchedUser.user_name, assetId]
  );

  // Maintain linked_user_ids on the asset
  await addToLinkedUserIds(assetId, String(matchedUser.id), pool);

  const existing = matchedUser.linked_asset_ids || [];
  if (!existing.includes(String(assetId))) {
    const updated = [...existing, String(assetId)];
    await pool.query(
      `UPDATE user_assets SET linked_asset_ids = $1::jsonb WHERE id = $2`,
      [JSON.stringify(updated), matchedUser.id]
    );
  }

  return { matched: true, email: matchedUser.email || matchedUser.user_name || null, userId: String(matchedUser.id) };
}
