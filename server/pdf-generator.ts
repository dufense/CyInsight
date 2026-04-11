import PDFDocument from "pdfkit";

const COLORS = {
  primary: "#1e293b",
  primaryDark: "#0f172a",
  accent: "#3b82f6",
  accentLight: "#93bbf3",
  accentDark: "#2563eb",
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#16a34a",
  muted: "#64748b",
  mutedLight: "#94a3b8",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  bgLight: "#f1f5f9",
  bgLighter: "#f8fafc",
  white: "#ffffff",
  black: "#0f172a",
};

function sevColor(severity: string): string {
  const s = (severity || "").toLowerCase();
  if (s === "critical") return COLORS.critical;
  if (s === "high") return COLORS.high;
  if (s === "medium") return COLORS.medium;
  if (s === "low") return COLORS.low;
  return COLORS.muted;
}

function ragColor(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "red") return COLORS.critical;
  if (s === "amber") return COLORS.medium;
  return COLORS.low;
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatPeriod(period: string): string {
  return (period || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(text: string, max: number): string {
  if (!text) return "";
  return text.length > max ? text.substring(0, max - 3) + "..." : text;
}

class ReportPDFBuilder {
  private doc: PDFKit.PDFDocument;
  private pageWidth = 595.28;
  private pageHeight = 841.89;
  private marginLeft = 50;
  private marginRight = 50;
  private marginTop = 70;
  private marginBottom = 70;
  private contentWidth: number;
  private brandName: string;
  private tenantName: string;
  private reportTitle: string;
  private classification: string;
  private documentId: string;
  private sectionCounter = 0;
  private accentColor: string;
  private logoBuffer: Buffer | null;

  constructor(brandName: string, tenantName: string, reportTitle: string, classification: string, documentId: string, brandColor?: string | null, logoBuffer?: Buffer | null) {
    this.brandName = brandName;
    this.tenantName = tenantName;
    this.reportTitle = reportTitle;
    this.classification = classification;
    this.documentId = documentId;
    this.accentColor = brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : COLORS.accent;
    this.logoBuffer = logoBuffer ?? null;
    this.contentWidth = this.pageWidth - this.marginLeft - this.marginRight;

    this.doc = new PDFDocument({
      size: "A4",
      margins: { top: this.marginTop, bottom: 10, left: this.marginLeft, right: this.marginRight },
      autoFirstPage: false,
      info: {
        Title: reportTitle,
        Author: brandName,
        Subject: "Security Report",
        Creator: brandName,
      },
    });
    this.pageNum = 0;
  }

  private pageNum: number = 0;

  getDocument(): PDFKit.PDFDocument {
    return this.doc;
  }

  private writePageHeader() {
    if (this.pageNum <= 1) return;
    this.doc.save();
    this.doc.rect(0, 0, this.pageWidth, 45).fill(COLORS.primaryDark);
    this.doc.rect(0, 0, 4, 45).fill(this.accentColor);
    // Embed logo in upper-right of page header if available
    if (this.logoBuffer) {
      try {
        this.doc.image(this.logoBuffer, this.pageWidth - this.marginLeft - 45, 8, { fit: [40, 28], align: "right" });
      } catch {}
    }
    this.doc.fontSize(7).fillColor(COLORS.white).font("Helvetica-Bold");
    this.doc.text(this.brandName.toUpperCase(), this.marginLeft + 6, 16, { width: this.contentWidth / 3, align: "left", lineBreak: false, characterSpacing: 1 });
    this.doc.fontSize(7).fillColor(COLORS.mutedLight).font("Helvetica");
    this.doc.text(this.reportTitle, this.marginLeft + this.contentWidth / 3, 16, { width: this.contentWidth / 3, align: "center", lineBreak: false });
    this.doc.fontSize(6).fillColor(this.accentColor);
    this.doc.text(`PAGE ${this.pageNum}`, this.marginLeft + (this.contentWidth * 2 / 3), 16, { width: this.contentWidth / 3 - (this.logoBuffer ? 50 : 0), align: "right", lineBreak: false, characterSpacing: 1 });
    this.doc.rect(0, 45, this.pageWidth, 2).fill(this.accentColor);
    this.doc.restore();
  }

  private writePageFooter() {
    this.doc.save();
    const footerY = this.pageHeight - 38;
    this.doc.rect(0, footerY - 2, this.pageWidth, 40).fill(COLORS.primaryDark);
    this.doc.rect(0, footerY - 2, 4, 40).fill(this.accentColor);
    this.doc.rect(0, footerY - 2, this.pageWidth, 2).fill(this.accentColor);
    this.doc.fontSize(6).fillColor(COLORS.mutedLight).font("Helvetica-Bold");
    this.doc.text("CONFIDENTIAL - INTERNAL USE ONLY", this.marginLeft, footerY + 6, { width: this.contentWidth, align: "center", characterSpacing: 1.5 });
    this.doc.fontSize(5.5).fillColor(COLORS.muted).font("Helvetica");
    this.doc.text(`${this.documentId}  |  \u00A9 ${new Date().getFullYear()} ${this.brandName}`, this.marginLeft, footerY + 17, { width: this.contentWidth, align: "center" });
    this.doc.restore();
  }

  private addPage() {
    if (this.pageNum > 0) {
      this.writePageFooter();
    }
    this.doc.addPage();
    this.pageNum++;
    this.writePageHeader();
    this.doc.y = this.pageNum <= 1 ? this.marginTop : this.marginTop + 10;
  }

  private get usableBottom(): number {
    return this.pageHeight - this.marginBottom - 30;
  }

  private ensureSpace(needed: number) {
    if (this.doc.y + needed > this.usableBottom) {
      this.addPage();
    }
  }

  private newPage() {
    this.addPage();
  }

  private nextSection(): string {
    this.sectionCounter++;
    return String(this.sectionCounter).padStart(2, "0");
  }

  private drawLine(y: number, width: number, color: string, thickness = 1) {
    this.doc.save();
    this.doc.strokeColor(color).lineWidth(thickness);
    this.doc.moveTo(this.marginLeft, y).lineTo(this.marginLeft + width, y).stroke();
    this.doc.restore();
  }

  private sectionHeading(title: string, subtitle?: string) {
    this.ensureSpace(subtitle ? 50 : 40);
    const num = this.nextSection();
    const barHeight = subtitle ? 38 : 30;
    const y = this.doc.y;

    this.doc.save();
    this.doc.rect(0, y, this.pageWidth, barHeight).fill(COLORS.primaryDark);
    this.doc.rect(0, y, 4, barHeight).fill(this.accentColor);
    this.doc.rect(0, y + barHeight, this.pageWidth, 2).fill(this.accentColor);

    this.doc.fontSize(8).fillColor(this.accentColor).font("Helvetica-Bold");
    this.doc.text(num, this.marginLeft, y + (subtitle ? 8 : 9), { lineBreak: false, characterSpacing: 1 });

    this.doc.fontSize(11).fillColor(COLORS.white).font("Helvetica-Bold");
    this.doc.text(title.toUpperCase(), this.marginLeft + 28, y + (subtitle ? 7 : 9), { width: this.contentWidth - 28, characterSpacing: 0.8, lineBreak: false });

    if (subtitle) {
      this.doc.fontSize(7.5).fillColor(COLORS.mutedLight).font("Helvetica");
      this.doc.text(subtitle, this.marginLeft + 28, y + 22, { width: this.contentWidth - 28, lineBreak: false });
    }

    this.doc.restore();
    this.doc.y = y + barHeight + 14;
  }

  private bodyText(text: string, maxWords = 200) {
    if (!text) return;
    let words = text.split(/\s+/);
    if (words.length > maxWords) {
      words = words.slice(0, maxWords);
      text = words.join(" ") + "...";
    }
    const paragraphs = text.split("\n\n").filter(p => p.trim());
    paragraphs.forEach(p => {
      const trimmed = p.trim();
      this.doc.fontSize(9).fillColor("#334155").font("Helvetica");
      const h = this.doc.heightOfString(trimmed, { width: this.contentWidth, lineGap: 3 });
      this.ensureSpace(h + 8);
      this.doc.text(trimmed, this.marginLeft, this.doc.y, {
        width: this.contentWidth,
        lineGap: 3,
      });
      this.doc.y += 4;
    });
  }

  private subHeading(text: string) {
    this.ensureSpace(24);
    const y = this.doc.y;
    this.doc.save();
    this.doc.rect(this.marginLeft, y, 3, 14).fill(this.accentColor);
    this.doc.fontSize(10).fillColor(COLORS.primary).font("Helvetica-Bold");
    this.doc.text(text, this.marginLeft + 10, y + 1, { width: this.contentWidth - 10, lineBreak: false });
    this.doc.font("Helvetica");
    this.doc.restore();
    this.doc.y = y + 20;
  }

  private drawCompactTable(headers: string[], rows: string[][], colWidths: number[], maxRows = 20) {
    const cellPadding = 5;
    const headerHeight = 22;
    const rowHeight = 18;
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const displayRows = rows.slice(0, maxRows);

    this.ensureSpace(headerHeight + rowHeight * Math.min(displayRows.length, 3) + 5);

    let y = this.doc.y;
    let x = this.marginLeft;

    this.doc.save();
    this.doc.roundedRect(x - 0.5, y - 0.5, tableWidth + 1, headerHeight + 1, 3).fill(COLORS.primaryDark);
    this.doc.rect(x - 0.5, y - 0.5, 3, headerHeight + 1).fill(this.accentColor);
    headers.forEach((h, i) => {
      this.doc.fontSize(7).fillColor(COLORS.white).font("Helvetica-Bold");
      this.doc.text(h.toUpperCase(), x + cellPadding, y + 6, { width: colWidths[i] - cellPadding * 2, align: "left", lineBreak: false, characterSpacing: 0.5 });
      x += colWidths[i];
    });
    this.doc.restore();

    y += headerHeight;

    this.doc.save();
    this.doc.strokeColor(COLORS.borderLight).lineWidth(0.3);
    this.doc.roundedRect(this.marginLeft, y, tableWidth, displayRows.length * rowHeight, 0).stroke();
    this.doc.restore();

    displayRows.forEach((row, ri) => {
      if (y + rowHeight > this.usableBottom) {
        this.addPage();
        y = this.marginTop + 10;
        x = this.marginLeft;
        this.doc.save();
        this.doc.roundedRect(x - 0.5, y - 0.5, tableWidth + 1, headerHeight + 1, 3).fill(COLORS.primaryDark);
        this.doc.rect(x - 0.5, y - 0.5, 3, headerHeight + 1).fill(this.accentColor);
        headers.forEach((h, i) => {
          this.doc.fontSize(7).fillColor(COLORS.white).font("Helvetica-Bold");
          this.doc.text(h.toUpperCase(), x + cellPadding, y + 6, { width: colWidths[i] - cellPadding * 2, align: "left", lineBreak: false, characterSpacing: 0.5 });
          x += colWidths[i];
        });
        this.doc.restore();
        y += headerHeight;
      }

      const bgColor = ri % 2 === 0 ? COLORS.white : COLORS.bgLighter;
      x = this.marginLeft;
      this.doc.save();
      this.doc.rect(x, y, tableWidth, rowHeight).fill(bgColor);
      row.forEach((cell, ci) => {
        this.doc.fontSize(7.5).fillColor(COLORS.primary).font("Helvetica");
        const cellText = truncate(cell || "", 90);
        this.doc.text(cellText, x + cellPadding, y + 4, { width: colWidths[ci] - cellPadding * 2, lineBreak: false });
        x += colWidths[ci];
      });
      this.doc.restore();

      if (ri < displayRows.length - 1) {
        this.doc.save();
        this.doc.strokeColor(COLORS.borderLight).lineWidth(0.3);
        this.doc.moveTo(this.marginLeft, y + rowHeight).lineTo(this.marginLeft + tableWidth, y + rowHeight).stroke();
        this.doc.restore();
      }

      y += rowHeight;
    });

    this.doc.y = y + 8;
  }

  private drawSummaryStatBar(stats: { label: string; value: string; subtitle?: string }[]) {
    const barHeight = 50;
    this.ensureSpace(barHeight + 8);
    const y = this.doc.y;
    const statWidth = this.contentWidth / stats.length;

    this.doc.save();
    this.doc.roundedRect(this.marginLeft, y, this.contentWidth, barHeight, 4).fill(COLORS.bgLight);
    this.doc.strokeColor(COLORS.border).lineWidth(0.5);
    this.doc.roundedRect(this.marginLeft, y, this.contentWidth, barHeight, 4).stroke();

    stats.forEach((stat, i) => {
      const x = this.marginLeft + i * statWidth;

      if (i > 0) {
        this.doc.strokeColor(COLORS.border).lineWidth(0.3);
        this.doc.moveTo(x, y + 8).lineTo(x, y + barHeight - 8).stroke();
      }

      this.doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica-Bold");
      this.doc.text(stat.label.toUpperCase(), x + 12, y + 8, { width: statWidth - 24, characterSpacing: 0.5 });
      this.doc.fontSize(14).fillColor(COLORS.primary).font("Helvetica-Bold");
      this.doc.text(stat.value, x + 12, y + 20, { width: statWidth - 24 });
      if (stat.subtitle) {
        this.doc.fontSize(6.5).fillColor(COLORS.muted).font("Helvetica");
        this.doc.text(stat.subtitle, x + 12, y + 37, { width: statWidth - 24 });
      }
    });

    this.doc.restore();
    this.doc.y = y + barHeight + 10;
  }

  private drawMetricCard(x: number, y: number, width: number, height: number, label: string, value: string, trend: string, color: string, index?: number) {
    this.doc.save();
    this.doc.roundedRect(x, y, width, height, 4).fill(COLORS.white);
    this.doc.strokeColor(COLORS.border).lineWidth(0.5);
    this.doc.roundedRect(x, y, width, height, 4).stroke();
    this.doc.rect(x, y, 3, height).fill(color);

    if (index != null) {
      this.doc.fontSize(14).fillColor(COLORS.borderLight).font("Helvetica-Bold");
      this.doc.text(String(index + 1).padStart(2, "0"), x + width - 28, y + 4, { width: 22, align: "right", lineBreak: false });
    }

    this.doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica-Bold");
    this.doc.text(truncate(label, 30).toUpperCase(), x + 12, y + 7, { width: width - 40, characterSpacing: 0.3 });

    this.doc.fontSize(18).fillColor(COLORS.primary).font("Helvetica-Bold");
    this.doc.text(String(value), x + 12, y + 20, { width: width - 20 });

    if (trend) {
      this.doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica");
      this.doc.text(truncate(trend, 25), x + 12, y + 40, { width: width - 20 });
    }

    this.doc.restore();
  }

  private drawNumberedCards(items: { title: string; description: string }[], cols = 4) {
    const cardWidth = (this.contentWidth - (cols - 1) * 8) / cols;
    const cardHeight = 65;

    for (let row = 0; row < Math.ceil(items.length / cols); row++) {
      this.ensureSpace(cardHeight + 8);
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (idx >= items.length) break;
        const item = items[idx];
        const x = this.marginLeft + col * (cardWidth + 8);
        const y = this.doc.y;
        const num = String(idx + 1).padStart(2, "0");

        this.doc.save();
        this.doc.roundedRect(x, y, cardWidth, cardHeight, 4).fill(COLORS.white);
        this.doc.strokeColor(COLORS.border).lineWidth(0.5);
        this.doc.roundedRect(x, y, cardWidth, cardHeight, 4).stroke();
        this.doc.rect(x, y, cardWidth, 3).fill(this.accentColor);

        this.doc.fontSize(14).fillColor(this.accentColor).font("Helvetica-Bold");
        this.doc.text(num, x + 8, y + 8, { width: cardWidth - 16 });

        this.doc.fontSize(7.5).fillColor(COLORS.primary).font("Helvetica-Bold");
        this.doc.text(truncate(item.title, 30), x + 8, y + 26, { width: cardWidth - 16, lineBreak: false });

        this.doc.fontSize(6.5).fillColor(COLORS.muted).font("Helvetica");
        this.doc.text(truncate(item.description, 60), x + 8, y + 38, { width: cardWidth - 16, lineGap: 1.5 });

        this.doc.restore();
      }
      this.doc.y += cardHeight + 8;
    }
  }

  private drawRAGIndicator(x: number, y: number, width: number, area: string, status: string, score: number, detail: string) {
    const color = ragColor(status);
    this.doc.save();

    this.doc.roundedRect(x, y - 2, width, 16, 3).fill(COLORS.bgLighter);
    this.doc.strokeColor(COLORS.borderLight).lineWidth(0.3);
    this.doc.roundedRect(x, y - 2, width, 16, 3).stroke();
    this.doc.rect(x, y - 2, 4, 16).fill(color);

    this.doc.fontSize(8).fillColor(COLORS.primary).font("Helvetica-Bold");
    this.doc.text(area, x + 12, y + 1, { width: width - 60 });

    this.doc.fontSize(9).fillColor(color).font("Helvetica-Bold");
    this.doc.text(String(score), x + width - 35, y + 1, { width: 30, align: "right" });

    this.doc.restore();
  }

  writeCoverPage(report: any, reportTypeLabel: string, documentControl: any) {
    this.doc.addPage();
    this.pageNum = 1;

    this.doc.rect(0, 0, this.pageWidth, 6).fill(this.accentColor);

    this.doc.rect(0, 6, this.pageWidth, 80).fill(COLORS.primaryDark);

    // Embed tenant logo in header if available
    if (this.logoBuffer) {
      try {
        this.doc.image(this.logoBuffer, this.marginLeft + this.contentWidth - 65, 14, { fit: [60, 50], align: "right" });
      } catch {}
    }

    this.doc.fontSize(8).fillColor(this.accentColor).font("Helvetica-Bold");
    this.doc.text(this.brandName.toUpperCase(), this.marginLeft, 26, { characterSpacing: 3, width: this.contentWidth / 2 });
    this.doc.fontSize(7).fillColor(COLORS.mutedLight).font("Helvetica");
    this.doc.text("MANAGED SECURITY SERVICES", this.marginLeft, 38, { characterSpacing: 2, width: this.contentWidth / 2 });

    this.doc.fontSize(7).fillColor(this.accentColor).font("Helvetica-Bold");
    this.doc.text("CONFIDENTIAL", this.marginLeft + this.contentWidth / 2, 26, { width: this.contentWidth / 2, align: "right", characterSpacing: 1.5 });
    this.doc.fontSize(6).fillColor(COLORS.mutedLight).font("Helvetica");
    this.doc.text("Internal Use Only", this.marginLeft + this.contentWidth / 2, 38, { width: this.contentWidth / 2, align: "right" });

    this.doc.y = 130;

    this.doc.fontSize(10).fillColor(this.accentColor).font("Helvetica-Bold");
    this.doc.text(reportTypeLabel.toUpperCase(), this.marginLeft, this.doc.y, { characterSpacing: 3, width: this.contentWidth });
    this.doc.y += 20;

    this.doc.fontSize(26).fillColor(COLORS.primary).font("Helvetica-Bold");
    this.doc.text(report.title || "Security Report", this.marginLeft, this.doc.y, { width: this.contentWidth, lineGap: 3 });
    this.doc.font("Helvetica");
    this.doc.y += 10;

    this.doc.rect(this.marginLeft, this.doc.y, 60, 3).fill(this.accentColor);
    this.doc.y += 16;

    this.doc.fontSize(11).fillColor(COLORS.muted);
    this.doc.text(`Prepared for ${this.tenantName}`, this.marginLeft, this.doc.y, { width: this.contentWidth });
    this.doc.y += 40;

    const metaCards = [
      { label: "REPORT PERIOD", value: formatPeriod(report.period || "last_month") },
      { label: "DATE OF ISSUE", value: formatDate(report.createdAt) },
      { label: "DOCUMENT ID", value: documentControl.documentId || "N/A" },
      { label: "VERSION", value: documentControl.version || "1.0" },
    ];

    const cardWidth = (this.contentWidth - 24) / 4;
    const cardHeight = 55;

    metaCards.forEach((card, i) => {
      const x = this.marginLeft + i * (cardWidth + 8);
      const y = this.doc.y;

      this.doc.save();
      this.doc.roundedRect(x, y, cardWidth, cardHeight, 4).fill(COLORS.bgLight);
      this.doc.strokeColor(COLORS.border).lineWidth(0.5);
      this.doc.roundedRect(x, y, cardWidth, cardHeight, 4).stroke();
      this.doc.rect(x, y, cardWidth, 3).fill(this.accentColor);

      this.doc.fontSize(6.5).fillColor(COLORS.muted).font("Helvetica-Bold");
      this.doc.text(card.label, x + 8, y + 10, { width: cardWidth - 16, characterSpacing: 0.8 });
      this.doc.fontSize(10).fillColor(COLORS.primary).font("Helvetica-Bold");
      this.doc.text(truncate(card.value, 20), x + 8, y + 26, { width: cardWidth - 16 });
      this.doc.restore();
    });

    this.doc.y += cardHeight + 10;

    this.doc.y = this.pageHeight - 130;
    this.doc.save();
    this.doc.roundedRect(this.marginLeft, this.doc.y, this.contentWidth, 55, 4).fill(COLORS.bgLighter);
    this.doc.strokeColor(COLORS.border).lineWidth(0.5);
    this.doc.roundedRect(this.marginLeft, this.doc.y, this.contentWidth, 55, 4).stroke();
    this.doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica-Bold");
    this.doc.text("CONFIDENTIALITY NOTICE", this.marginLeft + 12, this.doc.y + 8, { characterSpacing: 1.5, width: this.contentWidth - 24 });
    this.doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica");
    this.doc.text(
      "This document contains confidential and proprietary information. Unauthorized review, dissemination, distribution, or copying is strictly prohibited.",
      this.marginLeft + 12, this.doc.y + 22, { width: this.contentWidth - 24, lineGap: 2 }
    );
    this.doc.restore();

    this.doc.y += 65;
    this.doc.fontSize(10).fillColor(COLORS.primary).font("Helvetica-Bold");
    this.doc.text(this.brandName, this.marginLeft, this.doc.y);
    this.doc.fontSize(9).fillColor(COLORS.muted).font("Helvetica");
    this.doc.text("Managed Security Services", this.marginLeft + this.contentWidth - 150, this.doc.y, { width: 150, align: "right" });
  }

  writeTableOfContents(tocItems: { title: string; section: string }[]) {
    this.newPage();
    this.sectionHeading("Table of Contents", "Document navigation and section overview");
    this.sectionCounter--;

    const itemHeight = 20;
    tocItems.forEach((item, i) => {
      this.ensureSpace(itemHeight);
      const y = this.doc.y;
      const num = String(i + 1).padStart(2, "0");

      this.doc.save();
      if (i % 2 === 0) {
        this.doc.roundedRect(this.marginLeft, y, this.contentWidth, itemHeight - 2, 2).fill(COLORS.bgLighter);
      }

      this.doc.fontSize(8).fillColor(this.accentColor).font("Helvetica-Bold");
      this.doc.text(num, this.marginLeft + 8, y + 5, { lineBreak: false });

      this.doc.fontSize(9).fillColor(COLORS.primary).font("Helvetica");
      this.doc.text(item.title, this.marginLeft + 30, y + 5, { width: this.contentWidth - 80 });

      this.doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica");
      this.doc.text(item.section, this.marginLeft + this.contentWidth - 45, y + 5, { width: 40, align: "right" });

      this.doc.strokeColor(COLORS.borderLight).lineWidth(0.3);
      this.doc.moveTo(this.marginLeft + 30, y + itemHeight - 4).lineTo(this.marginLeft + this.contentWidth - 50, y + itemHeight - 4).dash(1, { space: 2 }).stroke().undash();

      this.doc.restore();
      this.doc.y = y + itemHeight;
    });
  }

  writeExecutiveSummaryPage(summary: string, managementSummary: any, keyHighlights: any[]) {
    this.newPage();
    this.sectionHeading("Executive Summary", "Strategic overview and key risk indicators");

    const riskRating = (managementSummary.overallRiskRating || "medium").toUpperCase();
    const riskScore = managementSummary.overallRiskScore || 0;
    const prevScore = managementSummary.previousRiskScore;
    const trend = managementSummary.riskTrend || "stable";
    const trendSymbol = trend === "increasing" ? "\u25B2" : trend === "decreasing" ? "\u25BC" : "\u2014";

    this.ensureSpace(60);
    const riskY = this.doc.y;
    const riskColor = sevColor(managementSummary.overallRiskRating || "medium");

    this.doc.save();
    this.doc.roundedRect(this.marginLeft, riskY, this.contentWidth, 50, 4).fill(COLORS.bgLighter);
    this.doc.strokeColor(COLORS.border).lineWidth(0.5);
    this.doc.roundedRect(this.marginLeft, riskY, this.contentWidth, 50, 4).stroke();
    this.doc.rect(this.marginLeft, riskY, 4, 50).fill(riskColor);

    this.doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica-Bold");
    this.doc.text("OVERALL RISK RATING", this.marginLeft + 16, riskY + 8, { characterSpacing: 1 });

    this.doc.fontSize(24).fillColor(riskColor).font("Helvetica-Bold");
    this.doc.text(String(riskScore), this.marginLeft + 16, riskY + 20);

    this.doc.fontSize(10).fillColor(riskColor).font("Helvetica-Bold");
    this.doc.text(riskRating, this.marginLeft + 55, riskY + 27);

    if (prevScore != null) {
      this.doc.fontSize(7).fillColor(COLORS.muted).font("Helvetica");
      this.doc.text(`${trendSymbol} Previous: ${prevScore} (${trend})`, this.marginLeft + 130, riskY + 28);
    }
    this.doc.restore();
    this.doc.y = riskY + 60;

    this.bodyText(summary, 150);
    this.doc.y += 4;

    if (keyHighlights?.length > 0) {
      this.subHeading("Key Performance Indicators");
      const kpis = keyHighlights.slice(0, 8);
      const cardWidth = (this.contentWidth - 16) / 3;
      const cardHeight = 52;

      for (let row = 0; row < Math.ceil(kpis.length / 3); row++) {
        this.ensureSpace(cardHeight + 8);
        for (let col = 0; col < 3; col++) {
          const idx = row * 3 + col;
          if (idx >= kpis.length) break;
          const kpi = kpis[idx];
          const x = this.marginLeft + col * (cardWidth + 8);
          const trendSym = kpi.trend === "up" ? "\u25B2" : kpi.trend === "down" ? "\u25BC" : "\u2014";
          this.drawMetricCard(x, this.doc.y, cardWidth, cardHeight, kpi.label, String(kpi.value), `${trendSym} ${kpi.trendDetail || ""}`, kpi.trend === "down" ? COLORS.low : kpi.trend === "up" ? COLORS.critical : this.accentColor, idx);
        }
        this.doc.y += cardHeight + 8;
      }
    }

    if (managementSummary.criticalActions?.length) {
      this.ensureSpace(50);
      this.doc.save();
      const caY = this.doc.y;
      const caHeight = 16 + managementSummary.criticalActions.slice(0, 3).length * 14;
      this.doc.roundedRect(this.marginLeft, caY, this.contentWidth, caHeight, 4).fill("#fef2f2");
      this.doc.rect(this.marginLeft, caY, 4, caHeight).fill(COLORS.critical);

      this.doc.fontSize(8).fillColor(COLORS.critical).font("Helvetica-Bold");
      this.doc.text("CRITICAL ACTIONS REQUIRED", this.marginLeft + 14, caY + 6, { characterSpacing: 0.8 });

      let actionY = caY + 20;
      managementSummary.criticalActions.slice(0, 3).forEach((action: string, i: number) => {
        this.doc.fontSize(8).fillColor("#991b1b").font("Helvetica");
        this.doc.text(`${i + 1}. ${truncate(action, 150)}`, this.marginLeft + 14, actionY, { width: this.contentWidth - 28, lineGap: 2 });
        actionY += 14;
      });
      this.doc.restore();
      this.doc.y = caY + caHeight + 8;
    }
  }

  writeIncidentMetrics(managementSummary: any, scorecard: any) {
    this.ensureSpace(120);
    this.sectionHeading("Incident Metrics Dashboard", "Security domain performance and scorecard assessment");

    if (managementSummary.ragStatus?.length > 0) {
      this.subHeading("Security Domain Status (RAG)");
      const ragItems = managementSummary.ragStatus.slice(0, 8);
      const colHeight = 18;

      ragItems.forEach((rag: any) => {
        this.ensureSpace(colHeight + 2);
        this.drawRAGIndicator(this.marginLeft, this.doc.y, this.contentWidth, rag.area || "", rag.status, rag.score || 0, rag.detail || "");
        this.doc.y += colHeight;
      });
      this.doc.y += 8;
    }

    if (scorecard?.categories?.length) {
      this.subHeading("Security Scorecard");

      if (scorecard.overallScore != null) {
        this.drawSummaryStatBar([
          { label: "Overall Score", value: `${scorecard.overallScore}/100`, subtitle: scorecard.previousScore != null ? `Previous: ${scorecard.previousScore}` : undefined },
          { label: "Grade", value: scorecard.overallScore >= 80 ? "A" : scorecard.overallScore >= 60 ? "B" : scorecard.overallScore >= 40 ? "C" : "D" },
          { label: "Categories", value: String(scorecard.categories.length), subtitle: "Assessed" },
        ]);
      }

      this.drawCompactTable(
        ["Category", "Score", "Grade", "Assessment"],
        (scorecard.categories || []).map((cat: any) => [
          cat.name || "", `${cat.score || 0}/${cat.maxScore || 100}`, cat.grade || "N/A", truncate(cat.detail || "", 50),
        ]),
        [110, 55, 35, this.contentWidth - 200],
      );
    }
  }

  writeBusinessImpact(findings: any[], riskMatrix: any[]) {
    this.sectionHeading("Business Impact Overview", "Key findings and organizational risk assessment");

    if (findings?.length > 0) {
      this.subHeading("Top Findings");
      this.drawCompactTable(
        ["ID", "Finding", "Severity", "CVSS", "MITRE"],
        findings.slice(0, 5).map((f: any, i: number) => [
          f.id || `F-${String(i + 1).padStart(3, "0")}`,
          truncate(f.title || "", 50),
          (f.severity || "").toUpperCase(),
          f.cvssScore != null ? String(f.cvssScore) : "N/A",
          truncate(f.mitreTechnique || "N/A", 25),
        ]),
        [35, this.contentWidth - 210, 55, 35, 85],
      );

      const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      findings.forEach((f: any) => {
        const s = (f.severity || "").toLowerCase();
        if (s in sevCounts) (sevCounts as any)[s]++;
      });
      this.drawSummaryStatBar([
        { label: "Total Findings", value: String(findings.length) },
        { label: "Critical", value: String(sevCounts.critical), subtitle: "Immediate action" },
        { label: "High", value: String(sevCounts.high), subtitle: "Priority resolution" },
        { label: "Medium / Low", value: `${sevCounts.medium} / ${sevCounts.low}` },
      ]);
    }

    if (riskMatrix?.length > 0) {
      this.subHeading("Risk Matrix");
      this.drawCompactTable(
        ["Risk", "L", "I", "Residual", "Treatment"],
        riskMatrix.slice(0, 4).map((rm: any) => [
          truncate(rm.risk || "", 40), String(rm.likelihood || ""), String(rm.impact || ""),
          (rm.residualRisk || "").toUpperCase(), truncate(rm.treatmentPlan || "", 50),
        ]),
        [100, 20, 20, 50, this.contentWidth - 190],
      );
    }
  }

  writeResponsePerformance(maturity: any) {
    this.sectionHeading("Response Performance & Maturity", "Operational capability and maturity benchmark");

    if (maturity?.overallMaturity) {
      this.drawSummaryStatBar([
        { label: "Maturity Level", value: maturity.overallMaturity, subtitle: "Current assessment" },
        { label: "Target", value: maturity.targetMaturity || "Optimized" },
        { label: "Domains Assessed", value: String(maturity.domains?.length || 0) },
      ]);
    }

    if (maturity?.domains?.length) {
      this.drawCompactTable(
        ["Domain", "Current", "Target", "Gap", "Assessment"],
        (maturity.domains || []).map((d: any) => {
          const gap = (d.target || 0) - (d.score || 0);
          return [d.domain || "", `${d.score || 0}/5`, `${d.target || 0}/5`, gap > 0 ? `-${gap}` : "0", truncate(d.detail || "", 50)];
        }),
        [70, 45, 45, 30, this.contentWidth - 190],
      );
    }
  }

  writeAnalysisSections(sections: any[]) {
    if (!sections?.length) return;

    this.sectionHeading("Key Analysis", "Detailed technical assessment and insights");

    sections.slice(0, 5).forEach((section: any) => {
      this.ensureSpace(60);
      this.subHeading(section.title || "Analysis");

      if (section.keyInsight) {
        this.ensureSpace(16);
        this.doc.save();
        const insightY = this.doc.y;
        this.doc.roundedRect(this.marginLeft, insightY, this.contentWidth, 14, 2).fill("#eff6ff");
        this.doc.rect(this.marginLeft, insightY, 3, 14).fill(this.accentColor);
        this.doc.fontSize(7.5).fillColor(this.accentColor).font("Helvetica-Bold");
        this.doc.text(`Key Insight: ${truncate(section.keyInsight, 100)}`, this.marginLeft + 10, insightY + 3, { width: this.contentWidth - 20, lineBreak: false });
        this.doc.restore();
        this.doc.y = insightY + 20;
      }

      if (section.content) {
        this.bodyText(section.content, 60);
      }

      if (section.chartData?.length > 0) {
        const data = section.chartData.slice(0, 4);
        const maxVal = Math.max(...data.map((d: any) => d.value || 0), 1);
        const barHeight = 14;
        const barMaxWidth = this.contentWidth * 0.45;

        this.ensureSpace(data.length * (barHeight + 4) + 5);

        data.forEach((d: any) => {
          const barWidth = Math.max(((d.value || 0) / maxVal) * barMaxWidth, 2);
          this.doc.save();
          this.doc.roundedRect(this.marginLeft + 120, this.doc.y, barWidth, barHeight - 2, 3).fill(this.accentColor);
          this.doc.fontSize(7.5).fillColor(COLORS.primary).font("Helvetica");
          this.doc.text(truncate(d.name || "", 25), this.marginLeft, this.doc.y + 2, { width: 115, lineBreak: false });
          this.doc.fontSize(7.5).fillColor(COLORS.white).font("Helvetica-Bold");
          if (barWidth > 25) {
            this.doc.text(String(d.value || 0), this.marginLeft + 124, this.doc.y + 2, { width: barWidth - 8, lineBreak: false });
          } else {
            this.doc.fillColor(COLORS.primary);
            this.doc.text(String(d.value || 0), this.marginLeft + 124 + barWidth, this.doc.y + 2, { lineBreak: false });
          }
          this.doc.restore();
          this.doc.y += barHeight + 2;
        });
        this.doc.y += 4;
      }

      this.doc.y += 4;
    });
  }

  writeRecommendations(recommendations: any[]) {
    if (!recommendations?.length) return;

    this.sectionHeading("Risk Outlook & Recommendations", "Prioritized action items and implementation roadmap");

    this.drawCompactTable(
      ["ID", "Recommendation", "Priority", "Effort", "Timeline", "Related"],
      recommendations.slice(0, 5).map((r: any, i: number) => [
        r.id || `R-${String(i + 1).padStart(3, "0")}`,
        truncate(r.title || "", 45),
        (r.priority || "").toUpperCase(),
        r.effort || "",
        r.timeline || "",
        r.relatedFinding || "",
      ]),
      [35, this.contentWidth - 230, 50, 40, 60, 45],
    );

    const prioCount = { critical: 0, high: 0, medium: 0 };
    recommendations.forEach((r: any) => {
      const p = (r.priority || "").toLowerCase();
      if (p in prioCount) (prioCount as any)[p]++;
    });
    this.drawSummaryStatBar([
      { label: "Total Recommendations", value: String(recommendations.length) },
      { label: "Critical Priority", value: String(prioCount.critical) },
      { label: "High Priority", value: String(prioCount.high) },
      { label: "Medium Priority", value: String(prioCount.medium) },
    ]);

    recommendations.slice(0, 5).forEach((r: any) => {
      if (r.description) {
        this.ensureSpace(14);
        this.doc.fontSize(7).fillColor(COLORS.primary).font("Helvetica");
        const desc = `${r.id || ""}: ${truncate(r.description || "", 100)}`;
        this.doc.text(desc, this.marginLeft, this.doc.y, { width: this.contentWidth, lineBreak: false });
        this.doc.y += 1;
      }
    });
  }

  writeCompliance(complianceMapping: any[]) {
    if (!complianceMapping?.length) return;

    this.ensureSpace(80);
    this.subHeading("Compliance Status");

    this.drawCompactTable(
      ["Framework", "Requirement", "Status", "Gap"],
      complianceMapping.slice(0, 4).map((cm: any) => [
        cm.framework || "", truncate(cm.requirement || "", 40),
        cm.status || "", truncate(cm.gap || "\u2014", 40),
      ]),
      [70, this.contentWidth - 220, 65, 85],
    );
  }

  writeConclusion(conclusion: string) {
    if (!conclusion) return;
    this.ensureSpace(50);
    this.subHeading("Conclusion");
    this.bodyText(conclusion, 60);
  }

  writeAppendix(appendix: any) {
    if (!appendix) return;

    this.newPage();
    this.sectionHeading("Appendix", "Reference definitions and terminology");

    if (appendix.severityDefinitions?.length) {
      this.subHeading("Severity Definitions");
      this.drawCompactTable(
        ["Level", "Description", "Response Time"],
        appendix.severityDefinitions.map((sd: any) => [
          sd.level || "", sd.description || "", sd.responseTime || "",
        ]),
        [60, this.contentWidth - 140, 80],
      );
    }

    if (appendix.glossary?.length) {
      this.subHeading("Glossary");
      this.drawCompactTable(
        ["Term", "Definition"],
        appendix.glossary.slice(0, 6).map((g: any) => [g.term || "", truncate(g.definition || "", 80)]),
        [80, this.contentWidth - 80],
      );
    }
  }

  finalize(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      this.doc.on("end", () => resolve(Buffer.concat(chunks)));
      this.doc.on("error", reject);

      this.writePageFooter();
      this.doc.end();
    });
  }
}

function isPrivateAddress(hostname: string): boolean {
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
    /^0\./,
    /^metadata\.google\.internal$/i,
    /^169\.254\.169\.254$/,
  ];
  return privatePatterns.some(p => p.test(hostname));
}

async function fetchLogoBuffer(logoUrl?: string | null): Promise<Buffer | null> {
  if (!logoUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(logoUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (isPrivateAddress(parsed.hostname)) return null;
  const allowedExtensions = /\.(png|jpg|jpeg|gif|svg|webp)(\?.*)?$/i;
  if (!allowedExtensions.test(parsed.pathname)) {
    if (!parsed.pathname.includes("/logo") && !parsed.pathname.includes("/brand") && !parsed.pathname.includes("/image")) return null;
  }
  try {
    const resp = await fetch(logoUrl, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "CyberCommandCenter/1.0 BrandingService" },
      redirect: "error",
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  }
}

export async function generateReportPDF(report: any, tenantName: string, brandName?: string, brandColor?: string | null, logoUrl?: string | null): Promise<Buffer> {
  const metrics = report.metrics || {};
  const documentControl = metrics.documentControl || {};
  const managementSummary = metrics.managementSummary || {};
  const scorecard = metrics.securityScorecard || {};
  const maturity = metrics.maturityAssessment || {};
  const sections = metrics.sections || [];
  const complianceMapping = metrics.complianceMapping || [];
  const appendix = metrics.appendix || {};
  const findings = report.findings || [];
  const recommendations = report.recommendations || [];
  const riskMatrix = metrics.riskMatrix || [];
  const keyHighlights = metrics.keyHighlights || [];
  const conclusion = metrics.conclusion || "";

  const brand = brandName || tenantName || "SecureOps";
  const classification = documentControl.classification ? `${documentControl.classification.toUpperCase()} - RESTRICTED` : "CONFIDENTIAL - RESTRICTED";

  const reportLabels: Record<string, string> = {
    executive_summary: "Executive Summary", endpoint: "Endpoint Security", email: "Email Security",
    vulnerability: "Vulnerability Assessment", compliance: "Compliance & Governance",
    threat_intelligence: "Threat Intelligence", incident_response: "Incident Response",
    cloud_security: "Cloud Security", asset_inventory: "Asset Inventory",
    threat_landscape: "Threat Landscape", sla_performance: "SLA Performance",
    soc_operations: "SOC Operations", risk_posture: "Risk Posture",
  };
  const reportTypeLabel = reportLabels[report.reportType] || "Security Report";

  const logoBuffer = await fetchLogoBuffer(logoUrl);

  const builder = new ReportPDFBuilder(
    brand, tenantName, report.title || "Security Report",
    classification, documentControl.documentId || "N/A",
    brandColor, logoBuffer
  );

  builder.writeCoverPage(report, reportTypeLabel, documentControl);

  const tocItems: { title: string; section: string }[] = [];
  tocItems.push({ title: "Executive Summary", section: "01" });
  tocItems.push({ title: "Incident Metrics Dashboard", section: "02" });
  tocItems.push({ title: "Business Impact Overview", section: "03" });
  tocItems.push({ title: "Response Performance & Maturity", section: "04" });
  if (sections.length > 0) tocItems.push({ title: "Key Analysis", section: "05" });
  if (recommendations.length > 0) tocItems.push({ title: "Risk Outlook & Recommendations", section: String(tocItems.length + 1).padStart(2, "0") });
  if (complianceMapping.length > 0) tocItems.push({ title: "Compliance Status", section: String(tocItems.length + 1).padStart(2, "0") });
  if (conclusion) tocItems.push({ title: "Conclusion", section: String(tocItems.length + 1).padStart(2, "0") });
  if (appendix.severityDefinitions || appendix.glossary) tocItems.push({ title: "Appendix", section: String(tocItems.length + 1).padStart(2, "0") });

  builder.writeTableOfContents(tocItems);

  builder.writeExecutiveSummaryPage(
    report.executiveSummary || "",
    managementSummary,
    keyHighlights
  );

  builder.writeIncidentMetrics(managementSummary, scorecard);

  builder.writeBusinessImpact(findings, riskMatrix);

  builder.writeResponsePerformance(maturity);

  builder.writeAnalysisSections(sections);

  builder.writeRecommendations(recommendations);

  builder.writeCompliance(complianceMapping);

  builder.writeConclusion(conclusion);

  builder.writeAppendix(appendix);

  return builder.finalize();
}

export async function generateBriefingPDF(briefing: any, tenantName: string, brandName?: string, brandColor?: string | null, logoUrl?: string | null, periodLabel?: string): Promise<Buffer> {
  const logoBuffer = await fetchLogoBuffer(logoUrl);
  const brand = brandName || tenantName || "SecureOps";
  const accent = brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : COLORS.accent;
  const period = periodLabel || "Last 30 Days";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 60, bottom: 50, left: 50, right: 50 }, autoFirstPage: true, info: { Title: "Executive Intelligence Briefing", Author: brand, Creator: brand } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pw = 595.28, ph = 841.89, ml = 50, mr = 50, cw = pw - ml - mr;
    const m = briefing?.metrics || {};
    const score = briefing?.compositeRiskScore ?? 0;
    const tl = briefing?.threatLevel || "Low";

    // ── Header bar
    doc.rect(0, 0, pw, 6).fill(accent);
    doc.rect(0, 6, pw, 70).fill(COLORS.primaryDark);
    doc.rect(0, 6, 4, 70).fill(accent);

    if (logoBuffer) {
      try { doc.image(logoBuffer, ml + cw - 65, 14, { fit: [60, 45], align: "right" }); } catch {}
    }

    doc.fontSize(8).fillColor(accent).font("Helvetica-Bold");
    doc.text(brand.toUpperCase(), ml, 22, { characterSpacing: 2, width: cw * 0.6 });
    doc.fontSize(7).fillColor(COLORS.mutedLight).font("Helvetica");
    doc.text("MANAGED SECURITY SERVICES · EXECUTIVE BRIEFING", ml, 34, { characterSpacing: 1, width: cw * 0.7 });

    const now = new Date();
    doc.fontSize(6.5).fillColor(COLORS.muted).font("Helvetica");
    doc.text(`Generated: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}  |  Period: ${period}`, ml, 54, { width: cw });

    doc.fontSize(7).fillColor(COLORS.mutedLight).font("Helvetica-Bold");
    doc.text("CONFIDENTIAL", ml + cw - 70, 22, { width: 70, align: "right", characterSpacing: 1 });

    doc.y = 88;

    // ── Report title
    doc.rect(0, 76, pw, 2).fill(accent);
    doc.fontSize(18).fillColor(COLORS.primary).font("Helvetica-Bold");
    doc.text("Executive Intelligence Briefing", ml, 88, { width: cw });
    doc.y += 4;
    doc.rect(ml, doc.y, 50, 2.5).fill(accent);
    doc.y += 12;

    // ── Threat level badge
    const tlColors: Record<string, string> = { Critical: COLORS.critical, High: COLORS.high, Medium: COLORS.medium, Low: COLORS.low };
    const tlColor = tlColors[tl] || COLORS.low;
    doc.save();
    doc.roundedRect(ml, doc.y, 90, 20, 3).fill(tlColor);
    doc.fontSize(8).fillColor(COLORS.white).font("Helvetica-Bold");
    doc.text(`${tl.toUpperCase()} THREAT LEVEL`, ml + 8, doc.y + 6, { width: 80, characterSpacing: 0.5, lineBreak: false });
    doc.restore();
    doc.y += 28;

    // ── KPI stat bar (5 metrics)
    const stats = [
      { label: "Active Incidents", value: String(m.activeThreats ?? 0) },
      { label: "New IOCs (Period)", value: String(m.newIOCs24h ?? 0) },
      { label: "Coverage %", value: `${m.coveragePercent ?? 87}%` },
      { label: "MTTR (avg)", value: `${m.avgResponseTimeMin ?? 45}m` },
      { label: "SLA Compliance", value: `${m.slaHealth ?? 100}%` },
    ];
    const sw = cw / stats.length;
    doc.save();
    doc.roundedRect(ml, doc.y, cw, 44, 3).fill(COLORS.bgLight);
    doc.strokeColor(COLORS.border).lineWidth(0.4);
    doc.roundedRect(ml, doc.y, cw, 44, 3).stroke();
    const sy = doc.y;
    stats.forEach((s, i) => {
      const x = ml + i * sw;
      if (i > 0) { doc.strokeColor(COLORS.border).lineWidth(0.3); doc.moveTo(x, sy + 8).lineTo(x, sy + 36).stroke(); }
      doc.fontSize(6).fillColor(COLORS.muted).font("Helvetica-Bold");
      doc.text(s.label.toUpperCase(), x + 8, sy + 8, { width: sw - 16, characterSpacing: 0.3, lineBreak: false });
      doc.fontSize(13).fillColor(COLORS.primary).font("Helvetica-Bold");
      doc.text(s.value, x + 8, sy + 18, { width: sw - 16, lineBreak: false });
    });
    doc.restore();
    doc.y = sy + 52;

    // ── Composite risk score
    doc.save();
    doc.roundedRect(ml, doc.y, 130, 40, 3).fill(COLORS.bgLighter);
    doc.strokeColor(COLORS.border).lineWidth(0.4);
    doc.roundedRect(ml, doc.y, 130, 40, 3).stroke();
    doc.rect(ml, doc.y, 3, 40).fill(accent);
    doc.fontSize(6.5).fillColor(COLORS.muted).font("Helvetica-Bold");
    doc.text("COMPOSITE RISK SCORE", ml + 12, doc.y + 7, { characterSpacing: 0.5 });
    doc.fontSize(22).fillColor(tlColor).font("Helvetica-Bold");
    doc.text(String(score), ml + 12, doc.y + 15, { lineBreak: false });
    doc.fontSize(9).fillColor(COLORS.muted).font("Helvetica");
    doc.text("/100", ml + 50, doc.y + 15, { lineBreak: false });
    doc.restore();
    doc.y += 48;

    // ── Situation narrative
    doc.rect(0, doc.y, pw, 1.5).fill(COLORS.borderLight);
    doc.y += 6;
    doc.fontSize(8).fillColor(accent).font("Helvetica-Bold");
    doc.text("SITUATION REPORT", ml, doc.y, { characterSpacing: 1 });
    doc.y += 12;
    const situation = (briefing?.sections?.situation || briefing?.summary || "No narrative available.").replace(/\*\*/g, "");
    doc.fontSize(9).fillColor("#334155").font("Helvetica");
    doc.text(truncate(situation, 400), ml, doc.y, { width: cw, lineGap: 2 });
    doc.y += 10;

    // ── Key Findings
    const findings: string[] = briefing?.sections?.keyFindings || [];
    if (findings.length > 0) {
      doc.rect(0, doc.y, pw, 1.5).fill(COLORS.borderLight);
      doc.y += 6;
      doc.fontSize(8).fillColor(accent).font("Helvetica-Bold");
      doc.text("KEY FINDINGS", ml, doc.y, { characterSpacing: 1 });
      doc.y += 12;
      findings.slice(0, 4).forEach((f: string, i: number) => {
        doc.save();
        doc.circle(ml + 5, doc.y + 5, 5).fill(accent);
        doc.fontSize(7.5).fillColor(COLORS.white).font("Helvetica-Bold");
        doc.text(String(i + 1), ml + 3, doc.y + 2, { lineBreak: false });
        doc.fontSize(8.5).fillColor("#334155").font("Helvetica");
        doc.text(truncate(f, 120), ml + 18, doc.y, { width: cw - 18, lineGap: 1.5, lineBreak: false });
        doc.restore();
        doc.y += 16;
      });
      doc.y += 4;
    }

    // ── Top threats + Recommendations
    const threats = briefing?.topThreats || [];
    const recs = briefing?.recommendations || [];
    const colW = (cw - 10) / 2;

    if (threats.length > 0 || recs.length > 0) {
      doc.rect(0, doc.y, pw, 1.5).fill(COLORS.borderLight);
      doc.y += 6;
      const tableY = doc.y;

      if (threats.length > 0) {
        doc.fontSize(8).fillColor(accent).font("Helvetica-Bold");
        doc.text("TOP THREATS", ml, tableY, { characterSpacing: 1 });
        let ty = tableY + 12;
        threats.slice(0, 3).forEach((t: any) => {
          const sc = { critical: COLORS.critical, high: COLORS.high, medium: COLORS.medium, low: COLORS.low }[t.severity] || COLORS.muted;
          doc.save();
          doc.rect(ml, ty, 3, 14).fill(sc);
          doc.fontSize(8).fillColor(COLORS.primary).font("Helvetica-Bold");
          doc.text(truncate(t.name || "", 30), ml + 10, ty + 2, { width: colW - 10, lineBreak: false });
          doc.fontSize(6.5).fillColor(COLORS.muted).font("Helvetica");
          doc.text(t.tactic || "", ml + 10, ty + 10, { lineBreak: false });
          doc.restore();
          ty += 18;
        });
      }

      if (recs.length > 0) {
        const rx = ml + colW + 10;
        doc.fontSize(8).fillColor(accent).font("Helvetica-Bold");
        doc.text("PRIORITY ACTIONS", rx, tableY, { characterSpacing: 1 });
        let ry = tableY + 12;
        const pColors = [COLORS.critical, COLORS.high, COLORS.medium, accent, COLORS.muted];
        recs.slice(0, 5).forEach((r: string, i: number) => {
          doc.save();
          doc.roundedRect(rx, ry, 18, 10, 2).fill(pColors[i] || accent);
          doc.fontSize(6).fillColor(COLORS.white).font("Helvetica-Bold");
          doc.text(`P${i + 1}`, rx + 4, ry + 2, { lineBreak: false });
          doc.fontSize(7.5).fillColor("#334155").font("Helvetica");
          doc.text(truncate(r, 55), rx + 24, ry + 1, { width: colW - 24, lineBreak: false });
          doc.restore();
          ry += 14;
        });
      }
    }

    // ── Footer
    const fy = ph - 38;
    doc.rect(0, fy - 2, pw, 40).fill(COLORS.primaryDark);
    doc.rect(0, fy - 2, pw, 2).fill(accent);
    doc.rect(0, fy - 2, 4, 40).fill(accent);
    doc.fontSize(6).fillColor(COLORS.mutedLight).font("Helvetica-Bold");
    doc.text("CONFIDENTIAL - INTERNAL USE ONLY", ml, fy + 6, { width: cw, align: "center", characterSpacing: 1.5 });
    doc.fontSize(5.5).fillColor(COLORS.muted).font("Helvetica");
    doc.text(`${brand}  |  Executive Intelligence Briefing  |  © ${now.getFullYear()}`, ml, fy + 18, { width: cw, align: "center" });

    doc.end();
  });
}
