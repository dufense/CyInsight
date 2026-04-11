app.get("/api/threat-map/arcs", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.query.tenantId as string);
      const hours = parseInt(req.query.hours as string) || 24;
      if (!tenantId) return res.status(400).json({ message: "tenantId required" });

      // Enforce tenant-level access control
      await assertTenantAccess(req, tenantId);

      const since = new Date(Date.now() - hours * 3600000);
      const tenantIds = await getAccessibleTenantIds(req, tenantId);

      // Step 1: Fetch tenant office locations from infrastructure_locations (DB-driven)
      const officeRes = await pool.query(
        `SELECT id, name, city, country_code, latitude, longitude, hostname_keywords, private_ip_ranges
         FROM infrastructure_locations
         WHERE tenant_id = ANY($1) AND is_active = true
           AND latitude IS NOT NULL AND longitude IS NOT NULL
         ORDER BY id ASC`,
        [tenantIds]
      );
      const tenantOffices: any[] = officeRes.rows;

      // Step 2: Build Signal 1 CASE clause — hostname keyword matching (safe: keywords from our own seed)
      let kwCaseClause = "NULL::integer";
      if (tenantOffices.length > 0) {
        const kwCases: string[] = [];
        for (const office of tenantOffices) {
          const kws: string[] = (office.hostname_keywords || []).filter((kw: string) => /^[a-z0-9_\-]+$/i.test(kw));
          if (!kws.length) continue;
          const conds = kws.map((kw: string) =>
            `(LOWER(COALESCE(asset,'')) LIKE '%${kw.toLowerCase()}%' OR LOWER(COALESCE(target,'')) LIKE '%${kw.toLowerCase()}%')`
          ).join(" OR ");
          kwCases.push(`WHEN (${conds}) THEN ${office.id}`);
        }
        if (kwCases.length > 0) {
          kwCaseClause = `CASE ${kwCases.join(" ")} ELSE NULL END`;
        }
      }

      // Determine whether any offices have CIDR data (Signal 2 is only built when needed)
      const hasCIDR = tenantOffices.some(o => {
        const ranges = o.private_ip_ranges;
        return Array.isArray(ranges) ? ranges.length > 0 : (ranges && Object.keys(ranges).length > 0);
      });

      // Combined office_id: COALESCE(Signal1_keyword, Signal2_cidr_attacker, Signal2_cidr_asset, Signal2_cidr_target)
      // Signal 2 uses PostgreSQL inet operators — attacker/asset/target are validated as IPv4 first
      const ipRegex = `'^([0-9]{1,3}\\.){3}[0-9]{1,3}$'`;
      const cidrSubqAttacker = hasCIDR
        ? `(SELECT oc.id FROM infrastructure_locations oc, jsonb_array_elements_text(oc.private_ip_ranges) cidr
           WHERE oc.tenant_id = ANY($1) AND oc.is_active = true
             AND attacker ~ ${ipRegex} AND attacker::inet << cidr::inet
           LIMIT 1)`
        : "NULL::integer";
      const cidrSubqAsset = hasCIDR
        ? `(SELECT oc.id FROM infrastructure_locations oc, jsonb_array_elements_text(oc.private_ip_ranges) cidr
           WHERE oc.tenant_id = ANY($1) AND oc.is_active = true
             AND asset ~ ${ipRegex} AND asset::inet << cidr::inet
           LIMIT 1)`
        : "NULL::integer";
      const cidrSubqTarget = hasCIDR
        ? `(SELECT oc.id FROM infrastructure_locations oc, jsonb_array_elements_text(oc.private_ip_ranges) cidr
           WHERE oc.tenant_id = ANY($1) AND oc.is_active = true
             AND target ~ ${ipRegex} AND target::inet << cidr::inet
           LIMIT 1)`
        : "NULL::integer";

      const officeCaseExpr = `COALESCE(${kwCaseClause}, ${cidrSubqAttacker}, ${cidrSubqAsset}, ${cidrSubqTarget})`;

      // Step 3: Query events with dual-signal office detection (keyword + CIDR)
      const [eventsRes, totalRes, topSourcesRes, topTargetsRes, techniqueRes] = await Promise.all([
        pool.query(
          `SELECT country, severity, COUNT(*) as count, ${officeCaseExpr} as office_id,
                  MIN(CASE WHEN attacker ~ '^([0-9]{1,3}\\.){3}[0-9]{1,3}$'
                           AND NOT (attacker::inet << '10.0.0.0/8'::inet
                                    OR attacker::inet << '172.16.0.0/12'::inet
                                    OR attacker::inet << '192.168.0.0/16'::inet
                                    OR attacker::inet << '127.0.0.0/8'::inet)
                       THEN attacker END) as sample_ip
           FROM security_events
           WHERE tenant_id = ANY($1) AND occurred_at >= $2 AND country IS NOT NULL AND country != ''
           GROUP BY country, severity, ${officeCaseExpr}
           ORDER BY count DESC
           LIMIT 200`,
          [tenantIds, since]
        ),
        pool.query(
          `SELECT COUNT(*) as total FROM security_events WHERE tenant_id = ANY($1) AND occurred_at >= $2`,
          [tenantIds, since]
        ),
        pool.query(
          `SELECT country, COUNT(*) as count FROM security_events
           WHERE tenant_id = ANY($1) AND occurred_at >= $2 AND country IS NOT NULL AND country != ''
           GROUP BY country ORDER BY count DESC LIMIT 10`,
          [tenantIds, since]
        ),
        pool.query(
          `SELECT target, COUNT(*) as count FROM security_events
           WHERE tenant_id = ANY($1) AND occurred_at >= $2 AND target IS NOT NULL AND target != ''
           GROUP BY target ORDER BY count DESC LIMIT 10`,
          [tenantIds, since]
        ),
        pool.query(
          `SELECT mitre_tactic as technique, COUNT(*) as count FROM security_events
           WHERE tenant_id = ANY($1) AND occurred_at >= $2 AND mitre_tactic IS NOT NULL AND mitre_tactic != ''
           GROUP BY mitre_tactic ORDER BY count DESC LIMIT 1`,
          [tenantIds, since]
        ),
      ]);

      // Step 4: Build office lookup map and determine default/fallback office
      const officeById = new Map<number, any>(tenantOffices.map(o => [o.id, o]));
      const defaultOffice = tenantOffices[0] ?? null;

      // Step 5: Resolve attacker IPs to city-level lat/lon via ip-api.com
      const uniqueSampleIPs = [
        ...new Set(eventsRes.rows.map((r: any) => r.sample_ip).filter((ip: any) => ip && isPublicIPv4(ip)))
      ] as string[];
      const ipGeoMap = uniqueSampleIPs.length > 0 ? await geolocateIPs(uniqueSampleIPs) : new Map();

      const normalizedArcs = eventsRes.rows.map((r: any) => {
        const from = normalizeCountryToCode(r.country);
        if (!from) return null;
        const office = r.office_id ? officeById.get(r.office_id) : defaultOffice;
        const toLat  = office?.latitude   ?? null;
        const toLon  = office?.longitude  ?? null;
        const toCity = office?.city       ?? office?.name ?? null;
        const toCountry = office?.country_code ?? "US";
        // Apply IP-resolved geo position as arc source when available
        const ipGeo = r.sample_ip ? ipGeoMap.get(r.sample_ip) : undefined;
        return {
          from,
          to: toCountry,
          severity: r.severity,
          count: parseInt(r.count),
          ...(toLat !== null ? { toLat, toLon, toCity } : {}),
          ...(ipGeo ? { fromLat: ipGeo.lat, fromLon: ipGeo.lon } : {}),
        };
      }).filter(Boolean);

      res.json({
        arcs: normalizedArcs,
        totalEvents: parseInt(totalRes.rows[0]?.total ?? "0"),
        topSources: topSourcesRes.rows.map(r => ({ country: normalizeCountryToCode(r.country), count: parseInt(r.count) })).filter((s: any) => s.country),
        topTargets: topTargetsRes.rows.slice(0, 5).map(r => ({ country: r.target?.slice(0, 2)?.toUpperCase() || "US", count: parseInt(r.count) })).filter((t: any) => t.country.length === 2),
        uniqueCountries: new Set(normalizedArcs.map((a: any) => a.from)).size,
        topTechnique: techniqueRes.rows[0]?.technique || "",
        hours,
      });
    } catch (error: any) {
      const status = (error as any).status || 500;
      res.status(status).json({ message: error.message });
    }
  });

  app.get("/api/threat-map/country/:code", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.query.tenantId as string);
      const { code } = req.params;
      const tenantIds = await getAccessibleTenantIds(req, tenantId);
      const since = new Date(Date.now() - 30 * 86400000);

      const [eventsRes, incidentRes, techniqueRes, countRes] = await Promise.all([
        pool.query(
          `SELECT e.attacker as value, e.severity, e.occurred_at, e.event_type
           FROM security_events e
           WHERE e.tenant_id = ANY($1) AND e.occurred_at >= $2
             AND (UPPER(e.country) = UPPER($3) OR e.country ILIKE $3)
           ORDER BY e.occurred_at DESC LIMIT 10`,
          [tenantIds, since, code]
        ),
        pool.query(
          `SELECT i.id, i.title, i.severity, i.created_at
           FROM incidents i
           WHERE i.tenant_id = ANY($1) AND i.created_at >= $2
             AND (i.source_ip IS NOT NULL OR i.description ILIKE $3)
           ORDER BY i.severity DESC, i.created_at DESC LIMIT 5`,
          [tenantIds, since, `%${code}%`]
        ),
        pool.query(
          `SELECT mitre_tactic as technique, COUNT(*) as cnt
           FROM security_events
           WHERE tenant_id = ANY($1) AND occurred_at >= $2
             AND (UPPER(country) = UPPER($3) OR country ILIKE $3)
             AND mitre_tactic IS NOT NULL
           GROUP BY mitre_tactic ORDER BY cnt DESC LIMIT 1`,
          [tenantIds, since, code]
        ),
        pool.query(
          `SELECT COUNT(*) as total FROM security_events
           WHERE tenant_id = ANY($1) AND occurred_at >= $2
             AND (UPPER(country) = UPPER($3) OR country ILIKE $3)`,
          [tenantIds, since, code]
        ),
      ]);

      res.json({
        country: code,
        events: eventsRes.rows,
        incidents: incidentRes.rows,
        totalEvents: parseInt(countRes.rows[0]?.total ?? "0"),
        topTechnique: techniqueRes.rows[0]?.technique || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // THREAT RADAR — Attack vector distribution (10 sectors, last 30 days)
  // ─────────────────────────────────────────────────────────────────────────
  