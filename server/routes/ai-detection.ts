import type { Express } from "express";
import { createAIClient, getDefaultModel } from "../ai-provider";
import { pool, db } from "../db";
import { getCoverage, setCoverage } from "../ds-cache";
import { generateBriefingPDF } from "../pdf-generator";
import { aiDetectionRules } from "@shared/schema";
import { and, eq, desc } from "drizzle-orm";
import { generateDetectionRule, generateRuleFromAnomalies, autoGenerateRules } from "../detection-engineering-engine";
import { isAuthenticated } from "../integrations/auth";
import {

  assertTenantAccess,
  assertMSSRole
} from "./_shared";

export function registeraidetectionRoutes(app: Express) {
  app.post("/api/detection-studio/generate", isAuthenticated, async (req: any, res) => {
      try {
        const { tenantId, threatDescription, mitreTechnique } = req.body;
        if (!tenantId || !threatDescription) {
          return res.status(400).json({ message: "tenantId and threatDescription required" });
        }
        const access = await assertTenantAccess(req, parseInt(tenantId));
        assertMSSRole(access);
  
        const client = createAIClient();
        const model = getDefaultModel();
  
        const prompt = `You are an elite SOC detection engineer with 15 years of experience writing Sigma rules for enterprise SOC environments.
  
  Threat scenario described by analyst:
  "${threatDescription}"
  ${mitreTechnique ? `MITRE ATT&CK context: ${mitreTechnique}` : ""}
  
  Your task: Generate a high-quality, production-ready Sigma rule that detects this threat. The rule MUST be syntactically valid Sigma YAML.
  
  Return ONLY this JSON structure (no markdown, no explanation):
  {
    "title": "Short descriptive rule name (5-10 words)",
    "ruleYaml": "Complete valid Sigma YAML rule as a string (use \\n for newlines)",
    "mitreTechniques": ["T1059.001", "T1027"],
    "mitreTactic": "execution",
    "killChainPhase": "exploitation",
    "severity": "high",
    "confidence": 82,
    "logSources": ["Windows Security Event Log", "Sysmon"],
    "falsePositives": ["Legitimate admin tools", "Software deployment"],
    "description": "2-3 sentence description of what this rule detects and why it matters",
    "suggestedRefinements": ["Consider adding time-based filter for off-hours only", "Exclude known admin accounts by adding a filter list"]
  }
  
  For ruleYaml, write a complete Sigma rule with: title, id (UUID), status: experimental, description, author: AI Detection Studio, date, tags (attack.technique IDs), logsource (with category and product), detection (with selection fields and condition), falsepositives, level.
  Use realistic field names from Windows/Linux/network logs. Make it specific enough to be useful, not too broad.`;
  
        const completion = await client.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 1500,
          temperature: 0.2,
        });
  
        const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
  
        // Check for duplicate title in sigma_rules
        const dupCheck = await pool.query(
          `SELECT id FROM sigma_rules WHERE title ILIKE $1 LIMIT 1`,
          [parsed.title || ""]
        );
        const isDuplicate = dupCheck.rows.length > 0;
  
        res.json({
          ...parsed,
          isDuplicate,
          conversationId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.post("/api/detection-studio/refine", isAuthenticated, async (req: any, res) => {
      try {
        const { tenantId, currentRuleYaml, refinementRequest, conversationHistory } = req.body;
        if (!tenantId || !currentRuleYaml || !refinementRequest) {
          return res.status(400).json({ message: "tenantId, currentRuleYaml, and refinementRequest required" });
        }
        const refineAccess = await assertTenantAccess(req, parseInt(tenantId));
        assertMSSRole(refineAccess);
  
        const client = createAIClient();
        const model = getDefaultModel();
  
        const messages: any[] = [
          {
            role: "system",
            content: "You are an expert Sigma rule author. You are in a conversational session helping an analyst refine a Sigma detection rule. Always return valid JSON with the refined ruleYaml and an explanation of what changed.",
          },
        ];
  
        // Include conversation history for context
        if (Array.isArray(conversationHistory)) {
          for (const msg of conversationHistory.slice(-6)) {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
  
        messages.push({
          role: "user",
          content: `Here is the current Sigma rule:
  \`\`\`yaml
  ${currentRuleYaml}
  \`\`\`
  
  Analyst refinement request: "${refinementRequest}"
  
  Apply the requested change and return JSON:
  {
    "ruleYaml": "Updated complete Sigma YAML rule",
    "changesMade": "Brief description of what was changed (1-2 sentences)",
    "confidence": 85,
    "mitreTechniques": ["T1059.001"],
    "severity": "high",
    "suggestedRefinements": ["Next possible improvement 1", "Next possible improvement 2"]
  }`,
        });
  
        const completion = await client.chat.completions.create({
          model,
          messages,
          response_format: { type: "json_object" },
          max_tokens: 1500,
          temperature: 0.15,
        });
  
        const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
        res.json(parsed);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.post("/api/detection-studio/save-to-sigma", isAuthenticated, async (req: any, res) => {
      try {
        const { tenantId, ruleYaml, title, description, mitreTags, level } = req.body;
        if (!ruleYaml || !title || !tenantId) {
          return res.status(400).json({ message: "tenantId, ruleYaml, and title required" });
        }
  
        // Enforce MSS/admin role — customers cannot create Sigma rules
        const access = await assertTenantAccess(req, parseInt(tenantId));
        assertMSSRole(access);
  
        // Check duplicate
        const dupCheck = await pool.query(
          `SELECT id FROM sigma_rules WHERE title ILIKE $1 LIMIT 1`,
          [title]
        );
        if (dupCheck.rows.length > 0) {
          return res.status(409).json({ message: "A Sigma rule with this title already exists in the library", existingId: dupCheck.rows[0].id });
        }
  
        // [FIXED] Write to filesystem so the matching engine can load it
        const { promoteAiRuleToSigma } = await import("../detection-engineering-engine");
        const parsedYaml = yaml.load(ruleYaml) as any;
        const ruleId = parsedYaml?.id || `studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const yamlWithId = ruleYaml.replace(/^id:.*$/m, `id: ${ruleId}`);
  
        const fs = await import("fs");
        const path = await import("path");
        const { SIGMA_RULES_DIR, loadSigmaRules, syncRuleToDb, getSigmaRule } = await import("../sigma-engine");
        const tenantDir = path.join(SIGMA_RULES_DIR, "custom", `tenant-${tenantId}`);
        if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true });
        const filePath = path.join(tenantDir, `${ruleId}.yml`);
        fs.writeFileSync(filePath, yamlWithId, "utf-8");
  
        // Reload rules into memory
        loadSigmaRules();
        const sigmaRule = getSigmaRule(ruleId);
        if (sigmaRule) await syncRuleToDb(sigmaRule);
  
        // Also insert into sigma_rules DB for UI listing
        const result = await pool.query(
          `INSERT INTO sigma_rules (rule_id, title, description, status, level, rule_yaml, mitre_tags, is_enabled, created_at, updated_at)
           VALUES ($1, $2, $3, 'experimental', $4, $5, $6, true, NOW(), NOW())
           ON CONFLICT (rule_id) DO UPDATE SET
             title = EXCLUDED.title, description = EXCLUDED.description, level = EXCLUDED.level,
             rule_yaml = EXCLUDED.rule_yaml, mitre_tags = EXCLUDED.mitre_tags, is_enabled = true, updated_at = NOW()
           RETURNING id, rule_id, title`,
          [ruleId, title, description || `AI-generated rule: ${title}`, level || "high", yamlWithId, JSON.stringify(mitreTags || [])]
        );
  
        res.status(201).json({ success: true, rule: result.rows[0], runtimeLoaded: !!sigmaRule });
      } catch (error: any) {
        res.status(error.status || 500).json({ message: error.message });
      }
    })

  app.get("/api/detection-studio/coverage", isAuthenticated, async (req: any, res) => {
      try {
        const tenantId = parseInt(req.query.tenantId as string);
        const days = parseInt(req.query.days as string) || 90;
        if (!tenantId) return res.status(400).json({ message: "tenantId required" });
        const access = await assertTenantAccess(req, tenantId);
        assertMSSRole(access);
  
        const cacheKey = `ds-coverage:${tenantId}:${days}`;
  
        // Redis-backed 5-minute cache (falls back to PostgreSQL when Redis is unavailable)
        const cached = await getCoverage(cacheKey, pool);
        if (cached) {
          return res.json({ ...cached.data, cached: true });
        }
  
        const since = new Date(Date.now() - days * 86400000);
        const rows = await pool.query(
          `SELECT mitre_technique_id, mitre_tactic, mitre_technique, COUNT(*) as count, MAX(created_at) as last_seen,
                  AVG(CASE WHEN confidence_score IS NOT NULL THEN confidence_score ELSE 50 END)::int as avg_confidence
           FROM incidents
           WHERE tenant_id = $1 AND created_at >= $2 AND mitre_technique_id IS NOT NULL
           GROUP BY mitre_technique_id, mitre_tactic, mitre_technique`,
          [tenantId, since]
        );
  
        // Sigma rule counts AND titles per technique
        const sigmaRows = await pool.query(
          `SELECT id, rule_id, title, mitre_tags, level FROM sigma_rules WHERE is_enabled = true AND mitre_tags IS NOT NULL`
        );
        const ruleCounts: Record<string, number> = {};
        const rulesByTechnique: Record<string, { id: number; ruleId: string; title: string; level: string }[]> = {};
        for (const sr of sigmaRows.rows) {
          const tags: string[] = Array.isArray(sr.mitre_tags) ? sr.mitre_tags : [];
          for (const tag of tags) {
            const m = String(tag).match(/T\d{4}(?:\.\d{3})?/i);
            if (m) {
              const tid = m[0].toUpperCase();
              ruleCounts[tid] = (ruleCounts[tid] || 0) + 1;
              if (!rulesByTechnique[tid]) rulesByTechnique[tid] = [];
              rulesByTechnique[tid].push({ id: sr.id, ruleId: sr.rule_id, title: sr.title, level: sr.level });
            }
          }
        }
  
        const covered: Record<string, any> = {};
        for (const r of rows.rows) {
          const tid = r.mitre_technique_id;
          covered[tid] = {
            count: parseInt(r.count),
            lastSeen: r.last_seen,
            tactic: r.mitre_tactic,
            technique: r.mitre_technique,
            confidence: parseInt(r.avg_confidence) || 50,
            ruleCount: ruleCounts[tid] || 0,
            rules: rulesByTechnique[tid] || [],
          };
        }
        for (const [tid, ruleCount] of Object.entries(ruleCounts)) {
          if (!covered[tid] && ruleCount > 0) {
            covered[tid] = { count: 0, lastSeen: "", tactic: "", technique: "", confidence: 0, ruleCount, rules: rulesByTechnique[tid] || [] };
          }
        }
  
        const payload = { covered, days, ruleCounts, totalRules: sigmaRows.rows.length };
  
        // Persist to Redis cache (5-min TTL); falls back to PostgreSQL when Redis is unavailable
        await setCoverage(cacheKey, payload, pool);
  
        res.json(payload);
      } catch (error: any) {
        res.status(error.status || 500).json({ message: error.message });
      }
    })

  app.post("/api/detection-studio/preview-events", isAuthenticated, async (req: any, res) => {
      try {
        const { tenantId, mitreTechniques } = req.body;
        if (!tenantId || !Array.isArray(mitreTechniques) || mitreTechniques.length === 0) {
          return res.status(400).json({ message: "tenantId and mitreTechniques required" });
        }
        const access = await assertTenantAccess(req, parseInt(tenantId));
        assertMSSRole(access);
  
        const placeholders = mitreTechniques.map((_: string, i: number) => `$${i + 2}`).join(", ");
        const rows = await pool.query(
          `SELECT id, title, severity, status, attacker, target, created_at, confidence_score, mitre_technique_id, mitre_technique
           FROM incidents
           WHERE tenant_id = $1 AND mitre_technique_id IN (${placeholders})
           ORDER BY created_at DESC LIMIT 10`,
          [parseInt(tenantId), ...mitreTechniques]
        );
  
        res.json({ events: rows.rows, total: rows.rows.length });
      } catch (error: any) {
        res.status(error.status || 500).json({ message: error.message });
      }
    })

  app.post("/api/detection-studio/gap-report", isAuthenticated, async (req: any, res) => {
      try {
        const { tenantId } = req.body;
        if (!tenantId) return res.status(400).json({ message: "tenantId required" });
        const gapAccess = await assertTenantAccess(req, parseInt(tenantId));
        assertMSSRole(gapAccess);
  
        const client = createAIClient();
        const model = getDefaultModel();
  
        // Gather coverage stats
        const days = 90;
        const since = new Date(Date.now() - days * 86400000);
  
        const incidentTechniques = await pool.query(
          `SELECT mitre_technique_id, mitre_tactic, mitre_technique, COUNT(*) as count
           FROM incidents
           WHERE tenant_id = $1 AND created_at >= $2 AND mitre_technique_id IS NOT NULL
           GROUP BY mitre_technique_id, mitre_tactic, mitre_technique
           ORDER BY count DESC`,
          [parseInt(tenantId), since]
        );
  
        const sigmaRows = await pool.query(
          `SELECT mitre_tags, title FROM sigma_rules WHERE is_enabled = true AND mitre_tags IS NOT NULL`
        );
        const ruleCounts: Record<string, number> = {};
        for (const sr of sigmaRows.rows) {
          const tags: string[] = Array.isArray(sr.mitre_tags) ? sr.mitre_tags : [];
          for (const tag of tags) {
            const m = String(tag).match(/T\d{4}(?:\.\d{3})?/i);
            if (m) { const tid = m[0].toUpperCase(); ruleCounts[tid] = (ruleCounts[tid] || 0) + 1; }
          }
        }
  
        const coveredTechniques = incidentTechniques.rows.map(r => r.mitre_technique_id);
        const sigmaOnlyTechniques = Object.keys(ruleCounts).filter(t => !coveredTechniques.includes(t));
        const totalSigmaRules = sigmaRows.rows.length;
        const coveredCount = coveredTechniques.length;
  
        const prompt = `You are a senior SOC detection engineer producing a MITRE ATT&CK coverage gap analysis report for a CISO.
  
  Coverage data (last 90 days):
  - Total Sigma rules in library: ${totalSigmaRules}
  - Techniques with active incident detections: ${coveredCount} (${incidentTechniques.rows.slice(0, 10).map(r => `${r.mitre_technique_id} (${r.mitre_tactic}): ${r.count} incidents`).join("; ")})
  - Techniques with Sigma rules only (no incidents): ${sigmaOnlyTechniques.slice(0, 10).join(", ")}
  - Total techniques with ANY coverage: ${coveredCount + sigmaOnlyTechniques.length}
  
  Generate a professional gap report as JSON:
  {
    "executiveSummary": "3-4 sentence CISO-level summary of detection coverage posture",
    "coverageScore": 73,
    "coverageGrade": "B",
    "tacticCoverage": [
      { "tactic": "Initial Access", "coveredCount": 3, "totalTechniques": 9, "riskLevel": "high" }
    ],
    "topGaps": [
      { "techniqueId": "T1190", "techniqueName": "Exploit Public-Facing Application", "tactic": "Initial Access", "risk": "critical", "reason": "No detections in 90 days despite technique being top 10 ransomware entry vector", "recommendation": "Deploy web application firewall logging + Sigma rules for CVE-specific exploitation patterns" }
    ],
    "topRecommendations": [
      "Prioritize rule creation for 5 uncovered Initial Access techniques given recent ransomware trends",
      "Enable network detection for Exfiltration tactic — currently 0% coverage"
    ],
    "strengths": ["Strong Execution tactic coverage with 12 active detection rules", "Persistence techniques well-monitored via Sysmon integration"]
  }
  
  Provide 5 topGaps and 5 topRecommendations. Make them specific and actionable.`;
  
        const completion = await client.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 2000,
          temperature: 0.3,
        });
  
        const report = JSON.parse(completion.choices[0]?.message?.content || "{}");
        res.json({ ...report, generatedAt: new Date().toISOString(), totalRules: totalSigmaRules, coveredTechniques: coveredCount });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.post("/api/detection-studio/gap-report-pdf", isAuthenticated, async (req: any, res) => {
      try {
        const { tenantId, reportData } = req.body;
        if (!tenantId || !reportData) return res.status(400).json({ message: "tenantId and reportData required" });
        const pdfAccess = await assertTenantAccess(req, parseInt(tenantId));
        assertMSSRole(pdfAccess);
  
        const tenantRow = await pool.query(`SELECT name, brand_color FROM tenants WHERE id = $1 LIMIT 1`, [parseInt(tenantId)]);
        const tenantName = tenantRow.rows[0]?.name || "MSSP";
        const brandColor = tenantRow.rows[0]?.brand_color || null;
  
        // Build briefing-style payload for generateBriefingPDF
        const briefingPayload = {
          compositeRiskScore: reportData.coverageScore ?? 0,
          threatLevel: reportData.coverageGrade === "A" ? "Low" : reportData.coverageGrade === "B" ? "Medium" : "High",
          metrics: {
            summary: reportData.executiveSummary || "",
            coverageScore: reportData.coverageScore ?? 0,
            coverageGrade: reportData.coverageGrade || "N/A",
            totalRules: reportData.totalRules ?? 0,
            coveredTechniques: reportData.coveredTechniques ?? 0,
            topGaps: reportData.topGaps || [],
            topRecommendations: reportData.topRecommendations || [],
            strengths: reportData.strengths || [],
            tacticCoverage: reportData.tacticCoverage || [],
          },
          keyHighlights: (reportData.topRecommendations || []).slice(0, 3),
          findings: (reportData.topGaps || []).map((g: any) => ({
            title: `${g.techniqueId}: ${g.techniqueName}`,
            severity: g.risk || "high",
            description: g.reason || "",
            recommendation: g.recommendation || "",
          })),
          recommendations: (reportData.topRecommendations || []).map((r: string) => ({ text: r })),
          title: "MITRE ATT&CK Coverage Gap Report",
          reportType: "threat_intelligence",
        };
  
        const pdfBuffer = await generateBriefingPDF(briefingPayload, tenantName, tenantName, brandColor, null, "Last 90 Days");
  
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="gap-report-${tenantId}-${Date.now()}.pdf"`);
        res.setHeader("Content-Length", pdfBuffer.length);
        res.send(pdfBuffer);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.get("/api/detection-rules/:tenantId", isAuthenticated, async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        await assertTenantAccess(req, tenantId);
        const { status, ruleType } = req.query;
        const rows = await db.select().from(aiDetectionRules)
          .where(and(
            eq(aiDetectionRules.tenantId, tenantId),
            status ? eq(aiDetectionRules.status, status as string) : undefined,
            ruleType ? eq(aiDetectionRules.ruleType, ruleType as string) : undefined,
          ))
          .orderBy(desc(aiDetectionRules.createdAt));
        res.json(rows);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.post("/api/detection-rules/:tenantId/generate", isAuthenticated, async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        await assertTenantAccess(req, tenantId);
        const { ruleType = "sigma", technique, threatDescription, eventIds, anomalyIds } = req.body;
        const rule = await generateDetectionRule(tenantId, ruleType, { technique, threatDescription, eventIds, anomalyIds });
        res.status(201).json(rule);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.post("/api/detection-rules/:tenantId/generate-from-anomalies", isAuthenticated, async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        await assertTenantAccess(req, tenantId);
        const { ruleType = "sigma" } = req.body;
        const rule = await generateRuleFromAnomalies(tenantId, ruleType);
        res.status(201).json(rule);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.post("/api/detection-rules/:tenantId/auto-generate", isAuthenticated, async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        await assertTenantAccess(req, tenantId);
        setImmediate(async () => {
          try { await autoGenerateRules(tenantId); } catch (e) { console.error("[DetectionEngine] Auto-gen failed:", e); }
        });
        res.json({ message: "Auto-generation started", status: "pending" });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.patch("/api/detection-rules/:tenantId/:ruleId/status", isAuthenticated, async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        await assertTenantAccess(req, tenantId);
        const ruleId = parseInt(req.params.ruleId);
        const { status } = req.body;
        if (!["draft", "testing", "active", "archived"].includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }
  
        // [NEW] When activating a Sigma rule, promote it to runtime
        let promoted = false;
        if (status === "active") {
          const { promoteAiRuleToSigma } = await import("../detection-engineering-engine");
          const [rule] = await db.select().from(aiDetectionRules)
            .where(and(eq(aiDetectionRules.id, ruleId), eq(aiDetectionRules.tenantId, tenantId)));
          if (rule && rule.ruleType === "sigma") {
            try {
              await promoteAiRuleToSigma(rule, req.user?.id || "manual");
              promoted = true;
            } catch (promoteErr: any) {
              console.error(`[DetectionRules] Manual promotion failed for rule ${ruleId}:`, promoteErr.message);
              return res.status(500).json({ message: `Failed to promote rule: ${promoteErr.message}` });
            }
          }
        }
  
        await db.update(aiDetectionRules).set({ status })
          .where(and(eq(aiDetectionRules.id, ruleId), eq(aiDetectionRules.tenantId, tenantId)));
        res.json({ success: true, promoted });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.delete("/api/detection-rules/:tenantId/:ruleId", isAuthenticated, async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        await assertTenantAccess(req, tenantId);
        const ruleId = parseInt(req.params.ruleId);
        await db.update(aiDetectionRules).set({ status: "archived" })
          .where(and(eq(aiDetectionRules.id, ruleId), eq(aiDetectionRules.tenantId, tenantId)));
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.get("/api/tenant-detection-settings/:tenantId", isAuthenticated, async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        await assertTenantAccess(req, tenantId);
        const { getTenantDetectionSettings } = await import("../detection-engineering-engine");
        const settings = await getTenantDetectionSettings(tenantId);
        res.json(settings);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.patch("/api/tenant-detection-settings/:tenantId", isAuthenticated, async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        await assertTenantAccess(req, tenantId);
        assertMSSRole(await assertTenantAccess(req, tenantId));
  
        const allowedFields = [
          "auto_enable_sigma_rules",
          "min_ai_confidence",
          "max_false_positive_rate",
          "min_backtest_matched_events",
          "min_quality_grade",
          "auto_enable_from_incidents",
          "auto_enable_from_gaps",
          "gap_generation_batch_size",
        ];
  
        const updates: Record<string, any> = {};
        for (const key of allowedFields) {
          if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
  
        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ message: "No valid fields to update" });
        }
  
        const setClause = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ");
        await pool.query(
          `UPDATE tenant_detection_settings SET ${setClause}, updated_at = NOW() WHERE tenant_id = $1`,
          [tenantId, ...Object.values(updates)]
        );
  
        const { getTenantDetectionSettings } = await import("../detection-engineering-engine");
        const settings = await getTenantDetectionSettings(tenantId);
        res.json({ success: true, settings });
      } catch (error: any) {
        res.status(error.status || 500).json({ message: error.message });
      }
    })

  app.get("/api/auto-enable-audit/:tenantId", isAuthenticated, async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        await assertTenantAccess(req, tenantId);
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const offset = parseInt(req.query.offset as string) || 0;
  
        const result = await pool.query(
          `SELECT a.*, r.name as rule_name
           FROM auto_enable_audit_log a
           LEFT JOIN ai_detection_rules r ON r.id = a.ai_rule_id
           WHERE a.tenant_id = $1
           ORDER BY a.created_at DESC
           LIMIT $2 OFFSET $3`,
          [tenantId, limit, offset]
        );
        res.json({ audits: result.rows });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    })

  app.get("/api/attack-detection/:tenantId/detections", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const category = req.query.category as string | undefined;
        const minConfidence = parseInt(req.query.minConfidence as string) || 0;
        const { pool } = await import("../db");
        let whereClause = `WHERE tenant_id = $1 AND confidence >= $2`;
        const params: any[] = [tenantId, minConfidence];
        if (category) {
          whereClause += ` AND attack_category = $${params.length + 1}`;
          params.push(category);
        }
        const result = await pool.query(
          `SELECT ad.*, se.event_type, se.occurred_at FROM attack_detections ad
           LEFT JOIN security_events se ON se.id = ad.event_id
           ${whereClause} ORDER BY ad.detected_at DESC LIMIT $${params.length + 1}`,
          [...params, limit]
        );
        res.json(result.rows);
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })

  app.get("/api/attack-detection/:tenantId/chains", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const { getRecentChains } = await import("../attack-chain-correlator");
        const chains = await getRecentChains(tenantId, limit);
        res.json(chains);
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })

  app.get("/api/attack-detection/:tenantId/chains/:chainId", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const { pool } = await import("../db");
        const chainRes = await pool.query(
          `SELECT * FROM attack_chain_groups WHERE tenant_id = $1 AND chain_id = $2`,
          [tenantId, req.params.chainId]
        );
        if (chainRes.rows.length === 0) return res.status(404).json({ message: "Chain not found" });
        const detectionsRes = await pool.query(
          `SELECT ad.*, se.event_type, se.occurred_at FROM attack_detections ad
           LEFT JOIN security_events se ON se.id = ad.event_id
           WHERE ad.attack_chain_id = $1 AND ad.tenant_id = $2
           ORDER BY ad.detected_at ASC`,
          [req.params.chainId, tenantId]
        );
        res.json({ chain: chainRes.rows[0], detections: detectionsRes.rows });
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })

  app.post("/api/attack-detection/:tenantId/classify", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const { eventData, eventId, incidentId } = req.body;
        if (!eventData || typeof eventData !== "object") return res.status(400).json({ message: "eventData is required" });
        const { runDetectionPipeline } = await import("../attack-detection-pipeline");
        const result = await runDetectionPipeline({ tenantId, eventId: eventId || null, incidentId: incidentId || null, eventData });
        if (!result) return res.json({ message: "Confidence too low, no detection stored", detected: false });
        res.json({ detected: true, detectionId: result.detectionId, chainId: result.chainId, classification: result.classification });
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })

  app.post("/api/attack-detection/:tenantId/run-batch", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const limit = Math.min(parseInt(req.body.limit) || 30, 100);
        const { runBatchDetectionPipeline } = await import("../attack-detection-pipeline");
        const result = await runBatchDetectionPipeline(tenantId, limit);
        res.json(result);
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })

  app.post("/api/attack-detection/:tenantId/feedback", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const { detectionId, incidentId, analystUserId, feedbackType, attackCategory, originalConfidence, notes } = req.body;
        if (!analystUserId || !feedbackType) return res.status(400).json({ message: "analystUserId and feedbackType are required" });
        if (!["true_positive", "false_positive", "benign"].includes(feedbackType)) {
          return res.status(400).json({ message: "feedbackType must be one of: true_positive, false_positive, benign" });
        }
        const { submitDetectionFeedback } = await import("../ai-training-manager");
        const feedbackId = await submitDetectionFeedback({ tenantId, detectionId, incidentId, analystUserId, feedbackType, attackCategory, originalConfidence, notes });
        res.json({ feedbackId, message: "Feedback recorded and model thresholds updated" });
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })

  app.get("/api/attack-detection/:tenantId/feedback", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const { getFeedbackHistory } = await import("../ai-training-manager");
        const history = await getFeedbackHistory(tenantId, limit);
        res.json(history);
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })

  app.get("/api/attack-detection/:tenantId/thresholds", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const { getThresholdStats } = await import("../ai-training-manager");
        const stats = await getThresholdStats(tenantId);
        res.json(stats);
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })

  app.post("/api/attack-detection/:tenantId/training-review", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const { runTrainingReview } = await import("../ai-training-manager");
        const result = await runTrainingReview(tenantId);
        res.json(result);
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })

  app.get("/api/attack-detection/:tenantId/categories", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const { ATTACK_CATEGORIES, ATTACK_CATEGORY_LABELS } = await import("@shared/schema");
        res.json(ATTACK_CATEGORIES.map(cat => ({ category: cat, label: ATTACK_CATEGORY_LABELS[cat] })));
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })

  app.get("/api/attack-detection/:tenantId/stats", isAuthenticated, async (req, res) => {
      try {
        const tenantId = parseInt(req.params.tenantId);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        await assertTenantAccess(req, tenantId);
        const { pool } = await import("../db");
        const [detectionStats, chainStats, feedbackStats] = await Promise.all([
          pool.query(
            `SELECT attack_category, COUNT(*) as count, AVG(confidence)::int as avg_confidence,
                    COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
                    COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_count
             FROM attack_detections WHERE tenant_id = $1 AND detected_at >= NOW() - INTERVAL '7 days'
             GROUP BY attack_category ORDER BY count DESC`,
            [tenantId]
          ),
          pool.query(
            `SELECT COUNT(*) as total_chains, COUNT(CASE WHEN promoted_to_incident THEN 1 END) as promoted_chains,
                    AVG(overall_confidence)::int as avg_chain_confidence
             FROM attack_chain_groups WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
            [tenantId]
          ),
          pool.query(
            `SELECT feedback_type, COUNT(*) as count
             FROM detection_feedback WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
             GROUP BY feedback_type`,
            [tenantId]
          ),
        ]);
        res.json({
          detectionsByCategory: detectionStats.rows,
          chainStats: chainStats.rows[0] || {},
          feedbackSummary: feedbackStats.rows,
        });
      } catch (err: any) { res.status(err.status ?? 500).json({ message: err.message }); }
    })
}
