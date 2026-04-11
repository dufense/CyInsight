import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ShadingType } from "docx";

interface IRReportData {
  investigation: {
    id: number;
    incidentId: number;
    incidentTitle: string;
    incidentSeverity: string;
    incidentStatus: string;
    incidentType?: string;
    detectionSource?: string;
    sourceIp?: string;
    destinationIp?: string;
    affectedAssets?: string;
    actionTaken?: string;
    attackVector?: string;
    executiveSummary?: string;
    technicalReport?: string;
    verdict?: string;
    verdictReasoning?: string;
    riskScore?: number;
    confidenceScore?: number;
    attackChain?: Array<{ phase: string; description: string; evidence?: string }>;
    iocsSummary?: Array<{ type: string; value: string; reputation: string; context?: string }>;
    affectedEntities?: any[];
    recommendations?: any;
    findings?: any;
    startedAt?: string;
    completedAt?: string;
    entityGraphPng?: string; // base64 PNG data URL for entity graph embedding
  };
  tenant: {
    name: string;
    brandColor?: string;
    logoUrl?: string;
    timezone?: string;
  };
}

const COLORS = {
  primary: "#1e293b",
  accent: "#3b82f6",
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#16a34a",
  muted: "#64748b",
  border: "#cbd5e1",
  bgLight: "#f1f5f9",
  white: "#ffffff",
};

function sevColor(severity: string): string {
  const s = (severity || "").toLowerCase();
  if (s === "critical") return COLORS.critical;
  if (s === "high") return COLORS.high;
  if (s === "medium") return COLORS.medium;
  if (s === "low") return COLORS.low;
  return COLORS.muted;
}

function formatDate(date?: string | null): string {
  if (!date) return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/#{1,3}\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "• ");
}

function parseMarkdownSections(text: string): Array<{ heading: string; content: string }> {
  if (!text) return [];
  const sections: Array<{ heading: string; content: string }> = [];
  const lines = text.split("\n");
  let currentHeading = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentHeading || currentContent.length > 0) {
        sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
      }
      currentHeading = headingMatch[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentHeading || currentContent.length > 0) {
    sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
  }
  return sections;
}

export function generateIRReportPDF(data: IRReportData): PDFKit.PDFDocument {
  const { investigation: inv, tenant } = data;
  const brandColor = tenant.brandColor || COLORS.accent;
  const brandName = tenant.name || "SecureOps";
  const docId = `IR-${inv.id}-${Date.now().toString(36).toUpperCase()}`;
  const severity = (inv.incidentSeverity || "medium").toLowerCase();

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 70, bottom: 70, left: 50, right: 50 },
    autoFirstPage: false,
    info: {
      Title: `Incident Response Report - ${inv.incidentTitle || `Incident #${inv.incidentId}`}`,
      Author: brandName,
      Subject: "Incident Response Report",
      Creator: "SecureOps AI Analyst",
    },
  });

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginLeft = 50;
  const contentWidth = pageWidth - marginLeft - 50;
  let pageNum = 0;
  const usableBottom = pageHeight - 80;

  function writePageHeader() {
    if (pageNum <= 1) return;
    doc.save();
    doc.rect(0, 0, pageWidth, 45).fill(COLORS.primary);
    doc.fontSize(7).fillColor(COLORS.white).font("Helvetica-Bold");
    doc.text(brandName.toUpperCase(), marginLeft, 16, { width: contentWidth / 3, align: "left", lineBreak: false, characterSpacing: 1 });
    doc.fontSize(7).fillColor("#94a3b8").font("Helvetica");
    doc.text("INCIDENT RESPONSE REPORT", marginLeft + contentWidth / 3, 16, { width: contentWidth / 3, align: "center", lineBreak: false });
    doc.fontSize(6).fillColor(brandColor);
    doc.text(`PAGE ${pageNum}`, marginLeft + (contentWidth * 2 / 3), 16, { width: contentWidth / 3, align: "right", lineBreak: false, characterSpacing: 1 });
    doc.rect(0, 45, pageWidth, 2).fill(brandColor);
    doc.restore();
  }

  function writePageFooter() {
    doc.save();
    const footerY = pageHeight - 32;
    doc.rect(0, footerY - 2, pageWidth, 34).fill(COLORS.primary);
    doc.rect(0, footerY - 2, pageWidth, 1.5).fill(brandColor);
    doc.fontSize(5.5).fillColor("#94a3b8").font("Helvetica-Bold");
    doc.text("CONFIDENTIAL - INTERNAL USE ONLY", marginLeft, footerY + 4, { width: contentWidth, align: "center", characterSpacing: 1.2 });
    doc.fontSize(5).fillColor(COLORS.muted).font("Helvetica");
    doc.text(`${docId}  |  (c) ${new Date().getFullYear()} ${brandName}`, marginLeft, footerY + 14, { width: contentWidth, align: "center" });
    doc.restore();
  }

  function addContentPage() {
    if (pageNum > 0) writePageFooter();
    doc.addPage();
    pageNum++;
    writePageHeader();
    doc.y = pageNum <= 1 ? 70 : 56;
  }

  function ensureSpace(needed: number) {
    if (doc.y + needed > usableBottom) addContentPage();
  }

  function sectionTitle(title: string, num: string) {
    ensureSpace(36);
    doc.y += 6;
    doc.save();
    doc.rect(marginLeft, doc.y, 4, 16).fill(brandColor);
    doc.fontSize(12).fillColor(COLORS.primary).font("Helvetica-Bold");
    doc.text(`${num}  ${title}`, marginLeft + 12, doc.y + 1, { width: contentWidth - 12 });
    doc.y += 20;
    doc.strokeColor(COLORS.border).lineWidth(0.5);
    doc.moveTo(marginLeft, doc.y).lineTo(marginLeft + contentWidth, doc.y).stroke();
    doc.y += 6;
    doc.restore();
  }

  function bodyText(text: string, indent = 0) {
    if (!text || !text.trim()) return;
    ensureSpace(16);
    doc.fontSize(8.5).fillColor("#334155").font("Helvetica");
    doc.text(stripMarkdown(text), marginLeft + indent, doc.y, { width: contentWidth - indent, lineGap: 2.5 });
    doc.y += 4;
  }

  function bulletItem(text: string, indent = 8) {
    if (!text || !text.trim()) return;
    ensureSpace(14);
    doc.fontSize(8).fillColor("#475569").font("Helvetica");
    const cleaned = stripMarkdown(text);
    if (!cleaned.trim()) return;
    doc.text(`-  ${cleaned}`, marginLeft + indent, doc.y, { width: contentWidth - indent, lineGap: 2 });
    doc.y += 3;
  }

  function keyValue(key: string, value: string, indent = 0) {
    ensureSpace(14);
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(COLORS.primary);
    doc.text(`${key}: `, marginLeft + indent, doc.y, { continued: true, width: contentWidth - indent });
    doc.font("Helvetica").fillColor("#475569");
    doc.text(value || "N/A", { lineGap: 2 });
    doc.y += 3;
  }

  function coverKeyValue(key: string, value: string) {
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#94a3b8");
    doc.text(`${key}: `, marginLeft, doc.y, { continued: true, width: contentWidth });
    doc.font("Helvetica").fillColor(COLORS.white);
    doc.text(value || "N/A", { lineGap: 2 });
    doc.y += 4;
  }

  function drawRiskGauge(cx: number, cy: number, radius: number, score: number) {
    doc.save();
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;
    const scoreAngle = startAngle + (score / 100) * Math.PI;
    const trackWidth = 10;

    doc.lineWidth(trackWidth).lineCap("round");
    doc.path(arcPath(cx, cy, radius, startAngle, endAngle)).strokeColor("#e2e8f0").stroke();
    if (score > 0) {
      const gaugeColor = score >= 75 ? COLORS.critical : score >= 50 ? COLORS.high : score >= 25 ? COLORS.medium : COLORS.low;
      doc.path(arcPath(cx, cy, radius, startAngle, scoreAngle)).strokeColor(gaugeColor).stroke();
    }

    doc.fontSize(22).fillColor(COLORS.primary).font("Helvetica-Bold");
    doc.text(`${score}`, cx - 25, cy - 20, { width: 50, align: "center" });
    doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica");
    doc.text("/ 100", cx - 20, cy + 2, { width: 40, align: "center" });
    doc.restore();
  }

  function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const largeArc = (end - start) > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  function drawProgressBar(x: number, y: number, width: number, height: number, pct: number, fillCol: string, label: string) {
    doc.save();
    doc.roundedRect(x, y, width, height, 3).fill("#e2e8f0");
    const fillW = Math.max(6, (pct / 100) * width);
    doc.roundedRect(x, y, fillW, height, 3).fill(fillCol);
    doc.fontSize(7).fillColor(COLORS.white).font("Helvetica-Bold");
    doc.text(`${pct}%`, x + 4, y + 2, { width: fillW - 8, align: "left" });
    doc.fontSize(7).fillColor(COLORS.primary).font("Helvetica-Bold");
    doc.text(label, x, y - 12, { width: width });
    doc.restore();
  }

  function drawInfoCard(x: number, y: number, w: number, h: number, value: string, label: string, bgColor: string) {
    doc.save();
    doc.roundedRect(x, y, w, h, 4).fill(bgColor);
    const valFontSize = value.length > 8 ? 10 : value.length > 5 ? 12 : 16;
    doc.fontSize(valFontSize).fillColor(COLORS.primary).font("Helvetica-Bold");
    doc.text(value, x + 4, y + 8, { width: w - 8, align: "center", lineBreak: false });
    doc.fontSize(6.5).fillColor(COLORS.muted).font("Helvetica");
    doc.text(label, x + 4, y + h - 14, { width: w - 8, align: "center", lineBreak: false });
    doc.restore();
  }

  function drawIOCBar(x: number, y: number, w: number, h: number, malCount: number, susCount: number, cleanCount: number) {
    doc.save();
    const total = malCount + susCount + cleanCount;
    if (total === 0) { doc.restore(); return; }
    const malW = Math.max(0, (malCount / total) * w);
    const susW = Math.max(0, (susCount / total) * w);
    const clnW = w - malW - susW;

    doc.roundedRect(x, y, w, h, 3).fill("#e2e8f0");
    let cx = x;
    if (malW > 0) { doc.rect(cx, y, malW, h).fill(COLORS.critical); cx += malW; }
    if (susW > 0) { doc.rect(cx, y, susW, h).fill(COLORS.medium); cx += susW; }
    if (clnW > 0) { doc.rect(cx, y, clnW, h).fill(COLORS.low); }

    const legendY = y + h + 6;
    const items: Array<{ color: string; label: string; count: number }> = [
      { color: COLORS.critical, label: "Malicious", count: malCount },
      { color: COLORS.medium, label: "Suspicious", count: susCount },
      { color: COLORS.low, label: "Clean", count: cleanCount },
    ];
    let lx = x;
    for (const item of items) {
      if (item.count > 0) {
        doc.rect(lx, legendY, 8, 8).fill(item.color);
        doc.fontSize(6.5).fillColor(COLORS.muted).font("Helvetica");
        doc.text(`${item.label} (${item.count})`, lx + 10, legendY, { width: 80 });
        lx += 80;
      }
    }
    doc.restore();
  }

  // ── COVER PAGE ──
  doc.addPage();
  pageNum++;
  doc.rect(0, 0, pageWidth, pageHeight).fill(COLORS.primary);

  const dividerY = pageHeight * 0.62;
  doc.rect(0, dividerY, pageWidth, 4).fill(brandColor);

  doc.fontSize(10).fillColor("#94a3b8").font("Helvetica-Bold");
  doc.text(brandName.toUpperCase(), marginLeft, 60, { width: contentWidth, characterSpacing: 4 });

  doc.fontSize(9).fillColor(brandColor).font("Helvetica");
  doc.text("INCIDENT RESPONSE REPORT", marginLeft, 85, { width: contentWidth, characterSpacing: 3 });

  doc.y = pageHeight * 0.28;
  doc.fontSize(26).fillColor(COLORS.white).font("Helvetica-Bold");
  doc.text(inv.incidentTitle || `Incident #${inv.incidentId}`, marginLeft, doc.y, { width: contentWidth, lineGap: 4 });

  doc.y += 30;
  doc.fontSize(11).fillColor("#94a3b8").font("Helvetica");
  doc.text(`Investigation #${inv.id}`, marginLeft, doc.y);

  doc.y += 20;
  const sevCol = sevColor(severity);
  doc.save();
  doc.rect(marginLeft, doc.y, 80, 22).fill(sevCol);
  doc.fontSize(9).fillColor(COLORS.white).font("Helvetica-Bold");
  doc.text(severity.toUpperCase(), marginLeft + 8, doc.y + 6, { width: 64, align: "center" });

  if (inv.verdict) {
    const cvLabel = inv.verdict === "true_positive" ? "TRUE POSITIVE" :
      inv.verdict === "false_positive" ? "FALSE POSITIVE" : "INCONCLUSIVE";
    const cvColor = inv.verdict === "true_positive" ? COLORS.critical : inv.verdict === "false_positive" ? COLORS.low : COLORS.medium;
    doc.rect(marginLeft + 90, doc.y, 110, 22).fill(cvColor);
    doc.fontSize(9).fillColor(COLORS.white).font("Helvetica-Bold");
    doc.text(cvLabel, marginLeft + 95, doc.y + 6, { width: 100, align: "center" });
  }
  doc.restore();

  doc.y = dividerY + 24;
  coverKeyValue("Date", formatDate(inv.startedAt));
  coverKeyValue("Risk Score", `${inv.riskScore || "N/A"}/100`);
  coverKeyValue("Confidence", `${inv.confidenceScore || "N/A"}%`);
  coverKeyValue("Document ID", docId);
  coverKeyValue("Tenant", brandName);
  coverKeyValue("Classification", "CONFIDENTIAL");

  doc.fontSize(7).fillColor("#64748b").font("Helvetica");
  doc.text(`Generated by SecureOps AI Analyst on ${formatDate()}`, marginLeft, pageHeight - 60, { width: contentWidth, align: "center" });

  // ── THREAT SUMMARY DASHBOARD ──
  addContentPage();
  doc.save();
  doc.rect(marginLeft, doc.y, contentWidth, 20).fill(COLORS.primary);
  doc.fontSize(10).fillColor(COLORS.white).font("Helvetica-Bold");
  doc.text("THREAT SUMMARY DASHBOARD", marginLeft + 10, doc.y + 5, { width: contentWidth - 20 });
  doc.restore();
  doc.y += 28;

  const dashY = doc.y;
  const riskScore = inv.riskScore || 0;
  const confScore = inv.confidenceScore || 0;

  drawRiskGauge(marginLeft + 70, dashY + 50, 40, riskScore);
  doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica-Bold");
  doc.text("RISK SCORE", marginLeft + 25, dashY + 75, { width: 90, align: "center" });

  const confColor = confScore >= 80 ? COLORS.low : confScore >= 50 ? COLORS.medium : COLORS.critical;
  drawProgressBar(marginLeft + 170, dashY + 46, 150, 14, confScore, confColor, "CONFIDENCE LEVEL");

  const verdictText = inv.verdict === "true_positive" ? "TRUE POSITIVE" :
    inv.verdict === "false_positive" ? "FALSE POSITIVE" : "INCONCLUSIVE";
  const verdictBg = inv.verdict === "true_positive" ? "#fef2f2" : inv.verdict === "false_positive" ? "#f0fdf4" : "#fffbeb";
  const verdictTxt = inv.verdict === "true_positive" ? COLORS.critical : inv.verdict === "false_positive" ? COLORS.low : COLORS.medium;
  doc.save();
  doc.roundedRect(marginLeft + 170, dashY + 10, 150, 22, 4).fill(verdictBg);
  doc.fontSize(9).fillColor(verdictTxt).font("Helvetica-Bold");
  doc.text(verdictText, marginLeft + 175, dashY + 16, { width: 140, align: "center" });
  doc.restore();

  const sevBg = severity === "critical" ? "#fef2f2" : severity === "high" ? "#fff7ed" : severity === "medium" ? "#fffbeb" : "#f0fdf4";
  doc.save();
  doc.roundedRect(marginLeft + 340, dashY + 10, 155, 22, 4).fill(sevBg);
  doc.fontSize(9).fillColor(sevColor(severity)).font("Helvetica-Bold");
  doc.text(`SEVERITY: ${severity.toUpperCase()}`, marginLeft + 345, dashY + 16, { width: 145, align: "center" });
  doc.restore();

  const detSrc = inv.detectionSource || "AI Analysis";
  doc.save();
  doc.roundedRect(marginLeft + 340, dashY + 40, 155, 28, 4).fill("#f0f9ff");
  doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica");
  doc.text("DETECTION SOURCE", marginLeft + 345, dashY + 43, { width: 145, align: "center" });
  doc.fontSize(7.5).fillColor(COLORS.primary).font("Helvetica-Bold");
  doc.text(detSrc.length > 30 ? detSrc.substring(0, 27) + "..." : detSrc, marginLeft + 345, dashY + 54, { width: 145, align: "center" });
  doc.restore();

  doc.y = dashY + 85;

  const cardW = (contentWidth - 24) / 4;
  const cardH = 44;
  const phaseCount = inv.attackChain ? inv.attackChain.length : 0;
  const iocCount = inv.iocsSummary ? inv.iocsSummary.length : 0;
  const entityCount = inv.affectedEntities ? inv.affectedEntities.length : 0;
  const actionTaken = inv.actionTaken || "Investigating";

  drawInfoCard(marginLeft, doc.y, cardW, cardH, String(phaseCount), "Attack Phases", "#f0f9ff");
  drawInfoCard(marginLeft + cardW + 8, doc.y, cardW, cardH, String(iocCount), "IOCs Found", "#fef2f2");
  drawInfoCard(marginLeft + (cardW + 8) * 2, doc.y, cardW, cardH, String(entityCount), "Entities", "#fffbeb");
  drawInfoCard(marginLeft + (cardW + 8) * 3, doc.y, cardW, cardH, actionTaken.length > 10 ? actionTaken.substring(0, 9) + ".." : actionTaken, "Action Status", "#f0fdf4");

  doc.y += cardH + 10;

  if (inv.iocsSummary && inv.iocsSummary.length > 0) {
    const malC = inv.iocsSummary.filter(i => i.reputation === "malicious").length;
    const susC = inv.iocsSummary.filter(i => i.reputation === "suspicious").length;
    const clnC = inv.iocsSummary.filter(i => i.reputation === "clean").length;

    doc.fontSize(8).fillColor(COLORS.primary).font("Helvetica-Bold");
    doc.text("IOC REPUTATION BREAKDOWN", marginLeft, doc.y, { width: contentWidth });
    doc.y += 14;
    drawIOCBar(marginLeft, doc.y, contentWidth, 14, malC, susC, clnC);
    doc.y += 34;
  }

  // ── CONTENT PAGES ──
  let sectionNum = 0;
  const nextNum = () => { sectionNum++; return String(sectionNum).padStart(2, "0"); };

  sectionTitle("Executive Summary", nextNum());
  doc.save();
  const summaryText = inv.executiveSummary || "No executive summary available for this investigation.";
  const panelPad = 10;
  doc.roundedRect(marginLeft, doc.y, contentWidth, 4, 0).fill(COLORS.bgLight);
  const textH = doc.fontSize(8.5).font("Helvetica").heightOfString(stripMarkdown(summaryText), { width: contentWidth - panelPad * 2 - 6, lineGap: 2.5 });
  const panelH = textH + panelPad * 2;
  doc.roundedRect(marginLeft, doc.y, contentWidth, panelH, 3).fill(COLORS.bgLight);
  doc.rect(marginLeft, doc.y, 3, panelH).fill(brandColor);
  doc.fontSize(8.5).fillColor("#334155").font("Helvetica");
  doc.text(stripMarkdown(summaryText), marginLeft + panelPad + 3, doc.y + panelPad, { width: contentWidth - panelPad * 2 - 6, lineGap: 2.5 });
  doc.y += panelH + 6;
  doc.restore();

  sectionTitle("AI Verdict & Classification", nextNum());
  const verdictLabel = inv.verdict === "true_positive" ? "True Positive (Confirmed Threat)" :
    inv.verdict === "false_positive" ? "False Positive (Benign Activity)" : "Inconclusive (Requires Further Analysis)";
  keyValue("Verdict", verdictLabel);
  keyValue("Risk Score", `${riskScore}/100`);
  keyValue("Confidence Score", `${confScore}%`);
  if (inv.verdictReasoning) {
    doc.y += 2;
    doc.save();
    const reasonText = stripMarkdown(inv.verdictReasoning);
    const rTextH = doc.fontSize(8).font("Helvetica").heightOfString(reasonText, { width: contentWidth - 26, lineGap: 2 });
    const rPanelH = rTextH + 16;
    doc.roundedRect(marginLeft, doc.y, contentWidth, rPanelH, 3).fill("#fffbeb");
    doc.rect(marginLeft, doc.y, 3, rPanelH).fill(COLORS.medium);
    doc.fontSize(7).fillColor(COLORS.medium).font("Helvetica-Bold");
    doc.text("KEY FINDINGS", marginLeft + 10, doc.y + 4, { width: contentWidth - 20 });
    doc.fontSize(8).fillColor("#92400e").font("Helvetica");
    doc.text(reasonText, marginLeft + 10, doc.y + 14, { width: contentWidth - 26, lineGap: 2 });
    doc.y += rPanelH + 4;
    doc.restore();
  }

  if (inv.attackChain && inv.attackChain.length > 0) {
    sectionTitle("Attack Chain Analysis", nextNum());
    const timelineX = marginLeft + 14;
    const nodeRadius = 5;
    const lineX = timelineX;

    for (let i = 0; i < inv.attackChain.length; i++) {
      const phase = inv.attackChain[i];
      const descText = stripMarkdown(phase.description);
      const descH = doc.fontSize(8).font("Helvetica").heightOfString(descText, { width: contentWidth - 40, lineGap: 2 });
      const evH = phase.evidence ? 14 : 0;
      const phaseH = 14 + descH + evH + 10;
      ensureSpace(phaseH);
      const nodeY = doc.y + nodeRadius;

      doc.save();
      doc.circle(lineX, nodeY, nodeRadius).fill(brandColor);
      doc.circle(lineX, nodeY, nodeRadius - 2).fill(COLORS.white);
      doc.circle(lineX, nodeY, 2).fill(brandColor);
      doc.restore();

      doc.fontSize(9.5).fillColor(brandColor).font("Helvetica-Bold");
      doc.text(phase.phase, lineX + 14, nodeY - 5, { width: contentWidth - 40 });
      doc.y = nodeY + 10;

      doc.fontSize(8).fillColor("#334155").font("Helvetica");
      doc.text(descText, lineX + 14, doc.y, { width: contentWidth - 40, lineGap: 2 });
      doc.y += 4;

      if (phase.evidence) {
        const evText = stripMarkdown(phase.evidence);
        const confMatch = evText.match(/confidence:\s*(\d+)/i);
        const evConf = confMatch ? parseInt(confMatch[1]) : 0;

        doc.save();
        doc.fontSize(7.5).fillColor(COLORS.muted).font("Helvetica");
        doc.text(`Evidence: ${evText}`, lineX + 14, doc.y, { width: contentWidth - 100 });

        if (evConf > 0) {
          const barX = marginLeft + contentWidth - 65;
          const barW = 55;
          doc.roundedRect(barX, doc.y, barW, 8, 2).fill("#e2e8f0");
          const confFillW = Math.max(4, (evConf / 100) * barW);
          const confCol = evConf >= 80 ? COLORS.low : evConf >= 50 ? COLORS.medium : COLORS.high;
          doc.roundedRect(barX, doc.y, confFillW, 8, 2).fill(confCol);
          doc.fontSize(5.5).font("Helvetica-Bold");
          if (confFillW >= 22) {
            doc.fillColor(COLORS.white);
            doc.text(`${evConf}%`, barX + 2, doc.y + 1, { width: confFillW - 4, lineBreak: false });
          } else {
            doc.fillColor(COLORS.muted);
            doc.text(`${evConf}%`, barX + confFillW + 2, doc.y + 1, { width: 30, lineBreak: false });
          }
        }
        doc.restore();
        doc.y += 12;
      }

      if (i < inv.attackChain.length - 1) {
        doc.save();
        doc.strokeColor("#cbd5e1").lineWidth(1.5);
        const connStart = nodeY + nodeRadius + 2;
        const connEnd = doc.y + 4;
        for (let cy = connStart; cy < connEnd; cy += 5) {
          doc.moveTo(lineX, cy).lineTo(lineX, Math.min(cy + 3, connEnd)).stroke();
        }
        doc.restore();
      }
      doc.y += 6;
    }
  }

  if (inv.iocsSummary && inv.iocsSummary.length > 0) {
    sectionTitle("Indicators of Compromise", nextNum());
    const malicious = inv.iocsSummary.filter(i => i.reputation === "malicious");
    const suspicious = inv.iocsSummary.filter(i => i.reputation === "suspicious");
    bodyText(`${malicious.length} malicious and ${suspicious.length} suspicious indicators identified during investigation.`);
    doc.y += 2;

    const filteredIOCs = inv.iocsSummary.filter(i => i.reputation !== "clean").slice(0, 20);
    const colWidths = { rep: 70, type: 50, value: contentWidth - 70 - 50 - 8 };
    const tableX = marginLeft;
    const rowH = 16;

    function drawIOCTableHeader() {
      const hdrY = doc.y;
      doc.save();
      doc.rect(tableX, hdrY, contentWidth, rowH).fill(COLORS.primary);
      doc.fontSize(7).fillColor(COLORS.white).font("Helvetica-Bold");
      doc.text("REPUTATION", tableX + 4, hdrY + 4, { width: colWidths.rep, lineBreak: false });
      doc.text("TYPE", tableX + colWidths.rep + 4, hdrY + 4, { width: colWidths.type, lineBreak: false });
      doc.text("VALUE / CONTEXT", tableX + colWidths.rep + colWidths.type + 4, hdrY + 4, { width: colWidths.value, lineBreak: false });
      doc.restore();
      doc.y = hdrY + rowH;
    }

    ensureSpace(rowH + 4);
    drawIOCTableHeader();

    for (let ri = 0; ri < filteredIOCs.length; ri++) {
      const ioc = filteredIOCs[ri];
      const valueText = `${ioc.value || "N/A"}${ioc.context ? ` -- ${ioc.context}` : ""}`;
      const cellH = Math.max(rowH, doc.fontSize(7).font("Helvetica").heightOfString(valueText, { width: colWidths.value - 8 }) + 8);

      const prevPage = pageNum;
      ensureSpace(cellH);
      if (pageNum !== prevPage) drawIOCTableHeader();
      const rowStartY = doc.y;
      const rowBg = ri % 2 === 0 ? COLORS.bgLight : COLORS.white;
      doc.save();
      doc.rect(tableX, rowStartY, contentWidth, cellH).fill(rowBg);

      const repColor = ioc.reputation === "malicious" ? COLORS.critical : COLORS.medium;
      const repBg = ioc.reputation === "malicious" ? "#fef2f2" : "#fffbeb";
      doc.roundedRect(tableX + 4, rowStartY + 3, colWidths.rep - 8, cellH - 6, 2).fill(repBg);
      doc.fontSize(6.5).fillColor(repColor).font("Helvetica-Bold");
      doc.text((ioc.reputation || "unknown").toUpperCase(), tableX + 6, rowStartY + 5, { width: colWidths.rep - 12, align: "center", lineBreak: false });

      doc.fontSize(7).fillColor("#475569").font("Helvetica-Bold");
      doc.text((ioc.type || "?").toUpperCase(), tableX + colWidths.rep + 4, rowStartY + 5, { width: colWidths.type - 4, lineBreak: false });

      doc.fontSize(7).fillColor("#334155").font("Helvetica");
      doc.text(valueText, tableX + colWidths.rep + colWidths.type + 4, rowStartY + 4, { width: colWidths.value - 8, lineGap: 1.5 });

      doc.strokeColor("#e2e8f0").lineWidth(0.5);
      doc.moveTo(tableX, rowStartY + cellH).lineTo(tableX + contentWidth, rowStartY + cellH).stroke();
      doc.restore();
      doc.y = rowStartY + cellH;
    }
    doc.y += 4;
  }

  if (inv.affectedEntities && inv.affectedEntities.length > 0) {
    sectionTitle("Affected Entities", nextNum());
    for (const entity of inv.affectedEntities.slice(0, 15)) {
      const label = `${entity.type || "Entity"}: ${entity.value || entity.name || "Unknown"}${entity.context ? ` (${entity.context})` : ""}`;
      bulletItem(label);
    }
  }

  // Entity Intelligence Graph (embedded PNG snapshot if available)
  if (inv.entityGraphPng) {
    sectionTitle("Entity Intelligence Graph", nextNum());
    ensureSpace(16);
    doc.fontSize(8).fillColor(COLORS.muted).font("Helvetica");
    doc.text(
      "The following force-directed graph visualizes entity relationships extracted from correlated security events during this incident. " +
      "Red nodes indicate malicious indicators, orange = suspicious, yellow = enriched, blue = clean. " +
      "The highlighted orange path represents the reconstructed attack chain.",
      marginLeft, doc.y, { width: contentWidth }
    );
    doc.y += 8;
    ensureSpace(280);
    try {
      const dataUrl = inv.entityGraphPng;
      const base64Data = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      const imgBuffer = Buffer.from(base64Data, "base64");
      const imgWidth = Math.min(contentWidth, 440);
      const imgHeight = Math.round(imgWidth * (480 / 720)); // preserve 720x480 aspect ratio
      const imgX = marginLeft + (contentWidth - imgWidth) / 2;
      doc.image(imgBuffer, imgX, doc.y, { width: imgWidth, height: imgHeight });
      doc.y += imgHeight + 8;
    } catch (_e) {
      doc.fontSize(8).fillColor(COLORS.muted).text("[Entity graph image could not be rendered]", marginLeft, doc.y, { width: contentWidth });
      doc.y += 16;
    }
  }

  if (inv.technicalReport) {
    sectionTitle("Technical Analysis", nextNum());
    const sections = parseMarkdownSections(inv.technicalReport);
    if (sections.length > 0) {
      for (const section of sections) {
        if (section.heading) {
          ensureSpace(24);
          doc.fontSize(9.5).fillColor(COLORS.primary).font("Helvetica-Bold");
          doc.text(section.heading, marginLeft + 8, doc.y, { width: contentWidth - 8 });
          doc.y += 4;
        }
        if (section.content) {
          const contentLines = section.content.split("\n");
          for (const line of contentLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
              bulletItem(trimmed.replace(/^[-*]\s+/, ""), 16);
            } else {
              bodyText(trimmed, 8);
            }
          }
        }
      }
    } else {
      bodyText(stripMarkdown(inv.technicalReport));
    }
  }

  const recs = inv.recommendations;
  if (recs) {
    sectionTitle("Recommendations", nextNum());
    const containment = recs.containmentActions || recs.containment || [];
    const remediation = recs.remediationSteps || recs.remediation || [];

    if (containment.length > 0) {
      ensureSpace(20);
      doc.fontSize(9.5).fillColor(COLORS.primary).font("Helvetica-Bold");
      doc.text("Containment Actions", marginLeft + 8, doc.y, { width: contentWidth - 8 });
      doc.y += 4;
      for (const action of containment.slice(0, 10)) {
        const label = typeof action === "string" ? action : action.action || action.description || "";
        if (!label || !label.trim()) continue;
        const priority = typeof action === "object" ? (action.priority || "medium") : "medium";
        const prColor = priority === "critical" ? COLORS.critical : priority === "high" ? COLORS.high : priority === "info" ? COLORS.accent : COLORS.muted;
        ensureSpace(14);
        doc.save();
        doc.roundedRect(marginLeft + 16, doc.y, 38, 10, 2).fill(prColor);
        doc.fontSize(6).fillColor(COLORS.white).font("Helvetica-Bold");
        doc.text(priority.toUpperCase(), marginLeft + 18, doc.y + 2, { width: 34, align: "center" });
        doc.fontSize(8).fillColor("#334155").font("Helvetica");
        doc.text(label, marginLeft + 60, doc.y, { width: contentWidth - 60, lineGap: 2 });
        doc.restore();
        doc.y += 4;
      }
      doc.y += 2;
    }

    if (remediation.length > 0) {
      const filteredSteps = remediation
        .map((step: any) => typeof step === "string" ? step : step.action || step.description || "")
        .filter((label: string) => label && label.trim());
      if (filteredSteps.length > 0) {
        ensureSpace(20);
        doc.fontSize(9.5).fillColor(COLORS.primary).font("Helvetica-Bold");
        doc.text("Remediation Steps", marginLeft + 8, doc.y, { width: contentWidth - 8 });
        doc.y += 4;
        for (let si = 0; si < Math.min(filteredSteps.length, 10); si++) {
          ensureSpace(14);
          doc.save();
          doc.circle(marginLeft + 22, doc.y + 4, 7).fill(brandColor);
          doc.fontSize(7).fillColor(COLORS.white).font("Helvetica-Bold");
          doc.text(String(si + 1), marginLeft + 17, doc.y + 1, { width: 10, align: "center" });
          doc.fontSize(8).fillColor("#334155").font("Helvetica");
          doc.text(filteredSteps[si], marginLeft + 36, doc.y, { width: contentWidth - 36, lineGap: 2 });
          doc.restore();
          doc.y += 4;
        }
      }
    }
  }

  writePageFooter();
  doc.end();
  return doc;
}

export async function generateIRReportDOCX(data: IRReportData): Promise<Buffer> {
  const { investigation: inv, tenant } = data;
  const brandName = tenant.name || "SecureOps";
  const severity = (inv.incidentSeverity || "medium").toLowerCase();
  const docId = `IR-${inv.id}-${Date.now().toString(36).toUpperCase()}`;

  const verdictLabel = inv.verdict === "true_positive" ? "True Positive (Confirmed Threat)" :
    inv.verdict === "false_positive" ? "False Positive (Benign Activity)" : "Inconclusive (Requires Further Analysis)";

  const children: Paragraph[] = [];

  children.push(new Paragraph({
    children: [new TextRun({ text: brandName.toUpperCase(), bold: true, size: 20, color: "94a3b8", font: "Calibri" })],
    spacing: { after: 100 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({ text: "INCIDENT RESPONSE REPORT", size: 18, color: "3b82f6", font: "Calibri" })],
    spacing: { after: 400 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({ text: inv.incidentTitle || `Incident #${inv.incidentId}`, bold: true, size: 48, color: "1e293b", font: "Calibri" })],
    heading: HeadingLevel.TITLE,
    spacing: { after: 200 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({ text: `Investigation #${inv.id}  |  ${formatDate(inv.startedAt)}  |  Document: ${docId}`, size: 20, color: "64748b" })],
    spacing: { after: 100 },
  }));

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      createMetaRow("Severity", severity.toUpperCase()),
      createMetaRow("Verdict", verdictLabel),
      createMetaRow("Risk Score", `${inv.riskScore || "N/A"}/100`),
      createMetaRow("Confidence", `${inv.confidenceScore || "N/A"}%`),
      createMetaRow("Tenant", brandName),
      createMetaRow("Classification", "CONFIDENTIAL"),
    ],
  });
  children.push(new Paragraph({ spacing: { before: 200 } }));

  children.push(new Paragraph({
    children: [new TextRun({ text: "1. Executive Summary", bold: true, size: 28, color: "1e293b" })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" } },
  }));
  addMarkdownContent(children, inv.executiveSummary || "No executive summary available.");

  children.push(new Paragraph({
    children: [new TextRun({ text: "2. AI Verdict & Classification", bold: true, size: 28, color: "1e293b" })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" } },
  }));
  addKeyValue(children, "Verdict", verdictLabel);
  addKeyValue(children, "Risk Score", `${inv.riskScore || "N/A"}/100`);
  addKeyValue(children, "Confidence", `${inv.confidenceScore || "N/A"}%`);
  if (inv.verdictReasoning) addMarkdownContent(children, inv.verdictReasoning);

  if (inv.attackChain && inv.attackChain.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: "3. Attack Chain Analysis", bold: true, size: 28, color: "1e293b" })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" } },
    }));
    for (const phase of inv.attackChain) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `▸ ${phase.phase}`, bold: true, size: 22, color: "3b82f6" })],
        spacing: { before: 150, after: 80 },
      }));
      addMarkdownContent(children, phase.description, 360);
    }
  }

  if (inv.iocsSummary && inv.iocsSummary.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: "4. Indicators of Compromise", bold: true, size: 28, color: "1e293b" })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" } },
    }));

    const iocRows = [
      new TableRow({
        children: [
          createHeaderCell("Type"),
          createHeaderCell("Value"),
          createHeaderCell("Reputation"),
          createHeaderCell("Context"),
        ],
      }),
    ];

    for (const ioc of inv.iocsSummary.slice(0, 20)) {
      iocRows.push(new TableRow({
        children: [
          createDataCell(ioc.type || ""),
          createDataCell(ioc.value || ""),
          createDataCell((ioc.reputation || "").toUpperCase(), ioc.reputation === "malicious" ? "dc2626" : ioc.reputation === "suspicious" ? "d97706" : "16a34a"),
          createDataCell(ioc.context || ""),
        ],
      }));
    }

    children.push(new Paragraph({ spacing: { before: 100 } }));
    children.push(new Paragraph({ spacing: { after: 100 } }));
  }

  if (inv.affectedEntities && inv.affectedEntities.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: "5. Affected Entities", bold: true, size: 28, color: "1e293b" })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" } },
    }));
    for (const entity of inv.affectedEntities.slice(0, 15)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `• ${entity.type || "Entity"}: ${entity.value || entity.name || "Unknown"}${entity.context ? ` (${entity.context})` : ""}`, size: 20, color: "475569" })],
        spacing: { after: 60 },
        indent: { left: 360 },
      }));
    }
  }

  if (inv.technicalReport) {
    children.push(new Paragraph({
      children: [new TextRun({ text: "6. Technical Analysis", bold: true, size: 28, color: "1e293b" })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" } },
    }));
    const sections = parseMarkdownSections(inv.technicalReport);
    if (sections.length > 0) {
      for (const section of sections) {
        if (section.heading) {
          children.push(new Paragraph({
            children: [new TextRun({ text: section.heading, bold: true, size: 22, color: "1e293b" })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          }));
        }
        if (section.content) addMarkdownContent(children, section.content, 0);
      }
    } else {
      addMarkdownContent(children, inv.technicalReport);
    }
  }

  const recs = inv.recommendations;
  if (recs) {
    children.push(new Paragraph({
      children: [new TextRun({ text: "7. Recommendations", bold: true, size: 28, color: "1e293b" })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" } },
    }));

    const containment = recs.containmentActions || recs.containment || [];
    if (containment.length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: "Containment Actions", bold: true, size: 22, color: "1e293b" })],
        spacing: { before: 150, after: 80 },
      }));
      for (const action of containment.slice(0, 10)) {
        const label = typeof action === "string" ? action : action.action || action.description || "";
        const priority = typeof action === "object" ? (action.priority || "medium") : "medium";
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `[${priority.toUpperCase()}] `, bold: true, size: 18, color: priority === "critical" ? "dc2626" : priority === "high" ? "ea580c" : "64748b" }),
            new TextRun({ text: label, size: 18, color: "475569" }),
          ],
          spacing: { after: 60 },
          indent: { left: 360 },
        }));
      }
    }
  }

  children.push(new Paragraph({ spacing: { before: 600 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: "CONFIDENTIAL - INTERNAL USE ONLY", bold: true, size: 16, color: "94a3b8" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `${docId}  |  © ${new Date().getFullYear()} ${brandName}  |  Generated by SecureOps AI Analyst`, size: 14, color: "94a3b8" })],
    alignment: AlignmentType.CENTER,
  }));

  const document = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1000, bottom: 800, left: 900, right: 900 },
        },
      },
      children: [metaTable, ...children],
    }],
  });

  return await Packer.toBuffer(document);
}

function createMetaRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18, color: "1e293b" })] })],
        width: { size: 30, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: "f1f5f9" },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
        },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: value, size: 18, color: "475569" })] })],
        width: { size: 70, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
        },
      }),
    ],
  });
}

function createHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 16, color: "ffffff" })] })],
    shading: { type: ShadingType.CLEAR, fill: "1e293b" },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "1e293b" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "1e293b" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "1e293b" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "1e293b" },
    },
  });
}

function createDataCell(text: string, color?: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, size: 16, color: color || "475569" })] })],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
    },
  });
}

function addKeyValue(children: Paragraph[], key: string, value: string) {
  children.push(new Paragraph({
    children: [
      new TextRun({ text: `${key}: `, bold: true, size: 20, color: "1e293b" }),
      new TextRun({ text: value, size: 20, color: "475569" }),
    ],
    spacing: { after: 80 },
  }));
}

function addMarkdownContent(children: Paragraph[], text: string, indent = 0) {
  if (!text) return;
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      const content = trimmed.replace(/^[-*•]\s+/, "");
      const runs: TextRun[] = [];
      parseInlineMarkdown(content, runs);
      children.push(new Paragraph({
        children: [new TextRun({ text: "• ", size: 18, color: "475569" }), ...runs],
        spacing: { after: 40 },
        indent: { left: indent + 360 },
      }));
    } else {
      const runs: TextRun[] = [];
      parseInlineMarkdown(trimmed, runs);
      children.push(new Paragraph({
        children: runs,
        spacing: { after: 60 },
        indent: { left: indent },
      }));
    }
  }
}

function parseInlineMarkdown(text: string, runs: TextRun[]) {
  let remaining = text;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    let firstMatch: { type: string; match: RegExpMatchArray; index: number } | null = null;
    if (boldMatch?.index !== undefined) firstMatch = { type: "bold", match: boldMatch, index: boldMatch.index };
    if (codeMatch?.index !== undefined && (!firstMatch || codeMatch.index < firstMatch.index)) {
      firstMatch = { type: "code", match: codeMatch, index: codeMatch.index };
    }

    if (!firstMatch) {
      runs.push(new TextRun({ text: remaining, size: 18, color: "475569" }));
      break;
    }

    if (firstMatch.index > 0) {
      runs.push(new TextRun({ text: remaining.slice(0, firstMatch.index), size: 18, color: "475569" }));
    }

    if (firstMatch.type === "bold") {
      runs.push(new TextRun({ text: firstMatch.match[1], bold: true, size: 18, color: "1e293b" }));
    } else {
      runs.push(new TextRun({ text: firstMatch.match[1], size: 16, color: "ea580c", font: "Courier New" }));
    }

    remaining = remaining.slice(firstMatch.index + firstMatch.match[0].length);
  }
}
