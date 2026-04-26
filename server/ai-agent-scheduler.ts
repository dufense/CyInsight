import { pool } from "./db";
import { processTicket, conductThreatHunt, investigateIncident, generateProactiveInsight, provisionAIAgents, generateDailySummary, respondToIncident, notifyClient, resolveTicket } from "./ai-agent-engine";

let schedulerRunning = false;
let ticketsRunning = false;
let huntsRunning = false;
let investigationsRunning = false;
let insightsRunning = false;
let dailySummariesRunning = false;
let responsesRunning = false;
let notificationsRunning = false;
let resolutionsRunning = false;
const _intervalHandles: NodeJS.Timeout[] = [];

export function clearSchedulerIntervals(): void {
  for (const handle of _intervalHandles) {
    clearInterval(handle);
  }
  _intervalHandles.length = 0;
  schedulerRunning = false;
}

async function schedulerQuery(sql: string, params?: any[]): Promise<any> {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 5000");
    const result = await client.query(sql, params);
    return result;
  } finally {
    try { await client.query("SET statement_timeout = 0"); } catch {}
    client.release();
  }
}

function scheduleInterval(fn: () => Promise<void>, interval: number, firstDelay: number): void {
  const timeout = setTimeout(() => {
    fn().catch(() => {});
    const intv = setInterval(() => fn().catch(() => {}), interval);
    _intervalHandles.push(intv);
  }, firstDelay);
  _intervalHandles.push(timeout);
}

export function startAIAgentScheduler(): void {
  if (schedulerRunning) return;
  schedulerRunning = true;
  console.log("[AIWorkforce] Starting AI Agent autonomous scheduler");

  setTimeout(autoProvisionAllTenants, 60_000);

  scheduleInterval(processUnrespondedTickets, 90_000,      6 * 60_000);
  scheduleInterval(processInProgressTickets, 120_000,      7 * 60_000);
  scheduleInterval(runIncidentInvestigations, 3 * 60_000,  8 * 60_000);
  scheduleInterval(runIncidentResponses, 5 * 60_000,       9 * 60_000);
  scheduleInterval(runThreatHunts, 10 * 60_000,           10 * 60_000);
  scheduleInterval(runClientNotifications, 10 * 60_000,   11 * 60_000);
  scheduleInterval(runProactiveInsights, 20 * 60_000,     12 * 60_000);
  scheduleInterval(runDailySummaries, 60 * 60_000,        13 * 60_000);

  setTimeout(async () => {
    console.log("[AIWorkforce] Running startup sweep (delayed 4 min)...");
    try {
      await processUnrespondedTickets();
      await new Promise(r => setTimeout(r, 5_000));
      await runIncidentInvestigations();
      await new Promise(r => setTimeout(r, 5_000));
      await runIncidentResponses();
      await new Promise(r => setTimeout(r, 5_000));
      await runThreatHunts();
      await new Promise(r => setTimeout(r, 5_000));
      await runProactiveInsights();
      await new Promise(r => setTimeout(r, 5_000));
      await runClientNotifications();
    } catch (e: any) {
      console.error("[AIWorkforce] Startup sweep error:", e.message);
    }
    console.log("[AIWorkforce] Startup sweep complete");
  }, 240_000);
}

export async function triggerAction(tenantId: number, action: string): Promise<{ success: boolean; message: string; results?: any[] }> {
  const results: any[] = [];

  try {
    switch (action) {
      case "ticket": {
        console.log(`[AIWorkforce] Manual trigger: ticket processing for tenant ${tenantId}`);
        const ticketsRes = await pool.query(`
          SELECT t.id, t.tenant_id, t.assigned_to, tm.id as agent_id
          FROM tickets t
          JOIN team_members tm ON tm.name = t.assigned_to AND tm.tenant_id = t.tenant_id AND tm.is_ai = true
          WHERE t.tenant_id = $1 AND t.status = 'open'
            AND t.first_response_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM ticket_comments tc WHERE tc.ticket_id = t.id)
          ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
          LIMIT 5
        `, [tenantId]);

        for (const ticket of ticketsRes.rows) {
          const r = await processTicket(ticket.agent_id, ticket.id);
          results.push({ ticketId: ticket.id, ...r });
        }

        if (ticketsRes.rows.length === 0) {
          const agents = await pool.query(`SELECT id FROM team_members WHERE tenant_id = $1 AND is_ai = true AND ai_specialization = 'customer_support' LIMIT 1`, [tenantId]);
          if (agents.rows.length > 0) {
            const anyTicket = await pool.query(`SELECT id FROM tickets WHERE tenant_id = $1 AND status = 'open' LIMIT 1`, [tenantId]);
            if (anyTicket.rows.length > 0) {
              const r = await processTicket(agents.rows[0].id, anyTicket.rows[0].id);
              results.push({ ticketId: anyTicket.rows[0].id, ...r });
            }
          }
        }
        return { success: true, message: `Processed ${results.length} ticket(s)`, results };
      }

      case "hunt": {
        console.log(`[AIWorkforce] Manual trigger: threat hunt for tenant ${tenantId}`);
        const hunters = await pool.query(`
          SELECT id, name FROM team_members
          WHERE tenant_id = $1 AND is_ai = true AND is_active = true AND ai_specialization = 'threat_hunter'
        `, [tenantId]);

        for (const hunter of hunters.rows) {
          const r = await conductThreatHunt(hunter.id, tenantId);
          results.push({ agentId: hunter.id, agentName: hunter.name, ...r });
        }
        return { success: true, message: `Completed ${results.length} threat hunt(s)`, results };
      }

      case "respond": {
        console.log(`[AIWorkforce] Manual trigger: incident response for tenant ${tenantId}`);
        const responders = await pool.query(`
          SELECT id, name FROM team_members
          WHERE tenant_id = $1 AND is_ai = true AND is_active = true AND ai_specialization = 'incident_responder'
        `, [tenantId]);

        for (const responder of responders.rows) {
          const unresponded = await pool.query(`
            SELECT ai.incident_id FROM ai_investigations ai
            JOIN incidents i ON i.id = ai.incident_id
            WHERE i.tenant_id = $1
              AND i.status NOT IN ('closed', 'resolved')
              AND ai.verdict = 'true_positive'
              AND NOT EXISTS (
                SELECT 1 FROM ai_agent_activity_log al
                WHERE al.target_id = ai.incident_id AND al.target_type = 'incident'
                  AND al.activity_type = 'incident_response'
                  AND al.created_at > NOW() - INTERVAL '1 hour'
              )
            ORDER BY CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
            LIMIT 3
          `, [tenantId]);

          for (const row of unresponded.rows) {
            const r = await respondToIncident(responder.id, row.incident_id);
            results.push({ agentId: responder.id, agentName: responder.name, incidentId: row.incident_id, ...r });
          }
        }
        return { success: true, message: `Completed ${results.length} incident response(s)`, results };
      }

      case "notify": {
        console.log(`[AIWorkforce] Manual trigger: client notification for tenant ${tenantId}`);
        const supporters = await pool.query(`
          SELECT id, name FROM team_members
          WHERE tenant_id = $1 AND is_ai = true AND is_active = true AND ai_specialization = 'customer_support'
        `, [tenantId]);

        for (const supporter of supporters.rows) {
          const unnotified = await pool.query(`
            SELECT al.target_id as incident_id FROM ai_agent_activity_log al
            JOIN incidents i ON i.id = al.target_id
            WHERE al.tenant_id = $1
              AND al.activity_type = 'incident_response'
              AND al.target_type = 'incident'
              AND NOT EXISTS (
                SELECT 1 FROM ai_agent_activity_log al2
                WHERE al2.target_id = al.target_id AND al2.target_type = 'incident'
                  AND al2.activity_type = 'client_notification'
                  AND al2.created_at > NOW() - INTERVAL '1 hour'
              )
            ORDER BY al.created_at DESC
            LIMIT 3
          `, [tenantId]);

          for (const row of unnotified.rows) {
            const r = await notifyClient(supporter.id, row.incident_id);
            results.push({ agentId: supporter.id, agentName: supporter.name, incidentId: row.incident_id, ...r });
          }
        }
        return { success: true, message: `Sent ${results.length} client notification(s)`, results };
      }

      case "investigate": {
        console.log(`[AIWorkforce] Manual trigger: incident investigation for tenant ${tenantId}`);
        const analysts = await pool.query(`
          SELECT id, name FROM team_members
          WHERE tenant_id = $1 AND is_ai = true AND is_active = true 
            AND ai_specialization = 'soc_analyst'
        `, [tenantId]);

        for (const analyst of analysts.rows) {
          const uninvestigated = await pool.query(`
            SELECT i.id FROM incidents i
            WHERE i.tenant_id = $1
              AND i.severity IN ('critical', 'high')
              AND i.status NOT IN ('closed', 'resolved')
              AND NOT EXISTS (SELECT 1 FROM ai_investigations ai WHERE ai.incident_id = i.id)
              AND NOT EXISTS (
                SELECT 1 FROM ai_agent_activity_log al 
                WHERE al.target_id = i.id AND al.target_type = 'incident' AND al.agent_id = $2
              )
            ORDER BY CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
            LIMIT 2
          `, [tenantId, analyst.id]);

          for (const incident of uninvestigated.rows) {
            const r = await investigateIncident(analyst.id, incident.id);
            results.push({ agentId: analyst.id, agentName: analyst.name, incidentId: incident.id, ...r });
          }
        }
        return { success: true, message: `Completed ${results.length} investigation(s)`, results };
      }

      case "insight": {
        console.log(`[AIWorkforce] Manual trigger: proactive insight for tenant ${tenantId}`);
        const analysts = await pool.query(`
          SELECT id, name FROM team_members
          WHERE tenant_id = $1 AND is_ai = true AND is_active = true 
            AND ai_specialization = 'compliance_analyst'
        `, [tenantId]);

        for (const analyst of analysts.rows) {
          const r = await generateProactiveInsight(analyst.id, tenantId);
          results.push({ agentId: analyst.id, agentName: analyst.name, ...r });
        }
        return { success: true, message: `Generated ${results.length} insight(s)`, results };
      }

      default:
        return { success: false, message: `Unknown action: ${action}. Valid actions: ticket, hunt, investigate, respond, notify, insight` };
    }
  } catch (err: any) {
    console.error(`[AIWorkforce] Manual trigger error (${action}):`, err.message);
    return { success: false, message: err.message, results };
  }
}

async function autoProvisionAllTenants(): Promise<void> {
  try {
    const tenantsRes = await pool.query(`SELECT id, name FROM tenants ORDER BY id`);
    const existingRes = await pool.query(`
      SELECT DISTINCT tenant_id FROM team_members WHERE is_ai = true
    `);
    const provisionedSet = new Set(existingRes.rows.map((r: any) => r.tenant_id));

    let provisioned = 0;
    for (const tenant of tenantsRes.rows) {
      if (provisionedSet.has(tenant.id)) continue;
      console.log(`[AIWorkforce] Auto-provisioning AI agents for tenant ${tenant.id} (${tenant.name})`);
      await provisionAIAgents(tenant.id);
      provisioned++;
    }

    if (provisioned > 0) {
      console.log(`[AIWorkforce] Auto-provisioned AI agents for ${provisioned} tenant(s)`);
    } else {
      console.log("[AIWorkforce] All tenants already have AI agents provisioned");
    }
  } catch (err: any) {
    console.error("[AIWorkforce] Auto-provisioning error:", err.message);
  }
}

async function processUnrespondedTickets(): Promise<void> {
  if (ticketsRunning) return;
  ticketsRunning = true;
  try {
    console.log("[AIWorkforce][Tickets] Scanning for unresponded tickets...");
    const ticketsRes = await schedulerQuery(`
      SELECT t.id, t.tenant_id, t.assigned_to, tm.id as agent_id
      FROM tickets t
      JOIN team_members tm ON tm.name = t.assigned_to AND tm.tenant_id = t.tenant_id AND tm.is_ai = true
      WHERE t.status = 'open'
        AND t.first_response_at IS NULL
        AND t.created_at > NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM ticket_comments tc WHERE tc.ticket_id = t.id
        )
      ORDER BY 
        CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
      LIMIT 5
    `);

    console.log(`[AIWorkforce][Tickets] Found ${ticketsRes.rows.length} unresponded ticket(s)`);

    for (const ticket of ticketsRes.rows) {
      try {
        console.log(`[AIWorkforce][Tickets] Processing ticket #${ticket.id} via AI agent ${ticket.agent_id}`);
        await processTicket(ticket.agent_id, ticket.id);
        console.log(`[AIWorkforce][Tickets] Successfully processed ticket #${ticket.id}`);
      } catch (ticketErr: any) {
        console.error(`[AIWorkforce][Tickets] Failed to process ticket #${ticket.id}:`, ticketErr.message);
      }
    }
  } catch (err: any) {
    console.error("[AIWorkforce][Tickets] Ticket scan error:", err.message);
  } finally {
    ticketsRunning = false;
  }
}

async function runThreatHunts(): Promise<void> {
  if (huntsRunning) return;
  huntsRunning = true;
  try {
    console.log("[AIWorkforce][ThreatHunt] Scanning for threat hunt opportunities...");
    const hunters = await schedulerQuery(`
      SELECT tm.id, tm.tenant_id, tm.name
      FROM team_members tm
      WHERE tm.is_ai = true AND tm.is_active = true AND tm.ai_specialization = 'threat_hunter'
    `);

    console.log(`[AIWorkforce][ThreatHunt] Found ${hunters.rows.length} threat hunter agent(s)`);

    for (const hunter of hunters.rows) {
      try {
        const lastHunt = await schedulerQuery(`
          SELECT created_at FROM ai_agent_activity_log 
          WHERE agent_id = $1 AND activity_type = 'threat_hunt'
          ORDER BY created_at DESC LIMIT 1
        `, [hunter.id]);

        const lastTime = lastHunt.rows[0]?.created_at;
        const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
        if (lastTime && new Date(lastTime) > fiveMinAgo) {
          console.log(`[AIWorkforce][ThreatHunt] ${hunter.name} skipped (last hunt ${Math.round((Date.now() - new Date(lastTime).getTime()) / 1000)}s ago)`);
          continue;
        }

        console.log(`[AIWorkforce][ThreatHunt] ${hunter.name} conducting threat hunt for tenant ${hunter.tenant_id}`);
        await conductThreatHunt(hunter.id, hunter.tenant_id);
        console.log(`[AIWorkforce][ThreatHunt] ${hunter.name} completed threat hunt`);
      } catch (huntErr: any) {
        console.error(`[AIWorkforce][ThreatHunt] ${hunter.name} failed:`, huntErr.message);
      }
    }
  } catch (err: any) {
    console.error("[AIWorkforce][ThreatHunt] Scan error:", err.message);
  } finally {
    huntsRunning = false;
  }
}

async function runIncidentInvestigations(): Promise<void> {
  if (investigationsRunning) return;
  investigationsRunning = true;
  try {
    console.log("[AIWorkforce][Investigations] Scanning for uninvestigated incidents...");
    const analysts = await schedulerQuery(`
      SELECT tm.id, tm.tenant_id, tm.name
      FROM team_members tm
      WHERE tm.is_ai = true AND tm.is_active = true 
        AND tm.ai_specialization = 'soc_analyst'
    `);

    console.log(`[AIWorkforce][Investigations] Found ${analysts.rows.length} analyst agent(s)`);

    for (const analyst of analysts.rows) {
      try {
        const uninvestigated = await schedulerQuery(`
          SELECT i.id FROM incidents i
          WHERE i.tenant_id = $1
            AND i.severity IN ('critical', 'high')
            AND i.status NOT IN ('closed', 'resolved')
            AND NOT EXISTS (
              SELECT 1 FROM ai_investigations ai WHERE ai.incident_id = i.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM ai_agent_activity_log al 
              WHERE al.target_id = i.id AND al.target_type = 'incident' AND al.agent_id = $2
            )
          ORDER BY 
            CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
          LIMIT 2
        `, [analyst.tenant_id, analyst.id]);

        console.log(`[AIWorkforce][Investigations] ${analyst.name} has ${uninvestigated.rows.length} uninvestigated incident(s)`);

        for (const incident of uninvestigated.rows) {
          try {
            if (await hasRecentAgentAction(analyst.id, incident.id, 'incident', 'incident_investigation')) {
              console.log(`[AIWorkforce][Investigations] ${analyst.name} skipped incident #${incident.id} (recent action exists)`);
              continue;
            }
            console.log(`[AIWorkforce][Investigations] ${analyst.name} investigating incident #${incident.id}`);
            await investigateIncident(analyst.id, incident.id);
            console.log(`[AIWorkforce][Investigations] ${analyst.name} completed investigation of incident #${incident.id}`);
          } catch (invErr: any) {
            console.error(`[AIWorkforce][Investigations] ${analyst.name} failed on incident #${incident.id}:`, invErr.message);
          }
        }
      } catch (analystErr: any) {
        console.error(`[AIWorkforce][Investigations] Error querying for ${analyst.name}:`, analystErr.message);
      }
    }
  } catch (err: any) {
    console.error("[AIWorkforce][Investigations] Scan error:", err.message);
  } finally {
    investigationsRunning = false;
  }
}

async function runDailySummaries(): Promise<void> {
  if (dailySummariesRunning) return;
  dailySummariesRunning = true;
  try {
    console.log("[AIWorkforce][DailySummary] Checking if daily summaries are due...");
    const tenantsRes = await schedulerQuery(`
      SELECT DISTINCT tm.tenant_id FROM team_members tm
      WHERE tm.is_ai = true AND tm.is_active = true AND tm.ai_specialization = 'soc_analyst'
    `);

    for (const row of tenantsRes.rows) {
      try {
        const lastSummary = await schedulerQuery(`
          SELECT created_at FROM ai_agent_activity_log
          WHERE tenant_id = $1 AND activity_type = 'daily_summary'
          ORDER BY created_at DESC LIMIT 1
        `, [row.tenant_id]);

        const lastTime = lastSummary.rows[0]?.created_at;
        const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60_000);
        if (lastTime && new Date(lastTime) > twentyThreeHoursAgo) {
          continue;
        }

        console.log(`[AIWorkforce][DailySummary] Generating daily summary for tenant ${row.tenant_id}`);
        await generateDailySummary(row.tenant_id);
        console.log(`[AIWorkforce][DailySummary] Completed daily summary for tenant ${row.tenant_id}`);
      } catch (err: any) {
        console.error(`[AIWorkforce][DailySummary] Failed for tenant ${row.tenant_id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error("[AIWorkforce][DailySummary] Scan error:", err.message);
  } finally {
    dailySummariesRunning = false;
  }
}

async function runProactiveInsights(): Promise<void> {
  if (insightsRunning) return;
  insightsRunning = true;
  try {
    console.log("[AIWorkforce][Insights] Scanning for proactive insight opportunities...");
    const analysts = await schedulerQuery(`
      SELECT tm.id, tm.tenant_id, tm.name
      FROM team_members tm
      WHERE tm.is_ai = true AND tm.is_active = true 
        AND tm.ai_specialization = 'compliance_analyst'
    `);

    console.log(`[AIWorkforce][Insights] Found ${analysts.rows.length} insight-capable agent(s)`);

    for (const analyst of analysts.rows) {
      try {
        const lastInsight = await schedulerQuery(`
          SELECT created_at FROM ai_agent_activity_log 
          WHERE agent_id = $1 AND activity_type IN ('proactive_insight', 'compliance_insight')
          ORDER BY created_at DESC LIMIT 1
        `, [analyst.id]);

        const lastTime = lastInsight.rows[0]?.created_at;
        const fifteenMinAgo = new Date(Date.now() - 15 * 60_000);
        if (lastTime && new Date(lastTime) > fifteenMinAgo) {
          console.log(`[AIWorkforce][Insights] ${analyst.name} skipped (last insight ${Math.round((Date.now() - new Date(lastTime).getTime()) / 1000)}s ago)`);
          continue;
        }

        console.log(`[AIWorkforce][Insights] ${analyst.name} generating proactive insight for tenant ${analyst.tenant_id}`);
        await generateProactiveInsight(analyst.id, analyst.tenant_id);
        console.log(`[AIWorkforce][Insights] ${analyst.name} completed insight generation`);
      } catch (insightErr: any) {
        console.error(`[AIWorkforce][Insights] ${analyst.name} failed:`, insightErr.message);
      }
    }
  } catch (err: any) {
    console.error("[AIWorkforce][Insights] Scan error:", err.message);
  } finally {
    insightsRunning = false;
  }
}

async function hasRecentAgentAction(agentId: number, targetId: number, targetType: string, activityType: string): Promise<boolean> {
  const result = await schedulerQuery(`
    SELECT 1 FROM ai_agent_activity_log
    WHERE agent_id = $1 AND target_id = $2 AND target_type = $3 AND activity_type = $4
      AND created_at > NOW() - INTERVAL '1 hour'
    LIMIT 1
  `, [agentId, targetId, targetType, activityType]);
  return result.rows.length > 0;
}

async function runIncidentResponses(): Promise<void> {
  if (responsesRunning) return;
  responsesRunning = true;
  try {
    console.log("[AIWorkforce][IncidentResponse] Scanning for incidents needing response...");
    const responders = await schedulerQuery(`
      SELECT tm.id, tm.tenant_id, tm.name
      FROM team_members tm
      WHERE tm.is_ai = true AND tm.is_active = true AND tm.ai_specialization = 'incident_responder'
    `);

    console.log(`[AIWorkforce][IncidentResponse] Found ${responders.rows.length} responder agent(s)`);

    for (const responder of responders.rows) {
      try {
        const unresponded = await schedulerQuery(`
          SELECT ai.incident_id FROM ai_investigations ai
          JOIN incidents i ON i.id = ai.incident_id
          WHERE i.tenant_id = $1
            AND i.status NOT IN ('closed', 'resolved')
            AND ai.status = 'completed'
            AND (ai.verdict = 'true_positive' OR i.severity IN ('critical', 'high'))
            AND NOT EXISTS (
              SELECT 1 FROM ai_agent_activity_log al
              WHERE al.target_id = ai.incident_id AND al.target_type = 'incident'
                AND al.activity_type = 'incident_response'
            )
          ORDER BY CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
          LIMIT 3
        `, [responder.tenant_id]);

        console.log(`[AIWorkforce][IncidentResponse] ${responder.name} has ${unresponded.rows.length} incident(s) needing response`);

        for (const row of unresponded.rows) {
          try {
            if (await hasRecentAgentAction(responder.id, row.incident_id, 'incident', 'incident_response')) {
              console.log(`[AIWorkforce][IncidentResponse] ${responder.name} skipped incident #${row.incident_id} (recent action exists)`);
              continue;
            }
            console.log(`[AIWorkforce][IncidentResponse] ${responder.name} responding to incident #${row.incident_id}`);
            await respondToIncident(responder.id, row.incident_id);
            console.log(`[AIWorkforce][IncidentResponse] ${responder.name} completed response for incident #${row.incident_id}`);
          } catch (respErr: any) {
            console.error(`[AIWorkforce][IncidentResponse] ${responder.name} failed on incident #${row.incident_id}:`, respErr.message);
          }
        }
      } catch (agentErr: any) {
        console.error(`[AIWorkforce][IncidentResponse] Error querying for ${responder.name}:`, agentErr.message);
      }
    }
  } catch (err: any) {
    console.error("[AIWorkforce][IncidentResponse] Scan error:", err.message);
  } finally {
    responsesRunning = false;
  }
}

async function runClientNotifications(): Promise<void> {
  if (notificationsRunning) return;
  notificationsRunning = true;
  try {
    console.log("[AIWorkforce][ClientNotify] Scanning for incidents needing client notification...");
    const supporters = await schedulerQuery(`
      SELECT tm.id, tm.tenant_id, tm.name
      FROM team_members tm
      WHERE tm.is_ai = true AND tm.is_active = true AND tm.ai_specialization = 'customer_support'
    `);

    console.log(`[AIWorkforce][ClientNotify] Found ${supporters.rows.length} notification agent(s)`);

    for (const supporter of supporters.rows) {
      try {
        const unnotified = await schedulerQuery(`
          SELECT DISTINCT al.target_id as incident_id FROM ai_agent_activity_log al
          JOIN incidents i ON i.id = al.target_id
          WHERE al.tenant_id = $1
            AND al.activity_type = 'incident_response'
            AND al.target_type = 'incident'
            AND NOT EXISTS (
              SELECT 1 FROM ai_agent_activity_log al2
              WHERE al2.target_id = al.target_id AND al2.target_type = 'incident'
                AND al2.activity_type = 'client_notification'
            )
          ORDER BY al.target_id DESC
          LIMIT 3
        `, [supporter.tenant_id]);

        console.log(`[AIWorkforce][ClientNotify] ${supporter.name} has ${unnotified.rows.length} incident(s) needing notification`);

        for (const row of unnotified.rows) {
          try {
            if (await hasRecentAgentAction(supporter.id, row.incident_id, 'incident', 'client_notification')) {
              console.log(`[AIWorkforce][ClientNotify] ${supporter.name} skipped incident #${row.incident_id} (recent notification exists)`);
              continue;
            }
            console.log(`[AIWorkforce][ClientNotify] ${supporter.name} notifying client about incident #${row.incident_id}`);
            await notifyClient(supporter.id, row.incident_id);
            console.log(`[AIWorkforce][ClientNotify] ${supporter.name} completed notification for incident #${row.incident_id}`);
          } catch (notifyErr: any) {
            console.error(`[AIWorkforce][ClientNotify] ${supporter.name} failed on incident #${row.incident_id}:`, notifyErr.message);
          }
        }
      } catch (agentErr: any) {
        console.error(`[AIWorkforce][ClientNotify] Error querying for ${supporter.name}:`, agentErr.message);
      }
    }
  } catch (err: any) {
    console.error("[AIWorkforce][ClientNotify] Scan error:", err.message);
  } finally {
    notificationsRunning = false;
  }
}

async function processInProgressTickets(): Promise<void> {
  if (resolutionsRunning) return;
  resolutionsRunning = true;
  try {
    console.log("[AIWorkforce][TicketResolution] Scanning for in-progress tickets needing resolution...");
    const ticketsRes = await schedulerQuery(`
      SELECT t.id, t.tenant_id, t.assigned_to, tm.id as agent_id
      FROM tickets t
      JOIN team_members tm ON tm.name = t.assigned_to AND tm.tenant_id = t.tenant_id AND tm.is_ai = true
      WHERE t.status = 'in_progress'
        AND t.first_response_at IS NOT NULL
        AND t.created_at > NOW() - INTERVAL '7 days'
        AND (
          SELECT COUNT(*) FROM ticket_comments tc 
          WHERE tc.ticket_id = t.id
        ) <= 1
      ORDER BY 
        CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
      LIMIT 5
    `);

    console.log(`[AIWorkforce][TicketResolution] Found ${ticketsRes.rows.length} ticket(s) needing resolution`);

    for (const ticket of ticketsRes.rows) {
      try {
        console.log(`[AIWorkforce][TicketResolution] Resolving ticket #${ticket.id} via AI agent ${ticket.agent_id}`);
        await resolveTicket(ticket.agent_id, ticket.id);
        console.log(`[AIWorkforce][TicketResolution] Successfully resolved ticket #${ticket.id}`);
      } catch (ticketErr: any) {
        console.error(`[AIWorkforce][TicketResolution] Failed to resolve ticket #${ticket.id}:`, ticketErr.message);
      }
    }
  } catch (err: any) {
    console.error("[AIWorkforce][TicketResolution] Scan error:", err.message);
  } finally {
    resolutionsRunning = false;
  }
}
