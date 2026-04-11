import { db } from "../server/db";
import { securityEvents, incidents } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";

function classifyEmail(rp: any, subject: string, attachmentName: string, action: string) {
  const subLower = (subject || "").toLowerCase();
  const numAttachments = rp?.numAttachments || 0;
  const malwareFamily = rp?.malwareFamily || "";
  const authFailCount = rp?.authFailCount || 0;
  const isQuarantined = rp?.quarantined === true || rp?.quarantined === "true" || (action || "").toLowerCase() === "quarantined";

  const hasPhishSignals = subLower.includes("password") || subLower.includes("verify") || subLower.includes("confirm") ||
    subLower.includes("account") || subLower.includes("login") || subLower.includes("sign in") || subLower.includes("click here") ||
    subLower.includes("update your") || subLower.includes("expire") || subLower.includes("suspended") || subLower.includes("unauthorized") ||
    subLower.includes("secure your") || subLower.includes("reset your") || subLower.includes("unusual activity") ||
    subLower.includes("docusign") || subLower.includes("sharepoint") || subLower.includes("onedrive") || subLower.includes("voicemail") ||
    subLower.includes("sign-in") || subLower.includes("otp") || subLower.includes("security alert") || subLower.includes("2fa") ||
    subLower.includes("authenticate") || subLower.includes("access denied");

  const hasMalwareSignals = (numAttachments > 0 && ((attachmentName || "").match(/\.(exe|bat|cmd|scr|vbs|js|ps1|msi|dll|zip|rar|7z|iso|img|lnk)$/i))) ||
    (malwareFamily && malwareFamily !== "");

  const hasFinancialSignals = subLower.includes("invoice") || subLower.includes("payment") || subLower.includes("wire transfer") ||
    subLower.includes("purchase order") || subLower.includes("remittance") || subLower.includes("bank") || subLower.includes("fund");
  const hasBecSignals = hasFinancialSignals && (subLower.includes("urgent") || subLower.includes("ceo") || subLower.includes("director") ||
    subLower.includes("immediate") || subLower.includes("confidential"));

  const hasSpamSignals = subLower.includes("unsubscribe") || subLower.includes("newsletter") || subLower.includes("offer") ||
    subLower.includes("discount") || subLower.includes("free") || subLower.includes("winner") || subLower.includes("promotion") ||
    subLower.includes("deal") || subLower.includes("limited time") || subLower.includes("act now") || subLower.includes("special") ||
    subLower.includes("save") || subLower.includes("buy") || subLower.includes("sale") || subLower.includes("order") ||
    subLower.includes("subscribe") || subLower.includes("marketing") || subLower.includes("webinar") || subLower.includes("guide") ||
    subLower.includes("ebook") || subLower.includes("download") || subLower.includes("register") || subLower.includes("join") ||
    subLower.includes("trial") || subLower.includes("demo");

  let emailThreatType = "Clean";
  let severity: string = "info";
  let phishingSubtype = "";

  if (hasMalwareSignals) {
    emailThreatType = "Malware";
    severity = "critical";
  } else if (hasBecSignals) {
    emailThreatType = "BEC";
    severity = "critical";
    phishingSubtype = "BEC / Impersonation";
  } else if (hasPhishSignals) {
    emailThreatType = "Phishing";
    severity = "high";
    const hasCredentialKw = subLower.includes("password") || subLower.includes("credential") || subLower.includes("account") ||
      subLower.includes("expire") || subLower.includes("suspended") || subLower.includes("reset") || subLower.includes("authentication");
    const hasUrlKw = subLower.includes("click") || subLower.includes("verify") || subLower.includes("confirm") ||
      subLower.includes("update your") || subLower.includes("login") || subLower.includes("sign in");
    const hasBrandKw = subLower.includes("microsoft") || subLower.includes("office 365") || subLower.includes("google") ||
      subLower.includes("apple") || subLower.includes("amazon") || subLower.includes("paypal") || subLower.includes("netflix") ||
      subLower.includes("docusign") || subLower.includes("dropbox");
    const hasUrgency = subLower.includes("urgent") || subLower.includes("immediate") || subLower.includes("action required") ||
      subLower.includes("last chance") || subLower.includes("final notice") || subLower.includes("important");
    if (hasCredentialKw && hasUrlKw) phishingSubtype = "Credential Harvesting";
    else if (hasBrandKw) phishingSubtype = "Brand Impersonation";
    else if (hasFinancialSignals) phishingSubtype = "BEC / Impersonation";
    else if (hasUrgency) phishingSubtype = "Spear Phishing";
    else if (numAttachments > 0) phishingSubtype = "Malware Delivery";
    else phishingSubtype = "Generic Phishing";
  } else if (hasSpamSignals) {
    emailThreatType = "Spam";
    severity = "low";
  } else if (isQuarantined) {
    emailThreatType = "Spam";
    severity = "low";
  }

  if (authFailCount >= 2 && emailThreatType === "Clean") {
    emailThreatType = "Auth Failure";
    severity = "medium";
  }

  let mitreTactic: string | null = null;
  let mitreTechnique: string | null = null;
  let killChainPhase: string | null = null;
  if (emailThreatType === "Phishing") {
    mitreTactic = "Initial Access";
    if (phishingSubtype === "Credential Harvesting") mitreTechnique = "T1566.002 - Spearphishing Link";
    else if (phishingSubtype === "Malware Delivery") mitreTechnique = "T1566.001 - Spearphishing Attachment";
    else if (phishingSubtype === "BEC / Impersonation" || phishingSubtype === "Domain Spoofing") mitreTechnique = "T1534 - Internal Spearphishing";
    else mitreTechnique = numAttachments > 0 ? "T1566.001 - Spearphishing Attachment" : "T1566.002 - Spearphishing Link";
    killChainPhase = "delivery";
  } else if (emailThreatType === "BEC") {
    mitreTactic = "Initial Access"; mitreTechnique = "T1534 - Internal Spearphishing"; killChainPhase = "delivery";
  } else if (emailThreatType === "Malware") {
    mitreTactic = "Execution";
    mitreTechnique = numAttachments > 0 ? "T1204.002 - Malicious File" : "T1204.001 - Malicious Link";
    killChainPhase = numAttachments > 0 ? "delivery" : "exploitation";
  } else if (emailThreatType === "Auth Failure") {
    mitreTactic = "Defense Evasion"; mitreTechnique = "T1036.005 - Match Legitimate Name or Location"; killChainPhase = "delivery";
  }

  let riskScore = 0;
  const wasDelivered = !isQuarantined && (action || "").toLowerCase() !== "blocked";
  if (emailThreatType === "Clean") riskScore = 0;
  else if (emailThreatType === "Graymail") riskScore = 5;
  else if (emailThreatType === "Spam") riskScore = 15;
  else if (emailThreatType === "Auth Failure") riskScore = 45;
  else if (emailThreatType === "Suspicious") riskScore = 55;
  else if (emailThreatType === "Phishing") riskScore = wasDelivered ? 90 : 70;
  else if (emailThreatType === "BEC") riskScore = wasDelivered ? 95 : 80;
  else if (emailThreatType === "Malware") riskScore = wasDelivered ? 100 : 85;

  return { emailThreatType, severity, phishingSubtype, mitreTactic, mitreTechnique, killChainPhase, riskScore };
}

async function reclassifyAndRegenerate(tenantId: number) {
  console.log(`\n=== Step 1: Reclassify email events for tenant ${tenantId} ===`);

  const emailEvents = await db.select().from(securityEvents)
    .where(and(
      eq(securityEvents.tenantId, tenantId),
      sql`${securityEvents.eventType}::text = 'email'`
    ));

  console.log(`Found ${emailEvents.length} email events`);

  const needsReclassification = emailEvents.filter((e: any) => {
    const rp = e.rawPayload as any;
    return rp?.emailThreatType === "Clean" && rp?.quarantined === true;
  });
  const authFailureEvents = emailEvents.filter((e: any) => {
    const rp = e.rawPayload as any;
    return rp?.emailThreatType === "Auth Failure";
  });

  console.log(`  ${needsReclassification.length} quarantined 'Clean' events need reclassification`);
  console.log(`  ${authFailureEvents.length} 'Auth Failure' events (keeping as-is)`);

  let reclassified = 0;
  const newTypeCounts: Record<string, number> = {};

  for (const evt of needsReclassification) {
    const rp = evt.rawPayload as any || {};
    const subject = rp.subject || evt.threat || "";
    const attachmentName = rp.attachmentName || "";
    const action = rp.effectiveAction || rp.action || "";

    const result = classifyEmail(rp, subject, attachmentName, action);

    if (result.emailThreatType !== "Clean") {
      const updatedPayload = {
        ...rp,
        emailThreatType: result.emailThreatType,
        threatType: result.emailThreatType,
        phishingSubtype: result.phishingSubtype || null,
        killChainPhase: result.killChainPhase,
        riskScore: result.riskScore,
      };

      await db.update(securityEvents)
        .set({
          severity: result.severity as any,
          riskScore: result.riskScore,
          mitreTactic: result.mitreTactic,
          mitreTechnique: result.mitreTechnique,
          rawPayload: updatedPayload,
        })
        .where(eq(securityEvents.id, evt.id));

      reclassified++;
      newTypeCounts[result.emailThreatType] = (newTypeCounts[result.emailThreatType] || 0) + 1;
    }
  }

  console.log(`\nReclassified ${reclassified} events:`);
  for (const [type, count] of Object.entries(newTypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\n=== Step 2: Delete existing email incidents for tenant ${tenantId} ===`);
  const deleteResult = await db.delete(incidents)
    .where(and(
      eq(incidents.tenantId, tenantId),
      sql`${incidents.source} = 'Checkpoint Harmony Email'`
    ));
  console.log(`Deleted existing email incidents`);

  console.log(`\n=== Step 3: Regenerate grouped incidents ===`);

  const allEvents = await db.select().from(securityEvents)
    .where(and(
      eq(securityEvents.tenantId, tenantId),
      sql`${securityEvents.eventType}::text = 'email'`
    ));

  const threatEvents = allEvents.filter((e: any) => {
    const rp = e.rawPayload as any;
    const tt = rp?.emailThreatType || rp?.threatType;
    return tt && tt !== "Clean" && tt !== "Graymail";
  });

  console.log(`${threatEvents.length} threat events to generate incidents from`);

  const groupTracker = new Map<string, {
    senderDomain: string;
    senderEmail: string;
    subject: string;
    threatType: string;
    phishingSubtype: string;
    targets: Set<string>;
    timestamps: Date[];
    severity: string;
    quarantinedCount: number;
    deliveredCount: number;
    totalCount: number;
    spfFails: number;
    dkimFails: number;
    dmarcFails: number;
    mitreTactic: string;
    mitreTechnique: string;
    killChainPhase: string;
    detectionReasons: Set<string>;
    malwareFamily: string;
    attachmentCount: number;
  }>();

  for (const evt of threatEvents) {
    const rp = evt.rawPayload as any || {};
    const subject = rp.subject || evt.threat || "";
    const senderEmail = evt.sender || rp.senderEmail || "";
    const senderDomain = rp.senderDomain || (senderEmail.includes("@") ? senderEmail.split("@")[1] : "");
    const threatType = rp.emailThreatType || rp.threatType || "Suspicious";
    const phishingSubtype = rp.phishingSubtype || rp.phishingSubType || "";
    const occurredAt = evt.occurredAt ? new Date(evt.occurredAt) : new Date();
    const recipient = evt.recipient || rp.recipients || "";
    const severity = evt.severity || "medium";
    const action = rp.effectiveAction || evt.action || "";
    const isQuarantined = rp.quarantined === true || rp.quarantined === "true" || action === "quarantined" || action === "blocked";
    const isDelivered = action === "monitored" || action === "delivered" || action === "allowed";

    const dateKey = occurredAt.toISOString().substring(0, 10);
    const normalizedSubject = subject.substring(0, 60).toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const groupKey = `${senderDomain}||${threatType}||${normalizedSubject}||${dateKey}`;

    if (!groupTracker.has(groupKey)) {
      groupTracker.set(groupKey, {
        senderDomain, senderEmail, subject, threatType, phishingSubtype,
        targets: new Set(), timestamps: [], severity,
        quarantinedCount: 0, deliveredCount: 0, totalCount: 0,
        spfFails: 0, dkimFails: 0, dmarcFails: 0,
        mitreTactic: rp.mitreTactic || evt.mitreTactic || "",
        mitreTechnique: rp.mitreTechnique || evt.mitreTechnique || "",
        killChainPhase: rp.killChainPhase || "",
        detectionReasons: new Set(), malwareFamily: rp.malwareFamily || "", attachmentCount: 0,
      });
    }
    const grp = groupTracker.get(groupKey)!;
    if (recipient) recipient.split(/[;,]/).map((r: string) => r.trim().toLowerCase()).filter(Boolean).forEach((r: string) => grp.targets.add(r));
    grp.timestamps.push(occurredAt);
    grp.totalCount++;
    if (isQuarantined) grp.quarantinedCount++;
    if (isDelivered) grp.deliveredCount++;
    if (rp.spfResult && rp.spfResult.toLowerCase() === "fail") grp.spfFails++;
    if (rp.dkimResult && rp.dkimResult.toLowerCase() === "fail") grp.dkimFails++;
    if (rp.dmarcResult && rp.dmarcResult.toLowerCase() === "fail") grp.dmarcFails++;
    if (rp.detectionReason) String(rp.detectionReason).split(",").forEach((r: string) => grp.detectionReasons.add(r.trim()));
    if ((rp.numAttachments || 0) > 0) grp.attachmentCount += rp.numAttachments;
    if (!grp.phishingSubtype && phishingSubtype) grp.phishingSubtype = phishingSubtype;
    if (!grp.malwareFamily && rp.malwareFamily) grp.malwareFamily = rp.malwareFamily;
    const sevOrder = ["critical", "high", "medium", "low", "info"];
    if (sevOrder.indexOf(severity) < sevOrder.indexOf(grp.severity)) grp.severity = severity;
  }

  console.log(`Created ${groupTracker.size} incident groups`);

  let created = 0;
  const batch: any[] = [];

  for (const [key, grp] of groupTracker) {
    const sortedTs = [...grp.timestamps].sort((a, b) => a.getTime() - b.getTime());
    const allTargets = [...grp.targets];
    const recipientSummary = allTargets.length > 3
      ? `${allTargets.slice(0, 3).join(", ")} +${allTargets.length - 3} more`
      : allTargets.join(", ");

    const threatLabel = grp.phishingSubtype ? `${grp.threatType} (${grp.phishingSubtype})` : grp.threatType;
    const isCampaign = grp.targets.size >= 3;
    const incTitle = isCampaign
      ? `${threatLabel}: ${grp.subject.substring(0, 80)} — ${grp.targets.size} recipients from ${grp.senderDomain}`
      : `${threatLabel}: ${grp.subject.substring(0, 100)} from ${grp.senderDomain}`;

    let incSeverity = grp.severity;
    if (isCampaign && grp.targets.size >= 10) incSeverity = "critical";
    else if (isCampaign && grp.targets.size >= 5 && incSeverity !== "critical") incSeverity = "high";

    const allQuarantined = grp.quarantinedCount === grp.totalCount;
    const incStatus = allQuarantined ? "resolved" : "open";

    const dateStr = key.split("||")[3] || "";
    const authSummary = `SPF Fails: ${grp.spfFails}/${grp.totalCount} | DKIM Fails: ${grp.dkimFails}/${grp.totalCount} | DMARC Fails: ${grp.dmarcFails}/${grp.totalCount}`;
    const detReasons = [...grp.detectionReasons].slice(0, 10).join(", ");

    const incDescription = `${threatLabel} email${grp.totalCount > 1 ? "s" : ""} detected by Checkpoint Harmony Email & Collaboration.\n\n` +
      `Date: ${dateStr}\nSender: ${grp.senderEmail} (${grp.senderDomain})\nSubject: ${grp.subject}\n` +
      `Total Emails: ${grp.totalCount} | Unique Recipients: ${grp.targets.size}\n` +
      `Quarantined: ${grp.quarantinedCount} | Delivered: ${grp.deliveredCount}\n${authSummary}\n` +
      (grp.phishingSubtype ? `Phishing Type: ${grp.phishingSubtype}\n` : "") +
      (grp.malwareFamily ? `Malware Family: ${grp.malwareFamily}\n` : "") +
      (grp.attachmentCount > 0 ? `Attachments: ${grp.attachmentCount}\n` : "") +
      (detReasons ? `Detection Reasons: ${detReasons}\n` : "") +
      `\nTargeted Recipients:\n${allTargets.slice(0, 30).map((t: string) => `  - ${t}`).join("\n")}${allTargets.length > 30 ? `\n  ... and ${allTargets.length - 30} more` : ""}`;

    const recommendation = allQuarantined
      ? `All ${grp.totalCount} emails quarantined. Review for false positives. Consider blocking sender domain: ${grp.senderDomain}.`
      : grp.deliveredCount > 0
        ? `${grp.deliveredCount} of ${grp.totalCount} emails delivered to ${grp.targets.size} users. Investigate recipient mailboxes. Block sender domain: ${grp.senderDomain}.`
        : `${grp.threatType} email detected. Block sender domain: ${grp.senderDomain}.`;

    const confidence = grp.threatType === "Malware" ? 90
      : grp.threatType === "Phishing" ? Math.min(95, 70 + grp.targets.size * 2)
      : grp.threatType === "BEC" ? 92
      : grp.threatType === "Suspicious" ? 65
      : Math.min(80, 50 + grp.targets.size);

    batch.push({
      tenantId,
      title: incTitle.substring(0, 255),
      description: incDescription,
      severity: incSeverity,
      status: incStatus,
      source: "Checkpoint Harmony Email",
      category: "Email Security",
      incidentType: isCampaign ? "Email Campaign" : "Email Threat",
      detectionSource: "Checkpoint Harmony Email",
      sourceIp: grp.senderEmail.substring(0, 200),
      destinationIp: (allTargets[0] || "").substring(0, 200),
      affectedAssets: recipientSummary.substring(0, 500),
      recommendation,
      actionTaken: allQuarantined ? "Quarantined" : grp.deliveredCount > 0 ? "Partially Delivered" : "Detected",
      mitreTactic: grp.mitreTactic || "Initial Access",
      mitreTechniqueId: grp.mitreTechnique ? grp.mitreTechnique.split(" - ")[0] : "T1566",
      mitreTechnique: grp.mitreTechnique ? grp.mitreTechnique.split(" - ")[1] || grp.mitreTechnique : "Phishing",
      killChainPhase: grp.killChainPhase || "delivery",
      confidenceScore: confidence,
      iocData: {
        indicators: [
          { type: "email", value: grp.senderEmail, reputation: "malicious", source: "Checkpoint HEC" },
          { type: "domain", value: grp.senderDomain, reputation: "suspicious", source: "Checkpoint HEC" },
        ].filter(i => i.value),
      },
      createdAt: sortedTs[0] || new Date(),
    });
  }

  console.log(`\nInserting ${batch.length} incidents in batches...`);
  for (let i = 0; i < batch.length; i += 50) {
    const chunk = batch.slice(i, i + 50);
    try {
      await db.insert(incidents).values(chunk);
      created += chunk.length;
    } catch (e) {
      for (const inc of chunk) {
        try { await db.insert(incidents).values(inc); created++; } catch {}
      }
    }
    if ((i + 50) % 500 === 0 || i + 50 >= batch.length) {
      console.log(`  Progress: ${Math.min(i + 50, batch.length)}/${batch.length}`);
    }
  }

  console.log(`\nDone! Created ${created} incidents`);

  const byType: Record<string, number> = {};
  for (const [_, grp] of groupTracker) {
    byType[grp.threatType] = (byType[grp.threatType] || 0) + 1;
  }
  console.log(`\nIncident breakdown by threat type:`);
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  process.exit(0);
}

const tenantId = parseInt(process.argv[2] || "11");
console.log(`Starting reclassification for tenant ${tenantId}...`);
reclassifyAndRegenerate(tenantId).catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
