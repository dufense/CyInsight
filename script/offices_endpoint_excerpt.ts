app.get("/api/threat-map/offices", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.query.tenantId as string);
      if (!tenantId) return res.status(400).json({ message: "tenantId required" });

      // Enforce tenant access — prevents cross-tenant IDOR exposure
      await assertTenantAccess(req, tenantId);

      const tenantIds = await getAccessibleTenantIds(req, tenantId);

      // Read all geo-enabled office locations for this tenant from infrastructure_locations (DB-driven)
      const locRes = await pool.query(
        `SELECT id, name, city, country_code, latitude, longitude, hostname_keywords, metadata
         FROM infrastructure_locations
         WHERE tenant_id = ANY($1) AND is_active = true
           AND latitude IS NOT NULL AND longitude IS NOT NULL
         ORDER BY id ASC`,
        [tenantIds]
      );

      const offices = locRes.rows.map((r: any) => ({
        id:               r.id,
        name:             r.name,
        city:             r.city || r.metadata?.city || r.name,
        countryCode:      r.country_code || r.metadata?.countryCode || "US",
        lat:              r.latitude,
        lon:              r.longitude,
        hostnameKeywords: r.hostname_keywords || r.metadata?.hostnameKeywords || [],
        code:             (r.name || "HQ").replace(/^PKF\s+/i, "").substring(0, 4).toUpperCase(),
      }));

      return res.json(offices);
    } catch (error: any) {
      const status = (error as any).status || 500;
      res.status(status).json({ message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INCIDENT INVESTIGATION CANVAS
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/api/incidents/:id/graph", isAuthenticated, async (req: any, res) => {
    try {
      const incidentId = parseInt(req.params.id);

      const incidentRes = await pool.query(
        `SELECT * FROM incidents WHERE id = $1 LIMIT 1`,
        [incidentId]
      );
      if (!incidentRes.rows.length) return res.status(404).json({ message: "Incident not found" });
      const incident = incidentRes.rows[0];

      const access = await assertTenantAccess(req, incident.tenant_id);

      const eventsRes = await pool.query(
        `SELECT id, event_type, severity, threat, target, attacker, asset, description, 
                threat_vector, mitre_tactic, mitre_technique, action, source_type, occurred_at, country
         FROM security_events
         WHERE tenant_id = $1
         AND occurred_at BETWEEN $2 AND $3
         ORDER BY occurred_at ASC LIMIT 100`,
        [
          incident.tenant_id,
          new Date(new Date(incident.created_at).getTime() - 2 * 3600000),
          new Date(new Date(incident.created_at).getTime() + 24 * 3600000),
        ]
      );

      const nodes: any[] = [];
      const edges: any[] = [];
      const nodeSet = new Set<string>();

      function addNode(id: string, label: string, type: string, severity?: string) {
        if (!nodeSet.has(id)) {
          nodeSet.add(id);
          nodes.push({ id, label, type, severity: severity || "medium" });
        }
      }

      for (const e of eventsRes.rows) {
        if (e.attacker && e.attacker.length < 100) addNode(`ip:${e.attacker}`, e.attacker, "attacker", "high");
        if (e.target && e.target.length < 100) addNode(`asset:${e.target}`, e.target, "asset", e.severity);
        if (e.asset && e.asset.length < 100) addNode(`asset:${e.asset}`, e.asset, "asset", e.severity);
        if (e.attacker && e.target) {
          edges.push({ from: `ip:${e.attacker}`, to: `asset:${e.target}`, label: e.mitre_tactic || e.action || "attacked", eventId: e.id });
        }
        if (e.attacker && e.asset) {
          edges.push({ from: `ip:${e.attacker}`, to: `asset:${e.asset}`, label: e.action || "targeted", eventId: e.id });
        }
      }

      if (incident.source_ip) addNode(`ip:${incident.source_ip}`, incident.source_ip, "attacker", "critical");
      if (incident.destination_ip) addNode(`asset:${incident.destination_ip}`, incident.destination_ip, "asset", "high");

      const iocs = (incident.ioc_data as any[]) ?? [];
      for (const ioc of iocs.slice(0, 10)) {
        addNode(`ioc:${ioc.value}`, ioc.value, "ioc", ioc.reputation === "malicious" ? "high" : "medium");
        if (incident.source_ip) edges.push({ from: `ip:${incident.source_ip}`, to: `ioc:${ioc.value}`, label: "used IOC" });
      }

      res.json({
        incident,
        nodes,
        edges: edges.slice(0, 100),
        timeline: eventsRes.rows,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AI TRIAGE ENGINE
  // ─────────────────────────────────────────────────────────────────────────
  app.post("/api/incidents/:id/retriage", isAuthenticated, async (req: any, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const incRes = await pool.query(`SELECT tenant_id FROM incidents WHERE id = $1`, [incidentId]);
      if (!incRes.rows.length) return res.status(404).json({ message: "Not found" });
      await assertTenantAccess(req, incRes.rows[0].tenant_id);

      await pool.query(`UPDATE incidents SET triage_scored_at = NULL WHERE id = $1`, [incidentId]);
      scoreIncidentInBackground(incidentId);
      res.json({ message: "Triage re-scoring started" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/incidents/bulk-triage", isAuthenticated, async (req: any, res) => {
    try {
      const { tenantId, applyFPBelow } = req.body;
      const _access = await getUserTenantAccess(req);
      assertMSSRole(_access);
      if (!tenantId) return res.status(400).json({ message: "tenantId required" });
      const threshold = Math.min(parseInt(applyFPBelow) || 30, 35);
      const result = await pool.query(
        `UPDATE incidents SET classification = 'false_positive', is_true_positive = false, updated_at = NOW()
         WHERE tenant_id = $1 AND triage_score IS NOT NULL AND triage_score < $2
         AND classification IS NULL
         RETURNING id`,
        [tenantId, threshold]
      );
      res.json({ updated: result.rowCount, message: `${result.rowCount} incidents auto-classified as False Positive` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/incidents/clusters", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.query.tenantId as string);
      if (!tenantId) return res.status(400).json({ message: "tenantId required" });
      await assertTenantAccess(req, tenantId);
      const clusters = await computeClusters(tenantId);
      res.json(clusters);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });


  // ─────────────────────────────────────────────────────────────────────────
  // ZERO TRUST POSTURE
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/api/zero-trust/posture", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.query.tenantId as string);
      if (!tenantId || isNaN(tenantId)) return res.status(400).json({ message: "tenantId required" });
      await assertTenantAccess(req, tenantId);

      const cacheKey = `zero-trust:${tenantId}`;
      const cached = getCached(cacheKey);
      if (cached) return res.json(cached);

      const [identityData, deviceData, networkData, anomalyData, userIncidentData, atRiskDevicesData, networkSegmentsData] = await Promise.all([
        // 1. Identity aggregates
        pool.query(`SELECT
          COUNT(*) FILTER (WHERE incident_type IN ('brute_force','unauthorized_access','credential_abuse') AND created_at >= NOW() - INTERVAL '30d')::int as identity_incidents,
          COUNT(*) FILTER (WHERE incident_type = 'brute_force' AND created_at >= NOW() - INTERVAL '30d')::int as failed_login_incidents,
          COUNT(*) FILTER (WHERE severity = 'critical' AND created_at >= NOW() - INTERVAL '30d')::int as critical_incidents,
          COUNT(*)::int as total_incidents,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7d')::int as this_week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14d' AND created_at < NOW() - INTERVAL '7d')::int as last_week
          FROM incidents WHERE tenant_id = $1`, [tenantId]),
        // 2. Device aggregates
        pool.query(`SELECT
          COUNT(*)::int as total_assets,
          COUNT(*) FILTER (WHERE risk_level IN ('critical','high'))::int as high_risk_assets,
          COUNT(*) FILTER (WHERE operating_system ILIKE '%windows xp%' OR operating_system ILIKE '%windows 7%' OR operating_system ILIKE '%server 2003%' OR operating_system ILIKE '%server 2008%')::int as eol_devices,
          COUNT(*) FILTER (WHERE risk_level = 'critical')::int as compromised_devices,
          COUNT(*) FILTER (WHERE risk_level = 'low' OR risk_level IS NULL)::int as trusted_devices
          FROM assets WHERE tenant_id = $1`, [tenantId]),
        // 3. Network aggregates
        pool.query(`SELECT
          COUNT(*) FILTER (WHERE incident_type = 'lateral_movement' AND created_at >= NOW() - INTERVAL '30d')::int as lateral_movement,
          COUNT(*) FILTER (WHERE kill_chain_phase = 'command_and_control' AND created_at >= NOW() - INTERVAL '30d')::int as c2_detected,
          COUNT(*) FILTER (WHERE incident_type IN ('port_scan','network_scanning','network_intrusion') AND created_at >= NOW() - INTERVAL '30d')::int as network_threats,
          COUNT(*)::int as total
          FROM incidents WHERE tenant_id = $1`, [tenantId]),
        // 4. Anomaly timeline
        pool.query(`SELECT
          DATE_TRUNC('day', occurred_at) as day,
          COUNT(*) FILTER (WHERE event_type = 'identity')::int as identity_events,
          COUNT(*) FILTER (WHERE event_type = 'endpoint')::int as device_events,
          COUNT(*) FILTER (WHERE event_type = 'network')::int as network_events
          FROM security_events
          WHERE tenant_id = $1 AND occurred_at >= NOW() - INTERVAL '30d'
          GROUP BY DATE_TRUNC('day', occurred_at) ORDER BY day ASC`, [tenantId]),
        // 5. Risky users with failed logins + privilege flag via tenant_users
        pool.query(`SELECT
          COALESCE(i.assigned_to, e.target, e.attacker) as user_identifier,
          COUNT(DISTINCT i.id) FILTER (WHERE i.incident_type IN ('brute_force','unauthorized_access'))::int as risky_incidents,
          COUNT(DISTINCT i.id) FILTER (WHERE i.incident_type = 'brute_force')::int as failed_logins,
          COUNT(DISTINCT e.id) FILTER (WHERE e.event_type = 'identity')::int as anomaly_events,
          MAX(i.severity) as max_severity,
          MAX(i.created_at) as last_incident_at,
          MAX(CASE WHEN tu.role IN ('platform_admin','mss_admin','soc_manager','security_engineer','security_analyst','mss_analyst') THEN 1 ELSE 0 END) as is_privileged
          FROM incidents i
          LEFT JOIN security_events e ON e.tenant_id = i.tenant_id AND (e.target = i.assigned_to OR e.attacker = i.assigned_to) AND e.event_type = 'identity'
          LEFT JOIN users u ON (u.username = i.assigned_to OR u.email = i.assigned_to)
          LEFT JOIN tenant_users tu ON tu.user_id = u.id AND tu.tenant_id = i.tenant_id
          WHERE i.tenant_id = $1 AND (i.incident_type IN ('brute_force','unauthorized_access','credential_abuse') OR e.event_type = 'identity')
          GROUP BY COALESCE(i.assigned_to, e.target, e.attacker)
          HAVING COALESCE(i.assigned_to, e.target, e.attacker) IS NOT NULL
          ORDER BY risky_incidents DESC, anomaly_events DESC LIMIT 10`, [tenantId]),
        // 6. At-risk devices with EDR status and trust score
        pool.query(`SELECT
          hostname, ip_address, operating_system, last_seen, vulnerability_count, risk_level,
          COALESCE(risk_score, 50) as risk_score,
          100 - COALESCE(risk_score, 50) as trust_score,
          CASE
            WHEN device_health IS NOT NULL THEN device_health
            WHEN source IN ('cynet','crowdstrike','palo_alto_cortex','sentinel_one','defender_atp','edr') THEN 'Active'
            WHEN agent_version IS NOT NULL THEN 'Active'
            ELSE 'Unknown'
          END as edr_status
          FROM assets
          WHERE tenant_id = $1 AND risk_level IN ('critical','high')
          ORDER BY CASE risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
                   COALESCE(vulnerability_count, 0) DESC LIMIT 10`, [tenantId]),
        // 7. Top risky network segments from source_ip field
        pool.query(`SELECT segment, incident_count, max_severity, last_seen FROM (
          SELECT
            split_part(source_ip, '.', 1) || '.' ||
            split_part(source_ip, '.', 2) || '.' ||
            split_part(source_ip, '.', 3) || '.0/24' as segment,
            COUNT(*)::int as incident_count,
            MAX(severity) as max_severity,
            MAX(created_at) as last_seen
          FROM incidents
          WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30d'
            AND source_ip IS NOT NULL AND source_ip != ''
            AND source_ip NOT ILIKE 'email:%' AND source_ip NOT ILIKE '%@%'
            AND source_ip ~ '^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+'
          GROUP BY segment
        ) sub
        WHERE segment != '0.0.0.0/24' AND incident_count > 0
        ORDER BY incident_count DESC LIMIT 8`, [tenantId]),
      ]);

      const id = identityData.rows[0];
      const dev = deviceData.rows[0];
      const net = networkData.rows[0];

      const totalIncidents = Math.max(id.total_incidents || 1, 1);
      const totalAssets = Math.max(dev.total_assets || 1, 1);

      const identityScore = Math.max(0, Math.min(100, Math.round(
        100 - (id.identity_incidents / totalIncidents * 35) - (id.critical_incidents / totalIncidents * 25)
      )));
      const deviceScore = Math.max(0, Math.min(100, Math.round(
        100 - (dev.eol_devices / totalAssets * 30) - (dev.high_risk_assets / totalAssets * 25) - (dev.compromised_devices / totalAssets * 20)
      )));
      const networkScore = Math.max(0, Math.min(100, Math.round(
        100 - (net.lateral_movement / totalIncidents * 30) - (net.c2_detected / totalIncidents * 25) - (net.network_threats / totalIncidents * 20)
      )));
      const overallScore = Math.round((identityScore + deviceScore + networkScore) / 3);

      // Trend: positive = improving (fewer incidents this week vs last week)
      const weeklyIncidentDiff = (id.this_week || 0) - (id.last_week || 0);
      const scoreTrend = weeklyIncidentDiff < 0 ? Math.min(10, Math.abs(weeklyIncidentDiff)) : weeklyIncidentDiff > 0 ? -Math.min(10, weeklyIncidentDiff) : 0;

      const atRisk = Math.max(0, dev.high_risk_assets - (dev.compromised_devices || 0));
      const unmanaged = Math.max(0, totalAssets - dev.trusted_devices - atRisk - (dev.compromised_devices || 0));
      const deviceTrustBreakdown = {
        trusted: dev.trusted_devices || 0,
        atRisk,
        unmanaged,
        compromised: dev.compromised_devices || 0,
      };

      // External exposure: public IPs + critical open port detection (port_scan incidents as proxy)
      const [externalExposureRes, openPortsRes] = await Promise.all([
        pool.query(`
          SELECT COUNT(*)::int as public_assets FROM assets
          WHERE tenant_id = $1 AND ip_address IS NOT NULL AND ip_address != ''
            AND ip_address NOT ILIKE '10.%'
            AND ip_address NOT ILIKE '172.16.%' AND ip_address NOT ILIKE '172.17.%'
            AND ip_address NOT ILIKE '172.18.%' AND ip_address NOT ILIKE '172.19.%'
            AND ip_address NOT ILIKE '172.2%.%' AND ip_address NOT ILIKE '172.30.%' AND ip_address NOT ILIKE '172.31.%'
            AND ip_address NOT ILIKE '192.168.%'
            AND ip_address NOT ILIKE '127.%'`, [tenantId]),
        pool.query(`
          SELECT COUNT(DISTINCT source_ip)::int as open_port_sources FROM incidents
          WHERE tenant_id = $1
            AND incident_type IN ('port_scan','network_scanning')
            AND created_at >= NOW() - INTERVAL '30d'
            AND source_ip IS NOT NULL AND source_ip != ''
            AND source_ip ~ '^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+'
            AND source_ip NOT ILIKE '10.%'
            AND source_ip NOT ILIKE '172.16.%' AND source_ip NOT ILIKE '172.31.%'
            AND source_ip NOT ILIKE '192.168.%'`, [tenantId]),
      ]);
      const publicAssets = externalExposureRes.rows[0]?.public_assets || 0;
      const openCriticalPorts = openPortsRes.rows[0]?.open_port_sources || 0;
      const externalExposureScore = Math.min(100, publicAssets * 2 + openCriticalPorts * 5);

      const result = {
        overallScore,
        identityScore,
        deviceScore,
        networkScore,
        scoreTrend,
        topRiskyUsers: userIncidentData.rows.map((u: any) => ({
          username: u.user_identifier,
          riskyIncidents: u.risky_incidents || 0,
          failedLogins: u.failed_logins || 0,
          anomalyEvents: u.anomaly_events || 0,
          maxSeverity: u.max_severity || "medium",
          lastIncidentAt: u.last_incident_at,
          isPrivileged: (u.is_privileged || 0) === 1,
          riskScore: Math.min(100, (u.risky_incidents || 0) * 10 + (u.anomaly_events || 0) * 2 + (u.failed_logins || 0) * 5),
        })),
        privilegedRiskSummary: userIncidentData.rows
          .filter((u: any) => (u.is_privileged || 0) === 1)
          .map((u: any) => ({
            username: u.user_identifier,
            riskScore: Math.min(100, (u.risky_incidents || 0) * 10 + (u.anomaly_events || 0) * 2 + (u.failed_logins || 0) * 5),
          }))
          .slice(0, 8),
        atRiskDevices: atRiskDevicesData.rows.map((d: any) => ({
          edrStatus: d.edr_status || "Unknown",
          trustScore: d.trust_score ?? 50,
          hostname: d.hostname,
          ipAddress: d.ip_address,
          operatingSystem: d.operating_system || "Unknown",
          lastSeen: d.last_seen,
          vulnerabilityCount: d.vulnerability_count || 0,
          riskLevel: d.risk_level,
          riskScore: d.risk_score || 0,
        })),
        deviceTrustBreakdown,
        networkExposure: {
          lateralMovement: net.lateral_movement || 0,
          c2Detected: net.c2_detected || 0,
          networkThreats: net.network_threats || 0,
          totalAssets: dev.total_assets || 0,
          eolDevices: dev.eol_devices || 0,
          publicExposedAssets: publicAssets,
          openCriticalPorts,
          externalExposureScore,
        },
        topRiskySegments: networkSegmentsData.rows.map((r: any) => ({
          segment: r.segment,
          incidentCount: r.incident_count || 0,
          maxSeverity: r.max_severity || "low",
          lastSeen: r.last_seen,
        })),
        anomalyTimeline: anomalyData.rows.map((r: any) => ({
          day: new Date(r.day).toLocaleDateString("en", { month: "short", day: "numeric" }),
          identity: r.identity_events || 0,
          device: r.device_events || 0,
          network: r.network_events || 0,
        })),
      };

      setCache(cacheKey, result);
      res.json(result);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PREDICTIVE THREAT INTEL
  // ─────────────────────────────────────────────────────────────────────────
  app.post("/api/threat-intel/forecast", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt((req.query.tenantId || req.body.tenantId) as string);
      if (!tenantId || isNaN(tenantId)) return res.status(400).json({ message: "tenantId required" });
      await assertTenantAccess(req, tenantId);

      const [incidentStats, topTypes, recentTrend] = await Promise.all([
        pool.query(`SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90d')::int as total_90d,
          COUNT(*) FILTER (WHERE severity = 'critical' AND created_at >= NOW() - INTERVAL '30d')::int as critical_30d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7d')::int as this_week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14d' AND created_at < NOW() - INTERVAL '7d')::int as last_week
          FROM incidents WHERE tenant_id = $1`, [tenantId]),
        pool.query(`SELECT incident_type, COUNT(*)::int as cnt FROM incidents WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '90d' AND incident_type IS NOT NULL GROUP BY incident_type ORDER BY cnt DESC LIMIT 5`, [tenantId]),
        pool.query(`SELECT DATE_TRUNC('week', created_at) as week, COUNT(*)::int as incidents FROM incidents WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '90d' GROUP BY DATE_TRUNC('week', created_at) ORDER BY week`, [tenantId]),
      ]);

      const stats = incidentStats.rows[0];
      const growthRate = stats.last_week > 0 ? ((stats.this_week - stats.last_week) / stats.last_week) : 0;
      const topTypesList = topTypes.rows.map((r: any) => r.incident_type).join(", ");

      const prompt = `You are a threat intelligence analyst. Based on the following security data for a tenant:
- Total incidents (90d): ${stats.total_90d}
- Critical incidents (30d): ${stats.critical_30d}
- This week incidents: ${stats.this_week}
- Last week incidents: ${stats.last_week}
- Weekly growth rate: ${(growthRate * 100).toFixed(1)}%
- Top incident types: ${topTypesList || "general security alerts"}

Generate a structured 30-day threat forecast. Respond ONLY with valid JSON in this exact format:
{
  "narrative": "2-3 sentence risk narrative",
  "riskLevel": "Critical|High|Medium|Low",
  "topVectors": [{"name": "Attack name", "likelihood": 0-100, "tactic": "MITRE tactic"}],
  "emergingIndicators": ["IOC type 1", "IOC type 2", "IOC type 3"],
  "recommendations": ["Action 1", "Action 2", "Action 3", "Action 4"]
}`;

      let forecast: any = null;
      let fallbackUsed = false;
      try {
        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 600,
        });
        forecast = JSON.parse(aiRes.choices[0].message.content || "{}");
      } catch {
        fallbackUsed = true;
        forecast = {
          narrative: "Based on current incident trends, the organization faces an elevated risk posture over the next 30 days. Key threat vectors include credential-based attacks and endpoint compromises. Proactive monitoring and patch management are critical.",
          riskLevel: stats.critical_30d > 10 ? "High" : stats.critical_30d > 3 ? "Medium" : "Low",
          topVectors: [
            { name: "Phishing / Credential Harvesting", likelihood: 78, tactic: "Initial Access" },
            { name: "Endpoint Malware", likelihood: 65, tactic: "Execution" },
            { name: "Lateral Movement via Stolen Credentials", likelihood: 52, tactic: "Lateral Movement" },
            { name: "Data Exfiltration", likelihood: 41, tactic: "Exfiltration" },
            { name: "Ransomware Deployment", likelihood: 33, tactic: "Impact" },
          ],
          emergingIndicators: ["Malicious IP ranges", "Phishing domains", "Known C2 hashes"],
          recommendations: [
            "Enable MFA for all privileged accounts immediately",
            "Deploy endpoint detection rules for lateral movement",
            "Review and tighten firewall egress rules",
            "Conduct phishing simulation and awareness training",
          ],
        };
      }

      res.json({ forecast, generatedAt: new Date().toISOString(), fallback_used: fallbackUsed });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  app.get("/api/threat-intel/ioc-decay", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.query.tenantId as string);
      if (!tenantId || isNaN(tenantId)) return res.status(400).json({ message: "tenantId required" });
      await assertTenantAccess(req, tenantId);

      const iocs = await pool.query(`
        SELECT id,
          indicator_value AS value,
          indicator_type AS ioc_type,
          source, confidence, reputation,
          tags, first_seen, last_seen, created_at
        FROM threat_intel_iocs
        WHERE tenant_id = $1
        ORDER BY created_at DESC LIMIT 200`, [tenantId]);

      const now = Date.now();
      const result = iocs.rows.map((ioc: any) => {
        const lastSeen = ioc.last_seen ? new Date(ioc.last_seen).getTime() : new Date(ioc.created_at).getTime();
        const daysSinceSeen = Math.floor((now - lastSeen) / (86400000));
        const decayScore = Math.max(0, Math.min(100, 100 - daysSinceSeen * 2));
        const freshness = daysSinceSeen <= 7 ? "fresh" : daysSinceSeen <= 30 ? "active" : daysSinceSeen <= 90 ? "stale" : "expired";
        return { ...ioc, daysSinceSeen, decayScore, freshness };
      });

      result.sort((a: any, b: any) => b.decayScore - a.decayScore);
      res.json({ iocs: result });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // THREAT INTEL — Purge Expired IOCs (MSS admin only)
  // ─────────────────────────────────────────────────────────────────────────
  app.delete("/api/threat-intel/ioc-decay/expired", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.query.tenantId as string);
      if (!tenantId || isNaN(tenantId)) return res.status(400).json({ message: "tenantId required" });
      const access = await assertTenantAccess(req, tenantId);
      const adminRoles = ["mss_admin", "platform_admin", "superadmin"];
      if (!adminRoles.includes(access.role)) {
        return res.status(403).json({ message: "Only MSS admins can purge expired IOCs" });
      }
      const expiredCutoff = new Date(Date.now() - 90 * 86400000);
      const result = await pool.query(
        `DELETE FROM threat_intel_iocs WHERE tenant_id = $1 AND last_seen < $2 RETURNING id`,
        [tenantId, expiredCutoff]
      );
      res.json({ purged: result.rowCount, message: `${result.rowCount} expired IOC(s) removed` });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // THREAT INTEL — Trend Projection (last 30 days actual + 14 days projected)
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/api/threat-intel/trend-projection", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.query.tenantId as string);
      if (!tenantId || isNaN(tenantId)) return res.status(400).json({ message: "tenantId required" });
      await assertTenantAccess(req, tenantId);

      const dailyRes = await pool.query(`
        SELECT
          DATE_TRUNC('day', created_at)::date as day,
          COUNT(*) FILTER (WHERE severity = 'critical')::int as critical,
          COUNT(*) FILTER (WHERE severity = 'high')::int as high,
          COUNT(*) FILTER (WHERE severity = 'medium')::int as medium,
          COUNT(*) FILTER (WHERE severity = 'low')::int as low,
          COUNT(*)::int as total
        FROM incidents
        WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30d'
        GROUP BY DATE_TRUNC('day', created_at)::date
        ORDER BY day ASC`, [tenantId]);

      const actual = dailyRes.rows.map((r: { day: Date; critical: number; high: number; medium: number; low: number; total: number }) => ({
        date: new Date(r.day).toLocaleDateString("en", { month: "short", day: "numeric" }),
        critical: r.critical,
        high: r.high,
        medium: r.medium,
        low: r.low,
        total: r.total,
        projected: null,
      }));

      // Trailing 30-day growth: compare last 15 days vs first 15 days of the window
      const half = Math.floor(actual.length / 2);
      const recentHalf = actual.slice(half);
      const priorHalf = actual.slice(0, half);
      const avgTotal = recentHalf.length ? recentHalf.reduce((s, r) => s + r.total, 0) / recentHalf.length : 0;
      const prevAvg = priorHalf.length ? priorHalf.reduce((s, r) => s + r.total, 0) / priorHalf.length : avgTotal;
      const growthRate = prevAvg > 0 ? (avgTotal - prevAvg) / prevAvg : 0;

      // Compute per-severity growth rates for accurate severity-specific projections
      const computeGrowthRate = (field: "critical" | "high" | "medium" | "low" | "total") => {
        const rHalf = actual.slice(half);
        const pHalf = actual.slice(0, half);
        const avg = rHalf.length ? rHalf.reduce((s, r) => s + r[field], 0) / rHalf.length : 0;
        const prevA = pHalf.length ? pHalf.reduce((s, r) => s + r[field], 0) / pHalf.length : avg;
        return prevA > 0 ? (avg - prevA) / prevA : 0;
      };
      const growthCritical = computeGrowthRate("critical");
      const growthHigh = computeGrowthRate("high");
      const growthMedium = computeGrowthRate("medium");
      const growthLow = computeGrowthRate("low");

      const projected: { date: string; projected: number; projCritical: number; projHigh: number; projMedium: number; projLow: number; critical: null; high: null; medium: null; low: null; total: null }[] = [];
      let prev = avgTotal;
      let prevC = recentHalf.length ? recentHalf.reduce((s, r) => s + r.critical, 0) / recentHalf.length : 0;
      let prevH = recentHalf.length ? recentHalf.reduce((s, r) => s + r.high, 0) / recentHalf.length : 0;
      let prevM = recentHalf.length ? recentHalf.reduce((s, r) => s + r.medium, 0) / recentHalf.length : 0;
      let prevL = recentHalf.length ? recentHalf.reduce((s, r) => s + r.low, 0) / recentHalf.length : 0;
      for (let d = 1; d <= 14; d++) {
        const dt = new Date();
        dt.setDate(dt.getDate() + d);
        const p = Math.max(0, Math.round(prev * (1 + growthRate)));
        const pC = Math.max(0, Math.round(prevC * (1 + growthCritical)));
        const pH = Math.max(0, Math.round(prevH * (1 + growthHigh)));
        const pM = Math.max(0, Math.round(prevM * (1 + growthMedium)));
        const pL = Math.max(0, Math.round(prevL * (1 + growthLow)));
        projected.push({
          date: dt.toLocaleDateString("en", { month: "short", day: "numeric" }),
          projected: p, projCritical: pC, projHigh: pH, projMedium: pM, projLow: pL,
          critical: null, high: null, medium: null, low: null, total: null,
        });
        prev = p; prevC = pC; prevH = pH; prevM = pM; prevL = pL;
      }

      const categoryRes = await pool.query(`
        SELECT
          COALESCE(incident_type, 'Unknown') as category,
          COUNT(*)::int as count
        FROM incidents
        WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30d'
        GROUP BY incident_type
        ORDER BY count DESC LIMIT 10`, [tenantId]);

      const incidentTypes = categoryRes.rows.map((r: { category: string; count: number }) => ({
        name: r.category.replace(/_/g, " "),
        count: r.count,
      }));

      res.json({ actual, projected, incidentTypes });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // THREAT INTEL — Attack Campaign Clustering (IOCs grouped by MITRE technique / incident type)
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/api/threat-intel/campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.query.tenantId as string);
      if (!tenantId || isNaN(tenantId)) return res.status(400).json({ message: "tenantId required" });
      await assertTenantAccess(req, tenantId);

      // IOC-centric campaign clustering: group by MITRE technique (unnested from mitre_techniques array)
      // Falls back to indicator_type for IOCs without technique mapping
      const [techniqueClusterRes, typeClusterRes] = await Promise.all([
        pool.query(`
          SELECT
            technique as cluster_key,
            COUNT(DISTINCT i.id)::int as ioc_count,
            COUNT(DISTINCT i.tenant_id)::int as affected_tenants,
            MIN(i.first_seen)::date as first_activity,
            MAX(i.last_seen)::date as last_activity,
            MAX(i.reputation::text) as max_severity,
            MAX(i.indicator_value) as top_ioc
          FROM threat_intel_iocs i,
               UNNEST(mitre_techniques) AS technique
          WHERE i.tenant_id = $1 AND i.created_at >= NOW() - INTERVAL '90d'
            AND mitre_techniques IS NOT NULL AND array_length(mitre_techniques, 1) > 0
          GROUP BY technique
          ORDER BY ioc_count DESC LIMIT 6`, [tenantId]),
        pool.query(`
          SELECT
            COALESCE(indicator_type::text, 'unknown') as cluster_key,
            COUNT(*)::int as ioc_count,
            COUNT(DISTINCT tenant_id)::int as affected_tenants,
            MIN(first_seen)::date as first_activity,
            MAX(last_seen)::date as last_activity,
            MAX(reputation::text) as max_severity,
            MAX(indicator_value) as top_ioc
          FROM threat_intel_iocs
          WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '90d'
            AND (mitre_techniques IS NULL OR array_length(mitre_techniques, 1) = 0)
          GROUP BY indicator_type
          ORDER BY ioc_count DESC LIMIT 4`, [tenantId]),
      ]);

      const incidentLookup = await pool.query(`
        SELECT
          COALESCE(mitre_tactic, incident_type, 'Unknown') as cluster_key,
          COUNT(*)::int as incident_count
        FROM incidents
        WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '90d'
        GROUP BY COALESCE(mitre_tactic, incident_type, 'Unknown')`, [tenantId]);

      const incidentMap: Record<string, number> = {};
      for (const row of incidentLookup.rows) {
        incidentMap[row.cluster_key.toLowerCase()] = row.incident_count;
      }

      const allClusters = [...techniqueClusterRes.rows, ...typeClusterRes.rows];

      const campaigns = allClusters.map((r: {
        cluster_key: string; ioc_count: number; affected_tenants: number;
        first_activity: Date; last_activity: Date; max_severity: string; top_ioc: string;
      }) => {
        const clusterLower = r.cluster_key.toLowerCase();
        // Deterministic matching: exact lookup first, then partial substring
        const relatedIncidents = incidentMap[clusterLower] ||
          Object.entries(incidentMap).find(([k]) =>
            k.includes(clusterLower) || clusterLower.includes(k)
          )?.[1] || 0;
        return {
          name: r.cluster_key,
          incidentCount: relatedIncidents,
          techniqueCount: 1,
          iocCount: r.ioc_count,
          affectedTenants: r.affected_tenants,
          affectedSystems: r.affected_tenants,
          topIoc: r.top_ioc || r.cluster_key,
          firstActivity: r.first_activity,
          lastActivity: r.last_activity,
          severity: r.max_severity || "unknown",
        };
      });

      res.json({ campaigns });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INCIDENT WAR ROOM
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/api/incidents/:id/war-room", isAuthenticated, async (req: any, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const incidentRes = await pool.query(`SELECT * FROM incidents WHERE id = $1 LIMIT 1`, [incidentId]);
      if (!incidentRes.rows.length) return res.status(404).json({ message: "Incident not found" });
      const incident = incidentRes.rows[0];
      // For superadmin sessions, skip assertTenantAccess (superadmin has global access)
      if (!req.session?.isSuperAdmin) {
        await assertTenantAccess(req, incident.tenant_id);
      }

      // Strict ±4h correlation window
      const timeStart = new Date(new Date(incident.created_at).getTime() - 4 * 3600000);
      const timeEnd = new Date(new Date(incident.created_at).getTime() + 4 * 3600000);

      // Build correlation criteria: incident source_ip → security_events.attacker, destination_ip → target, asset → asset
      const srcIp = incident.source_ip || null;
      const dstIp = incident.destination_ip || null;
      // affected_assets is stored as text array representation or a string; try to extract a single asset name
      let assetFilter: string | null = null;
      if (incident.affected_assets) {
        const raw = Array.isArray(incident.affected_assets) ? incident.affected_assets[0] : incident.affected_assets;
        if (raw && typeof raw === "string" && raw.trim()) assetFilter = raw.replace(/[{}"]/g, "").split(",")[0].trim() || null;
      }

      // Extract IOC values from incident ioc_data for IOC-based correlation
      let iocValues: string[] = [];
      try {
        const rawIoc = incident.ioc_data;
        if (rawIoc) {
          const iocArr = Array.isArray(rawIoc) ? rawIoc : (typeof rawIoc === "string" ? JSON.parse(rawIoc) : []);
          iocValues = iocArr
            .map((ioc: any) => (ioc.value || ioc.indicator_value || "").trim())
            .filter((v: string) => v.length > 3 && v.length < 200); // sanity length guard
        }
      } catch (_) {}

      // Build IOC OR clauses (limited to first 10 IOCs to prevent query explosion)
      const iocSubset = iocValues.slice(0, 10);

      const [relatedEvents, matchedPlaybooks, evidence] = await Promise.all([
        (async () => {
          // Base params: tenantId, timeStart, timeEnd, srcIp, dstIp, assetFilter
          const baseParams: any[] = [incident.tenant_id, timeStart, timeEnd, srcIp, dstIp, assetFilter ? `%${assetFilter}%` : null];
          let iocClauses = "";
          if (iocSubset.length > 0) {
            const iocPlaceholders: string[] = [];
            for (const iocVal of iocSubset) {
              const idx = baseParams.length + 1;
              baseParams.push(`%${iocVal}%`);
              iocPlaceholders.push(`(attacker ILIKE $${idx} OR target ILIKE $${idx})`);
            }
            iocClauses = "\n              OR " + iocPlaceholders.join(" OR ");
          }
          return pool.query(
            `SELECT id, event_type, severity, threat, target, attacker, asset, description, threat_vector, mitre_tactic, mitre_technique, action, source_type, occurred_at, country
              FROM security_events
              WHERE tenant_id = $1 AND occurred_at BETWEEN $2 AND $3
                AND (
                  ($4::text IS NOT NULL AND (attacker ILIKE $4 OR target ILIKE $4))
                  OR ($5::text IS NOT NULL AND (attacker ILIKE $5 OR target ILIKE $5))
                  OR ($6::text IS NOT NULL AND asset ILIKE $6)${iocClauses}
                )
              ORDER BY occurred_at ASC LIMIT 100`,
            baseParams
          );
        })(),
        pool.query(`SELECT id, name, description, trigger_conditions, steps, is_active FROM playbooks WHERE tenant_id = $1 AND is_active = true LIMIT 20`, [incident.tenant_id]),
        pool.query(`SELECT * FROM incident_evidence WHERE incident_id = $1 ORDER BY created_at ASC`, [incidentId]),
      ]);

      const incType = (incident.incident_type || "").toLowerCase();
      const mitreTech = (incident.mitre_technique_id || "").toLowerCase();
      const mitreTactic = (incident.mitre_tactic || "").toLowerCase();
      const relevantPlaybooks = matchedPlaybooks.rows.filter((p: any) => {
        if (!p.trigger_conditions) return false;
        const tc = JSON.stringify(p.trigger_conditions).toLowerCase();
        // Match only if playbook actually relates to this incident type / MITRE
        return (incType && tc.includes(incType)) ||
               (mitreTech && tc.includes(mitreTech)) ||
               (mitreTactic && tc.includes(mitreTactic));
      }).slice(0, 5);

      res.json({ incident, relatedEvents: relatedEvents.rows, playbooks: relevantPlaybooks, evidence: evidence.rows });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  app.get("/api/incidents/:id/evidence", isAuthenticated, async (req: any, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const incidentRes = await pool.query(`SELECT tenant_id FROM incidents WHERE id = $1 LIMIT 1`, [incidentId]);
      if (!incidentRes.rows.length) return res.status(404).json({ message: "Incident not found" });
      if (!req.session?.isSuperAdmin) await assertTenantAccess(req, incidentRes.rows[0].tenant_id);
      const evidence = await pool.query(`SELECT * FROM incident_evidence WHERE incident_id = $1 ORDER BY created_at ASC`, [incidentId]);
      res.json(evidence.rows);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  app.post("/api/incidents/:id/evidence", isAuthenticated, async (req: any, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const incidentRes = await pool.query(`SELECT tenant_id FROM incidents WHERE id = $1 LIMIT 1`, [incidentId]);
      if (!incidentRes.rows.length) return res.status(404).json({ message: "Incident not found" });
      const { type, value, description } = req.body;
      if (!req.session?.isSuperAdmin) await assertTenantAccess(req, incidentRes.rows[0].tenant_id);
      const addedBy = req.session?.isSuperAdmin ? (req.session.superadminId || "superadmin") : (await getUserTenantAccess(req)).userId;
      const hash = crypto.createHash("sha256").update(`${incidentId}:${type}:${value}:${Date.now()}`).digest("hex");
      const result = await pool.query(`INSERT INTO incident_evidence (incident_id, tenant_id, type, value, description, added_by, chain_of_custody_hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [incidentId, incidentRes.rows[0].tenant_id, type || "note", value, description, addedBy, hash]);
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  app.delete("/api/incidents/:id/evidence/:evidenceId", isAuthenticated, async (req: any, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const evidenceId = parseInt(req.params.evidenceId);
      const incidentRes = await pool.query(`SELECT tenant_id FROM incidents WHERE id = $1 LIMIT 1`, [incidentId]);
      if (!incidentRes.rows.length) return res.status(404).json({ message: "Incident not found" });
      if (!req.session?.isSuperAdmin) await assertTenantAccess(req, incidentRes.rows[0].tenant_id);
      await pool.query(`DELETE FROM incident_evidence WHERE id = $1 AND incident_id = $2`, [evidenceId, incidentId]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  // Quick Actions for War Room: escalate severity
  app.post("/api/incidents/:id/escalate", isAuthenticated, async (req: any, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const incidentRes = await pool.query(`SELECT tenant_id, severity FROM incidents WHERE id = $1 LIMIT 1`, [incidentId]);
      if (!incidentRes.rows.length) return res.status(404).json({ message: "Incident not found" });
      if (!req.session?.isSuperAdmin) await assertTenantAccess(req, incidentRes.rows[0].tenant_id);
      const severityLadder = ["low", "medium", "high", "critical"];
      const current = (incidentRes.rows[0].severity || "medium").toLowerCase();
      const idx = severityLadder.indexOf(current);
      const newSeverity = severityLadder[Math.min(idx + 1, severityLadder.length - 1)];
      await pool.query(`UPDATE incidents SET severity = $1, updated_at = NOW() WHERE id = $2`, [newSeverity, incidentId]);
      res.json({ success: true, severity: newSeverity });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  // Quick Actions for War Room: classify as TP or FP
  app.post("/api/incidents/:id/classify", isAuthenticated, async (req: any, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const { classification } = req.body; // "true_positive" | "false_positive" | null
      if (classification && !["true_positive", "false_positive"].includes(classification)) {
        return res.status(400).json({ message: "classification must be 'true_positive', 'false_positive', or null" });
      }
      const incidentRes = await pool.query(`SELECT tenant_id FROM incidents WHERE id = $1 LIMIT 1`, [incidentId]);
      if (!incidentRes.rows.length) return res.status(404).json({ message: "Incident not found" });
      if (!req.session?.isSuperAdmin) await assertTenantAccess(req, incidentRes.rows[0].tenant_id);
      const newStatus = classification === "false_positive" ? "resolved" : (classification === "true_positive" ? "in_progress" : undefined);
      const updateQuery = newStatus
        ? `UPDATE incidents SET classification = $1, status = $2, updated_at = NOW() WHERE id = $3`
        : `UPDATE incidents SET classification = $1, updated_at = NOW() WHERE id = $2`;
      const params = newStatus ? [classification, newStatus, incidentId] : [classification, incidentId];
      await pool.query(updateQuery, params);
      res.json({ success: true, classification });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  // War Room: export timeline as PDF (server-rendered HTML → PDF via simple structured response)
  app.get("/api/incidents/:id/timeline-pdf", isAuthenticated, async (req: any, res) => {
    try {
      const incidentId = parseInt(req.params.id);
      const incidentRes = await pool.query(`SELECT * FROM incidents WHERE id = $1 LIMIT 1`, [incidentId]);
      if (!incidentRes.rows.length) return res.status(404).json({ message: "Incident not found" });
      if (!req.session?.isSuperAdmin) await assertTenantAccess(req, incidentRes.rows[0].tenant_id);
      const incident = incidentRes.rows[0];

      const eventsRes = await pool.query(
        `SELECT id, event_type, severity, threat, target, attacker, asset, description, mitre_tactic, mitre_technique, occurred_at
         FROM security_events
         WHERE tenant_id = $1
           AND occurred_at BETWEEN $2 AND $3
         ORDER BY occurred_at ASC LIMIT 100`,
        [incident.tenant_id,
         new Date(new Date(incident.created_at).getTime() - 4 * 3600000),
         new Date(new Date(incident.created_at).getTime() + 4 * 3600000)]
      );

      const evidenceRes = await pool.query(`SELECT * FROM incident_evidence WHERE incident_id = $1 ORDER BY created_at ASC`, [incidentId]);

      // Build an HTML document suitable for print-to-PDF
      const formatDt = (d: any) => d ? new Date(d).toISOString().replace("T", " ").substring(0, 19) + " UTC" : "—";
      const escHtml = (s: any) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      const eventRows = eventsRes.rows.map((e: any) => `
        <tr>
          <td>${escHtml(formatDt(e.occurred_at))}</td>
          <td>${escHtml(e.event_type)}</td>
          <td style="color:${e.severity === "critical" ? "#dc2626" : e.severity === "high" ? "#ea580c" : e.severity === "medium" ? "#ca8a04" : "#16a34a"}">${escHtml(e.severity)}</td>
          <td>${escHtml(e.attacker || e.target || e.asset || "—")}</td>
          <td>${escHtml(e.mitre_tactic || "—")}</td>
          <td>${escHtml(e.description || "—").substring(0, 120)}</td>
        </tr>`).join("");

      const evidenceRows = evidenceRes.rows.map((ev: any) => `
        <tr>
          <td>${escHtml(formatDt(ev.created_at))}</td>
          <td>${escHtml(ev.type)}</td>
          <td>${escHtml(ev.value)}</td>
          <td>${escHtml(ev.description || "—")}</td>
          <td>${escHtml(ev.added_by)}</td>
        </tr>`).join("");

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>War Room Timeline — Incident #${incidentId}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 13px; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 10px 0; }
  .meta div { background: #f4f4f4; padding: 6px 10px; border-radius: 4px; }
  .meta strong { display: block; font-size: 10px; color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #1e293b; color: #fff; padding: 5px 8px; text-align: left; font-size: 10px; }
  td { padding: 4px 8px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .footer { margin-top: 20px; font-size: 9px; color: #888; text-align: center; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>
<h1>&#9876; War Room Timeline — Incident #${incidentId}</h1>
<p style="margin:0;color:#666;font-size:10px">Generated ${formatDt(new Date())} &nbsp;|&nbsp; CONFIDENTIAL</p>
<div class="meta">
  <div><strong>Title</strong>${escHtml(incident.title)}</div>
  <div><strong>Severity</strong>${escHtml(incident.severity)}</div>
  <div><strong>Status</strong>${escHtml(incident.status)}</div>
  <div><strong>MITRE Tactic</strong>${escHtml(incident.mitre_tactic || "—")}</div>
  <div><strong>MITRE Technique</strong>${escHtml(incident.mitre_technique_id || "—")}</div>
  <div><strong>Classification</strong>${escHtml(incident.classification || "Unclassified")}</div>
</div>

<h2>Correlated Events (±4h window)</h2>
${eventsRes.rows.length > 0
  ? `<table><thead><tr><th>Timestamp</th><th>Event Type</th><th>Severity</th><th>Actor / Asset</th><th>MITRE Tactic</th><th>Description</th></tr></thead><tbody>${eventRows}</tbody></table>`
  : `<p style="color:#888;font-style:italic">No correlated events found in the ±4h window.</p>`}

<h2>Evidence Locker (${evidenceRes.rows.length} items)</h2>
${evidenceRes.rows.length > 0
  ? `<table><thead><tr><th>Added At</th><th>Type</th><th>Value / Hash</th><th>Description</th><th>Added By</th></tr></thead><tbody>${evidenceRows}</tbody></table>`
  : `<p style="color:#888;font-style:italic">No evidence logged for this incident.</p>`}

<div class="footer">Cyber Command Center &mdash; War Room Export &mdash; ${formatDt(new Date())}</div>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="war-room-incident-${incidentId}.html"`);
      res.send(html);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  });

  /**
   * POST /api/incidents/backfill-detection-source
   * MSS-only. Backfills NULL detection_source on incidents by inferring from the source field.
   * Also accepts optional tenantId query param to scope the backfill.
   */
  app.post("/api/incidents/backfill-detection-source", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = req.body?.tenantId ? parseInt(req.body.tenantId) : null;
      if (!req.session?.isSuperAdmin) {
        if (tenantId) {
          const access = await assertTenantAccess(req, tenantId);
          assertMSSRole(access);
        } else {
          // No tenantId — require superadmin for all-tenant backfill
          return res.status(403).json({ message: "Forbidden: tenantId required for non-superadmin users" });
        }
      }

      const tenantFilter = tenantId ? `AND i.tenant_id = ${tenantId}` : "";

      // Targeted backfill: only update incidents that can be positively identified as Cynet-origin
      // via their own source field. The EXISTS-on-security_events approach is intentionally avoided
      // because it would incorrectly label ALL NULL-detection_source incidents in a tenant if that
      // tenant has any Cynet events at all — harming source-fidelity metrics for mixed-source tenants.
      const result = await pool.query(
        `UPDATE incidents i
         SET detection_source = 'Cynet 360'
         WHERE i.detection_source IS NULL ${tenantFilter}
           AND (
             LOWER(i.source) LIKE '%cynet%'
             OR i.source = 'Cynet EPS'
           )`
      );

      const updated = result.rowCount || 0;
      console.log(`[BackfillDetectionSource] Updated ${updated} incidents${tenantId ? ` for tenant ${tenantId}` : " (all tenants)"}`);
      res.json({ success: true, updated, message: `Backfilled detection_source for ${updated} incidents` });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Backfill failed" });
    }
  });

  /**
   * GET /api/cynet-debug/:tenantId
   * MSS-only, development-only debug endpoint. Returns raw Cynet API field info to diagnose
   * what field names are present in this environment's /api/full/host response.
   * Useful when software inventory is not being collected.
   * IMPORTANT: Disabled in production to prevent telemetry leakage.
   */
  app.get("/api/cynet-debug/:tenantId", isAuthenticated, async (req: any, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ message: "Not found" });
    }
    try {
      const tenantId = parseInt(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      assertMSSRole(access);

      const integrations = await storage.getSecurityIntegrations(tenantId);
      const cynetIntegration = integrations.find((i: any) => i.platformKey === "cynet" && i.status === "connected");

      if (!cynetIntegration) {
        return res.status(404).json({ message: "No active Cynet integration found for this tenant" });
      }

      const connector = getConnector(cynetIntegration) as any;
      if (!connector) {
        return res.status(500).json({ message: "Connector could not be initialized" });
      }

      // Pull hosts using existing pullHosts() — this triggers the full/host attempt
      const pullResult = await connector.pullHosts();
      const hosts = pullResult.hosts || [];
      const sampleHost = hosts[0] || null;

      const debugInfo: any = {
        message: pullResult.message,
        usedFullApi: pullResult.usedFullApi,
        totalHosts: hosts.length,
        hostsWithSoftware: hosts.filter((h: any) => Array.isArray(h.installedSoftware) && h.installedSoftware.length > 0).length,
        sampleHostMapped: sampleHost
          ? {
              hostname: sampleHost.hostname,
              hostId: sampleHost.hostId,
              isFullHost: sampleHost.isFullHost || false,
              installedSoftwareCount: Array.isArray(sampleHost.installedSoftware) ? sampleHost.installedSoftware.length : 0,
              installedSoftwareSample: Array.isArray(sampleHost.installedSoftware) ? sampleHost.installedSoftware.slice(0, 5) : [],
              hardwareFields: sampleHost.hardware || {},
              networkInterfacesCount: Array.isArray(sampleHost.networkInterfaces) ? sampleHost.networkInterfaces.length : 0,
            }
          : null,
        rawPayloadFieldNames: sampleHost?.rawPayload ? Object.keys(sampleHost.rawPayload) : [],
        rawPayloadSoftwareFields: sampleHost?.rawPayload
          ? Object.keys(sampleHost.rawPayload).filter(k =>
              k.toLowerCase().includes("software") ||
              k.toLowerCase().includes("app") ||
              k.toLowerCase().includes("program") ||
              k.toLowerCase().includes("package") ||
              k.toLowerCase().includes("install")
            )
          : [],
        rawPayloadSample: sampleHost?.rawPayload
          ? JSON.stringify(sampleHost.rawPayload).substring(0, 1500)
          : null,
      };

      // Also try software inventory pull
      if ("pullSoftwareInventory" in connector) {
        try {
          const swResult = await connector.pullSoftwareInventory();
          debugInfo.softwareInventory = {
            source: swResult.source,
            message: swResult.message,
            hostsWithSoftware: Object.keys(swResult.softwareMap || {}).length,
            sampleHostnames: Object.keys(swResult.softwareMap || {}).slice(0, 5),
          };
        } catch (e: any) {
          debugInfo.softwareInventory = { error: e.message };
        }
      }

      res.json(debugInfo);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Cynet debug failed" });
    }
  });


  return httpServer;
}