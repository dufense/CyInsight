import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Report } from "@shared/schema";
import {
  FileText, Sparkles, Download, Eye, Loader2, CheckCircle2, Mail, Monitor,
  Bug, BarChart3, ShieldCheck, Crosshair, AlertTriangle, Cloud, Package,
  Map, Timer, Activity, Gauge, X, TrendingUp, TrendingDown, Minus,
  Lock, BookOpen, ListChecks, Target, ChevronRight, FileDown, Shield,
  ArrowUp, ArrowDown, Circle, Zap, Users, Globe, Server, Database,
  Link2, ChevronDown, ExternalLink, Hash, Clock, RefreshCw, Pencil, Trash2,
  Network, Layers, HardDrive, Settings, Landmark, BarChart2, Wifi, Key,
  Building2, ClipboardCheck, LayoutDashboard, GitBranch, Lightbulb, Route, Presentation,
  ArrowUpRight, ArrowDownRight, GitCompareArrows,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

function safeRender(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(safeRender).join(", ");
  if (typeof value === "object") {
    return Object.entries(value).map(([k, v]) => `${k}: ${safeRender(v)}`).join(", ");
  }
  return String(value);
}

const REPORT_TYPES: Record<string, { label: string; icon: any; color: string; bg: string; accent: string }> = {
  executive_summary: { label: "Executive Summary", icon: BarChart3, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", accent: "hsl(217, 91%, 55%)" },
  endpoint: { label: "Endpoint Report", icon: Monitor, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", accent: "hsl(0, 72%, 51%)" },
  email: { label: "Email Report", icon: Mail, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10", accent: "hsl(271, 76%, 53%)" },
  vulnerability: { label: "Vulnerability Report", icon: Bug, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", accent: "hsl(25, 95%, 53%)" },
  compliance: { label: "Compliance Report", icon: ShieldCheck, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", accent: "hsl(142, 71%, 45%)" },
  threat_intelligence: { label: "Threat Intelligence", icon: Crosshair, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10", accent: "hsl(192, 91%, 36%)" },
  incident_response: { label: "Incident Response", icon: AlertTriangle, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", accent: "hsl(45, 93%, 47%)" },
  cloud_security: { label: "Cloud Security", icon: Cloud, color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10", accent: "hsl(199, 89%, 48%)" },
  asset_inventory: { label: "Asset Inventory", icon: Package, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10", accent: "hsl(173, 80%, 36%)" },
  threat_landscape: { label: "Threat Landscape", icon: Map, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10", accent: "hsl(347, 77%, 50%)" },
  sla_performance: { label: "SLA Performance", icon: Timer, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", accent: "hsl(38, 92%, 50%)" },
  soc_operations: { label: "SOC Operations", icon: Activity, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10", accent: "hsl(239, 84%, 67%)" },
  risk_posture: { label: "Risk Posture", icon: Gauge, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", accent: "hsl(160, 84%, 39%)" },
};

const SEV_COLORS: Record<string, string> = {
  critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#16a34a",
};

const RAG_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  red: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800", dot: "bg-red-500" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800", dot: "bg-amber-500" },
  green: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500" },
};

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
  B: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
  C: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
  D: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",
  F: "text-red-600 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
};

const CHART_PALETTE = [
  "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#14b8a6",
];

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "11px",
};

const REPORT_TEMPLATES = [
  {
    id: "monthly_security_review",
    name: "Monthly Security Review",
    description: "Comprehensive monthly review covering all security domains with trend analysis and KPIs.",
    reportType: "executive_summary",
    period: "last_month",
    icon: BarChart3,
    group: "General",
    prompt: "Generate a comprehensive monthly security review. Include month-over-month trend comparisons, highlight top 5 incidents, provide MTTR/MTTD metrics, and include recommendations prioritized by business impact. Focus on actionable insights for the security team.",
  },
  {
    id: "quarterly_executive_brief",
    name: "Quarterly Executive Brief",
    description: "Board-ready quarterly briefing with strategic risk assessment and investment recommendations.",
    reportType: "executive_summary",
    period: "last_quarter",
    icon: Target,
    group: "General",
    prompt: "Generate a board-level quarterly executive security briefing. Use business-oriented language suitable for C-suite and board members. Focus on strategic risk posture changes, ROI of security investments, peer benchmarking, and capital allocation recommendations. Include a one-page executive dashboard summary.",
  },
  {
    id: "incident_summary",
    name: "Incident Summary Report",
    description: "Detailed incident analysis with MITRE ATT&CK mapping, kill chain, and lessons learned.",
    reportType: "incident_response",
    period: "last_month",
    icon: AlertTriangle,
    group: "General",
    prompt: "Generate a detailed incident summary report. For each significant incident, provide full MITRE ATT&CK technique mapping, Lockheed Martin Kill Chain phase analysis, root cause analysis, containment timeline, and lessons learned. Include attack chain visualization data and IOC reputation analysis.",
  },
  {
    id: "compliance_audit",
    name: "Compliance Audit Report",
    description: "Framework-specific compliance assessment with gap analysis and remediation roadmap.",
    reportType: "compliance",
    period: "last_quarter",
    icon: ShieldCheck,
    group: "General",
    prompt: "Generate a compliance-focused audit report. Map all findings to specific regulatory frameworks (ISO 27001, NIST CSF, SOC 2, GDPR, PCI-DSS). Include detailed gap analysis with current vs. target maturity scores, evidence requirements, and a prioritized remediation roadmap with estimated effort and timeline.",
  },
  {
    id: "vulnerability_assessment",
    name: "Vulnerability Assessment",
    description: "Deep-dive vulnerability report with CVSS scoring, exploit probability, and patch priorities.",
    reportType: "vulnerability",
    period: "last_month",
    icon: Bug,
    group: "General",
    prompt: "Generate a detailed vulnerability assessment report. Include CVSS v3.1 scoring for all findings, exploit probability analysis, patch prioritization matrix, SLA compliance for vulnerability remediation, and a risk-adjusted vulnerability heat map by business unit and asset criticality.",
  },
  {
    id: "threat_landscape",
    name: "Threat Landscape Analysis",
    description: "Industry-specific threat intelligence with emerging attack vectors and actor profiles.",
    reportType: "threat_landscape",
    period: "last_quarter",
    icon: Map,
    group: "General",
    prompt: "Generate an industry-specific threat landscape report. Include threat actor profiles relevant to the organization's sector, emerging attack vectors, dark web intelligence summary, geopolitical cyber risk factors, and predictive threat modeling for the next quarter.",
  },
  {
    id: "soc_operations",
    name: "SOC Operations Report",
    description: "SOC performance metrics, analyst workload, detection efficacy, and automation coverage.",
    reportType: "soc_operations",
    period: "last_month",
    icon: Activity,
    group: "General",
    prompt: "Generate a SOC operations performance report. Include analyst workload distribution, detection efficacy rates, false positive ratios, MTTR/MTTD by severity, automation coverage metrics, alert fatigue indicators, and SOC maturity assessment against the NIST SOC-CMM framework.",
  },
  {
    id: "risk_posture",
    name: "Risk Posture Assessment",
    description: "Enterprise risk scoring with business impact analysis and risk treatment plans.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Gauge,
    group: "General",
    prompt: "Generate an enterprise risk posture assessment. Include quantified risk scoring using FAIR methodology, business impact analysis for top risks, risk appetite alignment assessment, risk treatment effectiveness, and a forward-looking risk register with heat map and treatment plans.",
  },
  {
    id: "caasm_asset_inventory",
    name: "Asset Inventory Report",
    description: "Complete asset census — OS distribution, device type breakdown, EOL/EOS tracking, network segmentation mapping, risk scoring per asset group.",
    reportType: "asset_inventory",
    period: "last_month",
    icon: Package,
    group: "CAASM Reports",
    prompt: "Generate a comprehensive Asset Inventory Report. Include: complete asset census with total counts by category (endpoints, servers, network devices, cloud workloads), OS distribution and version breakdown, device type classification, EOL/EOS tracking with timelines and risk implications, network segmentation mapping showing which assets belong to which segments, risk scoring per asset group based on vulnerability exposure and criticality, lifecycle management recommendations. Provide quantitative risk scores (0-100) for each asset group. Prioritize recommendations by business impact. Include an executive summary with top 3 asset-related risks.",
  },
  {
    id: "caasm_user_identity",
    name: "User Inventory & Identity Report",
    description: "User account type distribution, privilege analysis, stale account detection, admin sprawl metrics, identity governance recommendations.",
    reportType: "asset_inventory",
    period: "last_month",
    icon: Users,
    group: "CAASM Reports",
    prompt: "Generate a comprehensive User Inventory & Identity Report. Include: user account type distribution (Domain Users, Local Admins, Local Users, Service Accounts, Guest Accounts, System Accounts), privilege analysis showing admin-to-user ratios, stale account detection (accounts inactive >90 days), admin sprawl metrics (percentage of users with admin privileges), MFA compliance gaps analysis, dormant privileged account risks, identity governance recommendations prioritized by risk. Provide quantitative risk scores for identity posture. Include actionable recommendations for reducing attack surface through identity hygiene.",
  },
  {
    id: "caasm_domain_ad",
    name: "Domain & Active Directory Report",
    description: "AD domain analysis, domain controller count, admin account audit, trust relationships, group policy health, directory hardening.",
    reportType: "asset_inventory",
    period: "last_quarter",
    icon: Server,
    group: "CAASM Reports",
    prompt: "Generate a Domain & Active Directory Report. Include: AD domain analysis with domain controller inventory, admin account audit (Domain Admins, Enterprise Admins, Schema Admins counts and appropriateness), trust relationship mapping, group policy health assessment, privileged account ratio analysis, Kerberos configuration review, LDAP signing status, directory service replication health, password policy compliance, service account security posture, directory hardening recommendations mapped to CIS benchmarks. Provide a directory security maturity score (0-100) and prioritized remediation roadmap.",
  },
  {
    id: "caasm_cloud_app",
    name: "Cloud App Inventory & Risk Report",
    description: "SaaS/IaaS discovery, shadow IT analysis, CASB risk scores, data sovereignty mapping, OAuth token audit, cloud governance.",
    reportType: "cloud_security",
    period: "last_month",
    icon: Cloud,
    group: "CAASM Reports",
    prompt: "Generate a Cloud App Inventory & Risk Report. Include: SaaS and IaaS application discovery with categorization, shadow IT analysis identifying unsanctioned applications, CASB risk scoring for each discovered application, data sovereignty mapping showing where data resides geographically, OAuth token audit identifying over-privileged or stale tokens, SaaS sprawl metrics (number of apps per user, redundant tools), cloud access patterns and anomaly detection, data flow analysis between cloud services, cloud governance recommendations with risk-prioritized remediation steps. Provide quantitative cloud risk scores and compliance gap analysis.",
  },
  {
    id: "ops_endpoint_security",
    name: "Endpoint Security Report",
    description: "Endpoint protection coverage, detection rates, malware trends, EDR alert analysis, unprotected endpoints, hardening recommendations.",
    reportType: "endpoint",
    period: "last_month",
    icon: Monitor,
    group: "Cyber Security Operations",
    prompt: "Generate an Endpoint Security Report. Include: endpoint protection coverage percentage across the estate, EDR/XDR detection rates by threat category, malware trend analysis (types, families, infection vectors), quarantine and remediation action summaries, EDR alert analysis with false positive ratios, unprotected endpoint identification and gap analysis, endpoint compliance against hardening baselines (CIS benchmarks), patch compliance status, endpoint health scoring, detection efficacy metrics (MTTD, MTTR for endpoint threats), endpoint hardening recommendations prioritized by risk reduction impact. Include quantitative risk scores per endpoint group.",
  },
  {
    id: "ops_email_security",
    name: "Email Security Report",
    description: "Phishing attempt trends, spam rates, malicious attachment analysis, DMARC/SPF/DKIM compliance, email threat patterns.",
    reportType: "email",
    period: "last_month",
    icon: Mail,
    group: "Cyber Security Operations",
    prompt: "Generate an Email Security Report. Include: phishing attempt trends with volume and success rates, spam filtering effectiveness, malicious attachment and URL analysis, DMARC/SPF/DKIM compliance status across all domains, email-borne threat pattern analysis (top threat types, targeted users, sender reputation), business email compromise (BEC) attempt detection, email DLP policy trigger analysis, user awareness metrics (click rates on phishing simulations), email gateway performance metrics, recommendations for improving email security posture. Provide quantitative email security scores and trend comparisons.",
  },
  {
    id: "ops_network_security",
    name: "Network Security Report",
    description: "Firewall rule analysis, IDS/IPS alert trends, DNS anomalies, lateral movement indicators, segmentation compliance.",
    reportType: "asset_inventory",
    period: "last_month",
    icon: Globe,
    group: "Cyber Security Operations",
    prompt: "Generate a Network Security Report. Include: firewall rule analysis (total rules, unused rules, overly permissive rules), IDS/IPS alert trends by category and severity, DNS anomaly detection (DGA domains, DNS tunneling indicators), lateral movement indicator analysis, network segmentation compliance assessment, VPN usage patterns and anomalies, SSL/TLS certificate inventory and expiry tracking, network traffic baseline deviations, port exposure analysis, network hardening recommendations mapped to NIST and CIS frameworks. Provide quantitative network security scores and prioritized remediation actions.",
  },
  {
    id: "ops_dlp",
    name: "Data Loss Prevention Report",
    description: "DLP policy violations, sensitive data exposure, data exfiltration attempts, classification coverage, data protection.",
    reportType: "compliance",
    period: "last_month",
    icon: Lock,
    group: "Cyber Security Operations",
    prompt: "Generate a Data Loss Prevention Report. Include: DLP policy violation trends by category (PII, PCI, PHI, IP), sensitive data exposure incidents with severity classification, data exfiltration attempt analysis (channels: email, web, USB, cloud), data classification coverage across repositories, regulatory data handling compliance assessment (GDPR, PCI-DSS, HIPAA), top violating users and departments, data flow mapping for sensitive information, false positive analysis for DLP rules, data protection recommendations with implementation priority and estimated risk reduction. Provide quantitative data protection maturity scores.",
  },
  {
    id: "gov_nist_csf",
    name: "NIST CSF Maturity Report",
    description: "NIST Cybersecurity Framework assessment across all 6 functions, current vs target maturity, gap analysis, roadmap.",
    reportType: "compliance",
    period: "last_quarter",
    icon: ShieldCheck,
    group: "Governance & Risk",
    prompt: "Generate a NIST CSF Maturity Report. Assess the organization across all 6 NIST CSF 2.0 functions: Govern, Identify, Protect, Detect, Respond, Recover. For each function, provide: current maturity level (1-5 scale), target maturity level, detailed gap analysis with specific subcategory scores, evidence-based findings from security data, control effectiveness metrics. Include: overall maturity spider/radar chart data, function-by-function improvement roadmap with quarterly milestones, resource requirements for maturity improvement, peer benchmarking context, compliance mapping to other frameworks (ISO 27001, SOC 2). Provide quantitative maturity scores and prioritized remediation plan.",
  },
  {
    id: "gov_iso27001",
    name: "ISO 27001 Compliance Report",
    description: "Control-by-control assessment, Statement of Applicability status, non-conformities, audit readiness score.",
    reportType: "compliance",
    period: "last_quarter",
    icon: ListChecks,
    group: "Governance & Risk",
    prompt: "Generate an ISO 27001 Compliance Report. Include: control-by-control assessment across Annex A domains (A.5-A.8), Statement of Applicability (SoA) status summary, identified non-conformities (major and minor) with evidence, corrective action tracking and effectiveness, audit readiness score (0-100), documentation completeness assessment, risk assessment methodology review, management review findings, internal audit results summary, continuous improvement metrics, certification readiness recommendations with timeline. Map security event data to specific ISO 27001 controls to demonstrate compliance or gaps.",
  },
  {
    id: "gov_cyber_insurance",
    name: "Cyber Insurance Readiness Report",
    description: "Insurability assessment, control maturity vs insurer requirements, policy gap identification, premium optimization.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Shield,
    group: "Governance & Risk",
    prompt: "Generate a Cyber Insurance Readiness Report. Include: overall insurability assessment score (0-100), control maturity evaluation against common insurer requirements (MFA, EDR, backup, incident response, patch management, email security, privileged access management), policy gap identification with remediation steps, claim history analysis context, premium optimization recommendations, ransomware readiness assessment, business continuity and disaster recovery posture, third-party risk exposure that affects insurability, recommended coverage levels based on risk profile, insurer questionnaire readiness checklist. Provide actionable steps to improve insurability and reduce premiums.",
  },
  {
    id: "gov_third_party_risk",
    name: "Third-Party Risk Assessment",
    description: "Vendor security posture, supply chain risk scoring, SLA compliance, vendor concentration risk, access audit.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Link2,
    group: "Governance & Risk",
    prompt: "Generate a Third-Party Risk Assessment Report. Include: vendor security posture evaluation for managed service providers and key technology vendors, supply chain risk scoring methodology and results, SLA compliance analysis for security services (response times, uptime, detection rates), vendor concentration risk assessment (single points of failure), third-party access audit (who has access to what, privileged access tracking), vendor incident history and response effectiveness, data sharing and processing agreements compliance, fourth-party risk considerations, vendor risk tiering (critical, high, medium, low), recommendations for vendor risk mitigation and diversification. Provide quantitative vendor risk scores.",
  },
  {
    id: "exec_ciso_board",
    name: "CISO Board Report",
    description: "Board-ready cybersecurity brief — top 5 risks, investment ROI, peer benchmarking, strategic initiatives progress.",
    reportType: "executive_summary",
    period: "last_quarter",
    icon: Target,
    group: "Executive & Strategic",
    prompt: "Generate a CISO Board Report suitable for board of directors presentation. Include: top 5 cybersecurity risks with business impact quantification (financial exposure estimates), security investment ROI analysis, peer benchmarking against industry averages, strategic initiative progress tracking (planned vs actual), risk appetite alignment assessment, security program budget utilization, key performance indicators in business language, regulatory compliance status dashboard, cyber insurance coverage adequacy, forward-looking threat landscape for the organization's industry, 3-5 strategic recommendations requiring board action. Keep language executive-friendly, minimize technical jargon, focus on business outcomes and risk quantification.",
  },
  {
    id: "exec_security_kpi",
    name: "Security Metrics & KPI Dashboard Report",
    description: "MTTR, MTTD, alert-to-incident ratio, detection coverage, analyst productivity, SLA compliance trends.",
    reportType: "soc_operations",
    period: "last_month",
    icon: Activity,
    group: "Executive & Strategic",
    prompt: "Generate a Security Metrics & KPI Dashboard Report. Include comprehensive operational metrics: MTTR (Mean Time to Respond) by severity level, MTTD (Mean Time to Detect) by threat category, MTTR trends over time, alert-to-incident conversion ratio, detection coverage percentage across attack surface, analyst productivity metrics (incidents per analyst, resolution rate), SLA compliance trends (response SLA, resolution SLA), false positive rates by detection source, automation coverage and effectiveness, ticket backlog aging analysis, operational maturity scoring against SOC-CMM framework, month-over-month trend comparisons for all KPIs. Provide quantitative benchmarks and improvement targets.",
  },
  {
    id: "exec_incident_cost",
    name: "Incident Cost Analysis Report",
    description: "Financial impact of incidents, cost per incident by type, resource utilization, downtime costs, budget forecasting.",
    reportType: "incident_response",
    period: "last_quarter",
    icon: Zap,
    group: "Executive & Strategic",
    prompt: "Generate an Incident Cost Analysis Report. Include: estimated financial impact of security incidents during the period, cost per incident broken down by type (malware, phishing, data breach, ransomware, etc.), resource utilization analysis (analyst hours per incident category), estimated downtime costs and business impact, remediation spend by incident severity, cost avoidance metrics (threats blocked, incidents auto-remediated), comparison of incident costs vs security investment, incident cost trending over time, projected budget requirements based on threat trajectory, ROI of security tools and services, cost optimization recommendations. Provide quantitative financial estimates using industry benchmarks where actual data is unavailable.",
  },
  {
    id: "exec_program_maturity",
    name: "Security Program Maturity Report",
    description: "Overall security program assessment, people/process/technology scoring, year-over-year improvement, investment recommendations.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Gauge,
    group: "Executive & Strategic",
    prompt: "Generate a Security Program Maturity Report. Assess the overall security program against CMMI and SOC-CMM frameworks. Include: people maturity (staffing levels, skill gaps, training, certifications), process maturity (documented procedures, incident response readiness, change management), technology maturity (tool coverage, integration level, automation adoption), governance maturity (policy framework, risk management, compliance program), year-over-year improvement tracking across all dimensions, security culture assessment, budget allocation analysis (people vs process vs technology), peer comparison against industry benchmarks, strategic investment recommendations with expected maturity improvements, 12-month roadmap for program advancement. Provide quantitative maturity scores (1-5) for each dimension.",
  },
  {
    id: "infra_assessment",
    name: "Infrastructure Assessment Report",
    description: "Comprehensive infrastructure and application inventory with EOL heatmap, workload suitability assessment (6R), dependency maps, and migration quick-wins.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Server,
    group: "Assessment & Migration",
    prompt: "Generate a comprehensive Infrastructure Assessment Report covering 10 key deliverables. Use the asset inventory data to produce: 1) Executive Summary with total asset counts by platform (VMware, AIX, Linux, Windows), 2) Comprehensive Infrastructure & Application Inventory organized by platform and application category (Enterprise vs Business), 3) End-to-end Application Dependency Maps showing which critical systems (ERP, planning, logistics, PLM, ecommerce, analytics) depend on which server groups, 4) Risk & End-of-Life Heatmap covering ESXi versions, OS versions, and hardware lifecycle with red/amber/green status, 5) Preliminary Workload Suitability Assessment classifying each workload as Rehost/Replatform/Retain/Retire with justification, 6) Initial Quick-Win Candidates that are easy migration targets (already virtualized, modern OS, standard apps), 7) License Usage Baseline showing OS edition counts and VMware version distribution, 8) Discovery Tool Findings with visibility views and dependency indicators, 9) Network Baseline Assessment Summary showing subnet distribution and NIC counts, 10) EUC/Backup/Business Continuity Posture showing DR server count, backup tool coverage, and monitoring status. Include quantitative data and actionable recommendations for each section.",
  },
  {
    id: "workload_migration_plan",
    name: "Workload Migration Planning Report",
    description: "Detailed migration planning with 6R classification, dependency analysis, risk assessment, and phased migration roadmap.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Package,
    group: "Assessment & Migration",
    prompt: "Generate a Workload Migration Planning Report. Analyze the current infrastructure to produce: 1) Workload Classification Matrix showing all servers categorized as Rehost (lift-and-shift), Replatform (upgrade then migrate), Retain (keep in place), or Retire (decommission), 2) Application Dependency Analysis showing critical system interconnections that must be migrated together, 3) Risk Assessment per workload covering data sensitivity, downtime tolerance, compliance requirements, 4) Migration Wave Planning with phased approach (Quick Wins first, then standard workloads, then complex/critical last), 5) Resource Requirements estimation (compute, storage, network, licenses), 6) Cost-Benefit Analysis comparing current state vs target state, 7) Timeline and Milestone Planning with realistic effort estimates, 8) Rollback Strategy for each migration wave. Focus on practical, actionable recommendations with clear prioritization.",
  },
  {
    id: "eol_risk_assessment",
    name: "End-of-Life Risk Assessment",
    description: "Detailed EOL/EOS analysis across all platforms with risk scoring, remediation priorities, and upgrade paths.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: AlertTriangle,
    group: "Assessment & Migration",
    prompt: "Generate an End-of-Life Risk Assessment Report. Analyze all discovered assets to produce: 1) EOL Heatmap showing all products and versions with their support status (Active/Approaching EOL/Past EOL), 2) Critical Risk Items requiring immediate attention (past EOL with active production workloads), 3) Upcoming EOL Timeline showing assets approaching end of support in the next 6-12 months, 4) Platform-specific Analysis for VMware ESXi, Windows Server, Red Hat Enterprise Linux, SUSE, AIX, and IBM VIOS, 5) Hardware Lifecycle Assessment for physical servers approaching end of warranty, 6) Upgrade Path Recommendations with specific target versions and estimated effort, 7) License Renewal Planning with cost implications, 8) Prioritized Remediation Roadmap. Include specific version numbers, server counts, and financial impact estimates where possible.",
  },
  {
    id: "app_dependency_map",
    name: "Application Dependency Mapping Report",
    description: "Server-to-application mapping with stakeholder attribution, environment breakdown, and criticality assessment.",
    reportType: "compliance",
    period: "last_quarter",
    icon: Link2,
    group: "Assessment & Migration",
    prompt: "Generate an Application Dependency Mapping Report. Using the server-to-application inventory data, produce: 1) Application Registry showing all discovered applications classified as Enterprise (infrastructure/platform) or Business (line-of-business/revenue), 2) Server-to-Application Matrix showing which servers support which applications, 3) Stakeholder Responsibility Map showing application owners, support groups, and managed-by contacts, 4) Environment Distribution showing Production/Development/QA/Test breakdown per application, 5) Critical Application Dependencies identifying single points of failure and shared infrastructure, 6) Application Risk Profile combining EOL status, patching compliance, and monitoring coverage per application, 7) Monitoring and Observability Gaps showing applications with insufficient monitoring, 8) Recommendations for improving application resilience and reducing dependency risks.",
  },

  {
    id: "hybrid_platform_posture",
    name: "Hybrid Platform Posture Assessment",
    description: "On-premises, Azure, and AWS infrastructure posture — deployment distribution, cloud vs physical vs virtual breakdown, platform health by environment.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Layers,
    group: "Discovery & Posture Assessment",
    prompt: "Generate a Hybrid Platform Posture Assessment Report. Analyze the infrastructure estate across on-premises, Azure, and AWS environments using the asset inventory data. Include: 1) Platform Distribution — breakdown of total assets by deployment type (Physical, Virtual, Cloud) and cloud provider (AWS, Azure, On-Premises), with percentages and asset counts, 2) On-Premises Posture — server hardware age, hypervisor versions, physical vs virtual ratio, capacity utilization indicators, 3) Azure Posture — Azure-hosted workloads, instance types, region distribution, resource group organization, 4) AWS Posture — AWS-hosted workloads, instance types, region distribution, account/VPC organization, 5) Cross-Platform Comparison — side-by-side maturity scoring for each platform (security controls, patching, monitoring coverage), 6) Environment Breakdown — Production, Development, QA, and Test distribution per platform, 7) Risk Assessment — per-platform risk scores, EOL exposure, unpatched assets, monitoring gaps, 8) Recommendations — platform-specific improvement actions prioritized by risk reduction impact. Use quantitative data from the asset inventory throughout. Provide RAG (Red/Amber/Green) status for each platform dimension.",
  },
  {
    id: "governance_security_compliance",
    name: "Governance, Security & Compliance Maturity",
    description: "IAM posture, MFA/SSO coverage, tagging completeness, logging and monitoring maturity assessment across the estate.",
    reportType: "compliance",
    period: "last_quarter",
    icon: Landmark,
    group: "Discovery & Posture Assessment",
    prompt: "Generate a Governance, Security & Compliance Maturity Assessment Report. Analyze the organization's security governance posture using asset and event data. Include: 1) IAM Assessment — identity and access management posture based on user inventory, admin-to-user ratios, privileged account sprawl, service account hygiene, 2) MFA/SSO Coverage — estimate MFA adoption and SSO integration maturity based on identity events and authentication patterns, 3) Tagging & Classification Maturity — analyze asset metadata completeness (how many assets have proper environment tags, application labels, owners, support groups), calculate tagging coverage percentage, 4) Logging & Monitoring Maturity — percentage of assets with monitoring tools, log source diversity, SIEM integration coverage, detection rule coverage, 5) Security Control Coverage — EDR/XDR deployment percentage, vulnerability scanning coverage, backup coverage, 6) Compliance Posture Summary — map findings to key frameworks (ISO 27001, NIST CSF, SOC 2), 7) Maturity Scoring — provide 1-5 maturity scores for IAM, MFA/SSO, Tagging, Logging, and overall governance, 8) Gap Analysis & Recommendations — prioritized remediation roadmap with estimated effort. Use RAG indicators throughout.",
  },
  {
    id: "cloud_fitment_scoring",
    name: "Cloud Fitment & Cost Insights",
    description: "Workload cloud-readiness scoring, rightsizing insights, consumption pattern analysis, and cost optimization advisory.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: BarChart2,
    group: "Discovery & Posture Assessment",
    prompt: "Generate a Cloud Fitment Scoring & Cost-Management Insights Report. Using the workload classification (6R) and asset inventory data, produce: 1) Cloud Fitment Scoring — score each workload/application for cloud readiness (0-100) based on OS modernity, virtualization status, dependency complexity, and compliance requirements, 2) Rightsizing Insights — identify over-provisioned and under-utilized assets based on hardware specs, workload type, and deployment patterns; recommend right-sized cloud instance types, 3) Consumption Pattern Analysis (Advisory) — analyze workload distribution patterns, peak usage indicators, and environment sprawl (Dev/Test vs Production ratios), 4) Cost Optimization Opportunities — identify decommission candidates (retired workloads), license consolidation opportunities, reserved vs on-demand recommendations, 5) Migration Cost Estimation — high-level cost categories for Rehost, Replatform, and Retain workloads, 6) Quick-Win Cost Savings — immediate savings from retiring EOL systems, consolidating redundant infrastructure, and eliminating unused resources, 7) TCO Comparison Advisory — framework for comparing current on-premises TCO vs projected cloud costs. This is advisory/directional — no detailed architecture or commercial pricing.",
  },
  {
    id: "network_readiness",
    name: "Network Readiness Assessment",
    description: "Connectivity posture, SDN readiness scoring, regional constraints analysis, subnet topology, and segmentation review.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Wifi,
    group: "Discovery & Posture Assessment",
    prompt: "Generate a Network Readiness Assessment Report. Using the network baseline and asset inventory data, produce: 1) Connectivity Posture — current network topology overview showing discovered subnets, NIC counts, VLAN segmentation, 2) SDN Readiness Scoring — assess software-defined networking readiness based on current infrastructure (physical vs virtual networking, overlay capability, automation maturity), score 0-100, 3) Regional & Geographic Constraints — map assets by location/site code, identify regional data sovereignty considerations, latency-sensitive workloads, 4) Network Segmentation Analysis — evaluate current segmentation posture, identify flat network risks, microsegmentation readiness, 5) Bandwidth & Capacity Assessment — analyze NIC distribution, identify potential bottlenecks for cloud migration, 6) DNS/DHCP/IPAM Posture — assess IP address management maturity and DNS infrastructure readiness, 7) Firewall & Security Appliance Inventory — network security control coverage, 8) Recommendations — prioritized network improvements for cloud readiness, hybrid connectivity requirements, and security posture hardening. Provide RAG status for each dimension.",
  },
  {
    id: "connectivity_identity_posture",
    name: "Connectivity & Identity Posture Assessment",
    description: "ExpressRoute/VPN readiness, Active Directory/SSO integration, hybrid identity posture, and connectivity architecture advisory.",
    reportType: "compliance",
    period: "last_quarter",
    icon: Key,
    group: "Discovery & Posture Assessment",
    prompt: "Generate a Connectivity & Identity Posture Assessment Report. Analyze hybrid connectivity and identity infrastructure using asset and user data. Include: 1) ExpressRoute/VPN Readiness — assess current WAN connectivity, VPN infrastructure, bandwidth capacity, and readiness for dedicated cloud circuits (ExpressRoute/Direct Connect), 2) Active Directory Assessment — domain controller inventory, forest/domain topology, AD health indicators, replication status, trust relationships, 3) SSO Integration Posture — evaluate Single Sign-On coverage, federation services, SAML/OIDC integration maturity, 4) Hybrid Identity Architecture — assess Azure AD Connect / Entra ID readiness, password hash sync vs pass-through authentication considerations, 5) Conditional Access Maturity — evaluate policy coverage, MFA enforcement, device compliance requirements, 6) Identity Governance — privileged access management, access review processes, identity lifecycle automation, 7) Service Account Security — service account inventory, credential rotation practices, managed identity readiness, 8) Recommendations — prioritized identity modernization roadmap covering hybrid identity, zero-trust principles, and privileged access management. Advisory only — no detailed architecture or design.",
  },
  {
    id: "modernization_themes",
    name: "Modernization Themes & Building Blocks",
    description: "Advisory guidance on modernization approach, technology transformation themes, and strategic building blocks — guidance only.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Lightbulb,
    group: "Discovery & Posture Assessment",
    prompt: "Generate a Modernization Themes & Building Blocks Advisory Report. Based on the infrastructure assessment data, provide strategic guidance (no architecture or design). Include: 1) Key Modernization Themes — identify the top 5-7 technology transformation themes relevant to this estate (e.g., cloud adoption, containerization, infrastructure-as-code, observability, zero-trust security, data platform modernization), 2) Building Block Recommendations — for each theme, describe the foundational capabilities needed, maturity prerequisites, and organizational readiness indicators, 3) Technology Stack Considerations — advisory on platform choices based on current estate composition (Windows-heavy vs Linux-heavy, VMware dependency, legacy platform considerations), 4) Automation & DevOps Readiness — assess current operational maturity and recommend automation building blocks, 5) Security Modernization Themes — zero-trust architecture principles, cloud-native security controls, identity-centric security, 6) Data & Analytics Modernization — data platform considerations, observability stack, log management evolution, 7) Organizational Change Themes — skills development needs, operating model evolution, governance framework updates, 8) Priority Sequencing Advisory — recommended order for pursuing themes based on current maturity and quick-win potential. This is guidance only — no detailed architecture, design, or implementation plans.",
  },

  {
    id: "modernization_readiness_scorecards",
    name: "Modernization Readiness Scorecards",
    description: "Per-workload/workstream readiness scorecards covering complexity, dependencies, and compliance posture.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: ClipboardCheck,
    group: "Modernization Readiness",
    prompt: "Generate Modernization Readiness Scorecards per workload and workstream. Using the workload classification (6R), application registry, and asset inventory data, produce: 1) Workload Readiness Matrix — for each major application/workstream, provide a readiness scorecard (0-100) covering: Complexity Score (number of servers, OS diversity, dependency depth), Dependency Score (inter-application dependencies, shared infrastructure, external integrations), Compliance Posture (data classification, regulatory requirements, retention needs), Migration Risk (downtime sensitivity, rollback complexity, data migration volume), 2) Workstream Grouping — organize workloads into logical workstreams (e.g., ERP, Database, Web, Middleware, Legacy) with aggregate readiness scores, 3) Dependency Chain Analysis — identify workloads that must migrate together due to tight coupling, 4) Complexity Drivers — top factors increasing modernization complexity per workload (legacy OS, custom integrations, compliance constraints), 5) Compliance Posture per Workload — regulatory exposure, data sensitivity classification, audit trail requirements, 6) Readiness Heatmap — visual summary of all workloads rated by modernization readiness (High/Medium/Low), 7) Recommended Sequencing — suggest modernization order based on readiness scores and dependency chains, 8) Risk-Adjusted Prioritization — balance readiness with business value and risk reduction potential.",
  },
  {
    id: "compliance_retention_gap",
    name: "Compliance & Data Retention Gap Assessment",
    description: "Compliance framework gaps, long-term data retention considerations including 7-year retention advisory.",
    reportType: "compliance",
    period: "last_quarter",
    icon: Database,
    group: "Modernization Readiness",
    prompt: "Generate a Compliance & Long-Term Data Retention Gap Assessment Report. Analyze compliance posture and data retention readiness. Include: 1) Current Compliance Posture — map existing controls and gaps against major frameworks (ISO 27001, NIST CSF, SOC 2, GDPR, PCI-DSS, HIPAA as applicable), 2) Data Retention Assessment — evaluate current data retention capabilities, identify systems with retention requirements, assess storage architecture for long-term retention, 3) 7-Year Retention Considerations (Advisory) — analyze regulatory requirements mandating extended retention (financial records, healthcare data, legal hold), assess infrastructure implications (storage scaling, data tiering, archival solutions), cost projections for long-term retention, 4) Data Classification Gaps — identify data stores without proper classification, sensitive data exposure risks, 5) Audit Trail & Logging Retention — assess log retention periods across security tools, SIEM, and infrastructure, identify gaps vs compliance requirements, 6) Data Sovereignty & Residency — geographic data storage requirements, cross-border data transfer considerations, 7) Retention Policy Maturity — score the organization's data retention governance (1-5 maturity), 8) Gap Remediation Roadmap — prioritized actions to close compliance and retention gaps with estimated effort and timeline. Advisory only.",
  },
  {
    id: "skills_governance_readiness",
    name: "Skills, Governance & Operating Model Readiness",
    description: "Organizational readiness for modernization — skills gaps, governance maturity, operating model assessment, and enablement recommendations.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Users,
    group: "Modernization Readiness",
    prompt: "Generate a Skills, Governance & Operating Model Readiness Assessment Report. Evaluate organizational readiness for infrastructure modernization. Include: 1) Skills Assessment — analyze current team capabilities based on technology estate (on-prem administration, cloud platform skills, automation/IaC, containerization, security operations), identify critical skill gaps for target-state operations, 2) Governance Maturity — assess change management processes, approval workflows, policy frameworks, and decision-making structures for modernization readiness, 3) Operating Model Assessment — evaluate current IT operating model (centralized vs federated, ITIL maturity, DevOps adoption), recommend target operating model considerations, 4) Enablement Recommendations — specific training programs, certification paths, and knowledge transfer activities needed, 5) Resource Planning — estimate additional headcount or contractor needs for modernization execution, 6) Organizational Change Readiness — assess cultural readiness for transformation, stakeholder alignment, executive sponsorship strength, 7) Knowledge Management — evaluate documentation practices, runbook completeness, knowledge base maturity, 8) Recommendations — prioritized enablement roadmap with training investments, hiring priorities, and governance framework improvements.",
  },
  {
    id: "risk_register_modernization",
    name: "Risk Register — Modernization Impact",
    description: "Prioritized risk register with risks scored by modernization impact, mitigation strategies, and risk ownership.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: AlertTriangle,
    group: "Modernization Readiness",
    prompt: "Generate a Risk Register Prioritized by Modernization Impact. Using the asset inventory, workload classification, EOL data, and discovery findings, produce: 1) Risk Register Table — comprehensive list of infrastructure and modernization risks with: Risk ID, Description, Category (Technical/Operational/Compliance/Financial/Organizational), Probability (1-5), Impact (1-5), Risk Score (P×I), Current Controls, Mitigation Strategy, Risk Owner, Target Date, 2) Modernization-Specific Risks — EOL platform exposure, dependency lock-in, data migration risks, skill gaps, vendor concentration, compliance gaps during transition, 3) Technical Debt Risks — legacy system fragility, unsupported software, undocumented dependencies, single points of failure, 4) Operational Risks — business continuity during migration, parallel operations costs, rollback scenarios, 5) Risk Heat Map — probability vs impact matrix visualization data, 6) Top 10 Critical Risks — detailed analysis of highest-priority risks with specific mitigation plans, 7) Risk Trend Indicators — which risks are increasing, stable, or decreasing, 8) Risk Treatment Plan — for each high/critical risk: Accept, Mitigate, Transfer, or Avoid with justification and timeline.",
  },
  {
    id: "network_euc_backup_readiness",
    name: "Network, EUC & Backup/Recovery Readiness",
    description: "Network infrastructure findings, end-user computing posture, backup coverage, and recovery readiness assessment.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: HardDrive,
    group: "Modernization Readiness",
    prompt: "Generate a Network, EUC & Backup/Recovery Readiness Findings Report. Analyze infrastructure readiness across three domains using asset and network data. Include: NETWORK READINESS: 1) Current network topology findings — subnet distribution, VLAN segmentation, NIC counts, 2) Bandwidth capacity assessment for cloud connectivity, 3) DNS/DHCP infrastructure readiness, 4) Network security control inventory (firewalls, IDS/IPS, NAC). END-USER COMPUTING (EUC): 5) Workstation inventory — OS versions, hardware age, deployment types, 6) EUC modernization readiness — Windows 10/11 migration status, virtual desktop readiness, 7) Endpoint security coverage — EDR deployment, patch compliance, encryption status. BACKUP & RECOVERY: 8) Backup tool coverage — percentage of assets with backup solutions, backup tool distribution, 9) Recovery readiness — DR server inventory, replication status, RPO/RTO assessment from current capabilities, 10) Monitoring coverage — percentage of assets with active monitoring, monitoring tool distribution, gap identification. Provide quantitative findings from the asset inventory data. Use RAG status indicators for each area.",
  },
  {
    id: "bcdr_posture_resilience",
    name: "BC/DR Posture & Resilience Scoring",
    description: "Business continuity assessment, disaster recovery posture (no DR design), and continuity/resilience readiness scoring.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Shield,
    group: "Modernization Readiness",
    prompt: "Generate a Business Continuity & Disaster Recovery Posture Assessment with Resilience Scoring. Using the asset inventory, BC posture data, and monitoring coverage, produce: 1) BC/DR Posture Overview — current DR server count, backup tool coverage percentage, monitoring coverage, replication capabilities, 2) Resilience Readiness Scoring — score (0-100) across dimensions: Infrastructure Redundancy, Data Protection, Recovery Capability, Monitoring & Alerting, Documentation & Runbooks, 3) RPO/RTO Assessment — estimated recovery objectives based on current backup and replication capabilities per workload tier, 4) Single Points of Failure — identify critical systems without redundancy, applications on single servers, unmonitored critical assets, 5) DR Environment Assessment — DR server inventory, geographic distribution, failover readiness (no DR design — assessment only), 6) Backup Coverage Analysis — assets with/without backup solutions, backup frequency indicators, retention period adequacy, 7) Business Impact Categories — classify applications/workloads by criticality tier (Tier 1-Critical through Tier 4-Non-Essential), 8) Resilience Gap Analysis — key gaps between current posture and industry best practices, 9) Recommendations — prioritized resilience improvements without designing DR solutions. Assessment and scoring only.",
  },

  {
    id: "quickwin_year1_focus",
    name: "Quick-Win Recommendations & Year-1 Focus",
    description: "Immediate quick-win migration candidates, Year-1 advisory priorities, and early action items for maximum impact.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Zap,
    group: "Strategic Roadmap & Recommendations",
    prompt: "Generate a Quick-Win Recommendations & Year-1 Advisory Focus Areas Report. Using the workload classification, quick-win candidates, and risk data, produce: 1) Quick-Win Candidates — list all identified quick-win workloads (already virtualized, modern OS, standard applications, low dependency complexity) with migration readiness scores and estimated effort, 2) Year-1 Priority Actions — top 10-15 actions to execute in the first year, organized by: a) Immediate wins (0-3 months): decommission retired assets, patch critical EOL systems, close monitoring gaps, b) Short-term (3-6 months): migrate quick-win workloads, establish cloud landing zone, implement automation foundations, c) Medium-term (6-12 months): begin standard workload migrations, modernize identity infrastructure, enhance security controls, 3) Risk Reduction Impact — estimated risk score reduction from each recommended action, 4) Resource Requirements — estimated effort and team requirements for Year-1 activities, 5) Success Metrics — KPIs to track Year-1 progress (assets migrated, EOL reduced, coverage improved), 6) Dependencies & Prerequisites — what must be in place before each action, 7) Budget Guidance — high-level cost categories for Year-1 activities (advisory level, not detailed estimates). Focus on actionable, high-impact recommendations.",
  },
  {
    id: "tech_debt_reduction",
    name: "Technical Debt Reduction Plan",
    description: "Decommission candidates, dependency considerations, EOL remediation priorities, and technical debt advisory roadmap.",
    reportType: "risk_posture",
    period: "last_quarter",
    icon: Settings,
    group: "Strategic Roadmap & Recommendations",
    prompt: "Generate a Technical Debt Reduction Advisory Plan. Analyze the infrastructure estate to identify and prioritize technical debt. Include: 1) Technical Debt Inventory — comprehensive catalog of debt items: EOL operating systems and versions (with server counts), unsupported hypervisor versions, outdated hardware, legacy applications without vendor support, undocumented systems, 2) Decommission Candidates — assets recommended for retirement with justification (EOL, low utilization, redundant, no business owner), estimated savings from decommission, dependency impact analysis, 3) Dependency Considerations — systems that cannot be decommissioned due to upstream/downstream dependencies, required migration sequencing to safely retire debt, 4) EOL Remediation Priorities — ranked list of EOL items by risk exposure (critical systems first), recommended upgrade paths with target versions, 5) License Optimization — identify unused/underutilized licenses, consolidation opportunities, version standardization recommendations, 6) Monitoring & Observability Debt — systems without adequate monitoring, logging gaps, alerting deficiencies, 7) Security Debt — unpatched systems, missing security controls, compliance gaps, 8) Debt Reduction Roadmap — phased plan (Quarter 1-4) with estimated effort and risk reduction per phase. Advisory only.",
  },
  {
    id: "strategic_modernization_roadmap",
    name: "3-5 Year Strategic Modernization Roadmap",
    description: "Executive-level multi-year roadmap — Year-1/2/3+ priorities, workload grouping, sequencing, decision gates, and strategic direction.",
    reportType: "executive_summary",
    period: "last_quarter",
    icon: Route,
    group: "Strategic Roadmap & Recommendations",
    prompt: "Generate an Executive-Level 3-5 Year Strategic Modernization Roadmap. Using all assessment data (platform posture, workload classification, risk register, quick-wins, technical debt), produce a comprehensive strategic roadmap: 1) Year-1 Priorities — foundation building: cloud landing zone, quick-win migrations, EOL remediation, identity modernization, monitoring enhancement, governance framework establishment, 2) Year-2 Priorities — scale and standardize: standard workload migration waves, automation maturity, security modernization, skills development, operating model evolution, 3) Year-3+ Strategic Direction — advanced modernization: application modernization (beyond lift-and-shift), cloud-native adoption, advanced analytics/observability, continuous optimization, innovation enablement, 4) Workload Grouping — categorize all workloads by target destination: Cloud (Rehost/Replatform), On-Premises (Retain), Hybrid, Retire, with server counts and rationale, 5) High-Level Sequencing — migration wave planning with dependency-aware ordering and decision gates between phases, 6) Cloud Considerations — multi-cloud strategy, vendor selection factors, cost management approach, 7) Network Considerations — hybrid connectivity evolution, SD-WAN, segmentation modernization, 8) EUC, Backup & Resilience Considerations — endpoint modernization, backup evolution, DR strategy maturity, 9) Decision Gates — key go/no-go criteria between phases, risk checkpoints, budget reviews, 10) Investment Summary — high-level budget guidance by year. Executive-level — strategic direction, not detailed implementation plans.",
  },
  {
    id: "executive_leadership_summary",
    name: "Executive Summary & Leadership Presentation",
    description: "Board-ready executive summary covering all assessment findings — suitable for senior leadership review and strategic decision-making.",
    reportType: "executive_summary",
    period: "last_quarter",
    icon: Presentation,
    group: "Strategic Roadmap & Recommendations",
    prompt: "Generate an Executive-Level Summary & Presentation Report for Senior Leadership Review. This should synthesize all assessment findings into a concise, board-ready format. Include: 1) Assessment Overview — scope of assessment (total assets discovered, platforms covered, applications inventoried), key data sources analyzed, 2) Current State Summary — infrastructure composition at a glance (on-prem/cloud split, platform distribution, environment breakdown), overall health score (0-100), 3) Key Findings (Top 10) — the most significant discoveries organized by impact: critical risks, major gaps, quick-win opportunities, strategic considerations, 4) Risk Posture Summary — aggregate risk score, top risk categories, EOL exposure, compliance gaps, single points of failure count, 5) Modernization Readiness — overall readiness score, workload distribution by 6R recommendation (Rehost/Replatform/Retain/Retire percentages), estimated migration complexity, 6) Quick-Win Summary — number of quick-win candidates, estimated Year-1 savings and risk reduction, 7) Strategic Recommendations (Top 5) — highest-impact recommendations requiring leadership decisions, with estimated investment and expected outcomes, 8) Proposed Roadmap Summary — 3-year high-level timeline with major milestones and decision gates, 9) Investment Guidance — high-level budget categories and magnitude, 10) Next Steps — immediate actions requiring executive approval. Keep language business-oriented, minimize technical jargon, focus on risk, investment, and business outcomes.",
  },
];

function getTypeInfo(reportType: string) {
  return REPORT_TYPES[reportType] || REPORT_TYPES.executive_summary;
}


function formatPeriod(period: string) {
  return period.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function SectionNumber({ num }: { num: number }) {
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 text-white text-[12px] font-bold mr-3 shrink-0">
      {String(num).padStart(2, "0")}
    </span>
  );
}

function SectionHeading({ id, title, num, accent, subtitle }: { id: string; title: string; num: number; accent: string; subtitle?: string }) {
  return (
    <div id={id} className="scroll-mt-20 mb-8">
      <div className="rounded-lg overflow-hidden" style={{ background: `linear-gradient(135deg, #0f172a, #1e293b)` }}>
        <div className="h-[3px]" style={{ backgroundColor: accent }} />
        <div className="px-5 py-4 flex items-center gap-0">
          <SectionNumber num={num} />
          <div>
            <h2 className="text-[16px] font-bold tracking-wide uppercase text-white" style={{ letterSpacing: "0.08em" }}>{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function GaugeChart({ score, maxScore = 100, size = 120, label }: { score: number; maxScore?: number; size?: number; label?: string }) {
  const pct = Math.min(score / maxScore, 1);
  const color = pct >= 0.8 ? "#10b981" : pct >= 0.6 ? "#3b82f6" : pct >= 0.4 ? "#f59e0b" : "#ef4444";
  const r = (size - 16) / 2;
  const circumference = Math.PI * r;
  const dashOffset = circumference * (1 - pct);
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path d={`M 8 ${size / 2 + 8} A ${r} ${r} 0 0 1 ${size - 8} ${size / 2 + 8}`} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" strokeLinecap="round" />
        <path d={`M 8 ${size / 2 + 8} A ${r} ${r} 0 0 1 ${size - 8} ${size / 2 + 8}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} className="transition-all duration-1000" />
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" className="text-xl font-bold" fill="currentColor" fontSize="22" fontWeight="700">{score}</text>
        {label && <text x={size / 2} y={size / 2 + 18} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="9">{label}</text>}
      </svg>
    </div>
  );
}

function RiskScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "bg-red-500" : score >= 60 ? "bg-orange-500" : score >= 40 ? "bg-amber-500" : "bg-emerald-500";
  const label = score >= 80 ? "Critical" : score >= 60 ? "High" : score >= 40 ? "Medium" : "Low";
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <span className="text-sm font-bold">{score}/100</span>
      <Badge variant="outline" className="text-[9px] uppercase">{label}</Badge>
    </div>
  );
}

function FullScreenReportViewer({ report, onClose }: { report: Report; onClose: () => void }) {
  const { currentTenant } = useTenant();
  const fmt = useTenantDateFormatter();
  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [activeSection, setActiveSection] = useState("cover");
  const [scrollProgress, setScrollProgress] = useState(0);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const typeInfo = getTypeInfo((report as any).reportType || "executive_summary");
  const TypeIcon = typeInfo.icon;
  const findings = (report.findings as any[]) || [];
  const recommendations = (report.recommendations as any[]) || [];
  const metrics = (report.metrics as any) || {};
  const keyHighlights = metrics.keyHighlights || [];
  const riskMatrix = metrics.riskMatrix || [];
  const sections = metrics.sections || [];
  const trendAnalysis = metrics.trendAnalysis || "";
  const complianceNotes = metrics.complianceNotes || "";
  const conclusion = metrics.conclusion || "";
  const documentControl = metrics.documentControl || {};
  const managementSummary = metrics.managementSummary || {};
  const scopeAndMethodology = metrics.scopeAndMethodology || {};
  const securityScorecard = metrics.securityScorecard || {};
  const maturityAssessment = metrics.maturityAssessment || {};
  const attackChainAnalysis = metrics.attackChainAnalysis || [];
  const complianceMapping = metrics.complianceMapping || [];
  const appendix = metrics.appendix || {};
  const executiveOverview = metrics.executiveOverview || {};
  const assetCoverage = metrics.assetCoverage || [];
  const incidentSummary = metrics.incidentSummary || {};
  const msspValueStatement = metrics.msspValueStatement || {};
  const detectionMetrics = metrics.detectionMetrics || {};
  const threatAnalysis = metrics.threatAnalysis || {};
  const assetCensus = metrics.assetCensus || {};
  const identityAnalysis = metrics.identityAnalysis || {};
  const coverageAnalysis = metrics.coverageAnalysis || {};
  const eolTracking = metrics.eolTracking || {};
  const controlEffectiveness = metrics.controlEffectiveness || [];
  const gapAnalysis = metrics.gapAnalysis || [];
  const investmentAnalysis = metrics.investmentAnalysis || {};
  const platformBreakdown = metrics.platformBreakdown || {};
  const workloadClassification = metrics.workloadClassification || {};
  const eolAnalysis = metrics.eolAnalysis || {};

  const skipMetricKeys = ["keyHighlights", "riskMatrix", "trendAnalysis", "complianceNotes", "sections", "conclusion", "documentControl", "managementSummary", "scopeAndMethodology", "securityScorecard", "maturityAssessment", "attackChainAnalysis", "complianceMapping", "appendix", "executiveOverview", "assetCoverage", "incidentSummary", "msspValueStatement", "detectionMetrics", "threatAnalysis", "assetCensus", "identityAnalysis", "coverageAnalysis", "eolTracking", "controlEffectiveness", "gapAnalysis", "investmentAnalysis", "platformBreakdown", "workloadClassification", "eolAnalysis"];
  const topMetrics: { key: string; value: any }[] = [];
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === "number" || typeof value === "string") {
      if (!skipMetricKeys.includes(key)) {
        topMetrics.push({ key, value });
      }
    }
  }

  let sectionNum = 0;
  const tocItems: { id: string; label: string; num: number }[] = [
    { id: "cover", label: "Cover Page", num: 0 },
  ];
  if (documentControl.version) { sectionNum++; tocItems.push({ id: "doc-control", label: "Document Control", num: sectionNum }); }
  if (managementSummary.overallRiskRating || managementSummary.ragStatus) { sectionNum++; tocItems.push({ id: "mgmt-summary", label: "Management Summary", num: sectionNum }); }
  if (scopeAndMethodology.scope) { sectionNum++; tocItems.push({ id: "scope", label: "Scope & Methodology", num: sectionNum }); }
  if (report.executiveSummary) { sectionNum++; tocItems.push({ id: "executive-summary", label: "Executive Summary", num: sectionNum }); }
  if (executiveOverview.totalAssets || executiveOverview.overallRiskPosture) { sectionNum++; tocItems.push({ id: "executive-overview", label: "Executive Overview", num: sectionNum }); }
  if (assetCoverage.length > 0) { sectionNum++; tocItems.push({ id: "asset-coverage", label: "Asset & Security Coverage", num: sectionNum }); }
  if (incidentSummary.totalIncidents || incidentSummary.bySeverity) { sectionNum++; tocItems.push({ id: "incident-summary", label: "Incident Summary", num: sectionNum }); }
  if (detectionMetrics.totalAlerts != null || detectionMetrics.detectionRate != null) { sectionNum++; tocItems.push({ id: "detection-metrics", label: "Detection & Response Metrics", num: sectionNum }); }
  if (threatAnalysis.topAttackVectors || threatAnalysis.topMitreTactics) { sectionNum++; tocItems.push({ id: "threat-analysis", label: "Threat Analysis", num: sectionNum }); }
  if (assetCensus.totalDevices != null || assetCensus.byType) { sectionNum++; tocItems.push({ id: "asset-census", label: "Asset Census & Classification", num: sectionNum }); }
  if (identityAnalysis.totalUsers != null) { sectionNum++; tocItems.push({ id: "identity-analysis", label: "Identity & Access Analysis", num: sectionNum }); }
  if (coverageAnalysis.edrCoverage || coverageAnalysis.coverageChart) { sectionNum++; tocItems.push({ id: "coverage-analysis", label: "Security Coverage Analysis", num: sectionNum }); }
  if (eolTracking.totalEolAssets) { sectionNum++; tocItems.push({ id: "eol-tracking", label: "EOL/EOS Tracking", num: sectionNum }); }
  if (controlEffectiveness.length > 0) { sectionNum++; tocItems.push({ id: "control-effectiveness", label: "Control Effectiveness", num: sectionNum }); }
  if (gapAnalysis.length > 0) { sectionNum++; tocItems.push({ id: "gap-analysis", label: "Gap Analysis", num: sectionNum }); }
  if (investmentAnalysis.roiPercent || investmentAnalysis.costAvoidance) { sectionNum++; tocItems.push({ id: "investment-analysis", label: "Investment Analysis", num: sectionNum }); }
  if (platformBreakdown.distributions || platformBreakdown.chartData) { sectionNum++; tocItems.push({ id: "platform-breakdown", label: "Platform Distribution", num: sectionNum }); }
  if (workloadClassification.sixR) { sectionNum++; tocItems.push({ id: "workload-classification", label: "Workload Classification (6R)", num: sectionNum }); }
  if (eolAnalysis.totalEol) { sectionNum++; tocItems.push({ id: "eol-analysis", label: "EOL Risk Analysis", num: sectionNum }); }
  if (keyHighlights.length > 0) { sectionNum++; tocItems.push({ id: "highlights", label: "Key Performance Indicators", num: sectionNum }); }
  if (securityScorecard.categories) { sectionNum++; tocItems.push({ id: "scorecard", label: "Security Scorecard", num: sectionNum }); }
  if (maturityAssessment.domains) { sectionNum++; tocItems.push({ id: "maturity", label: "Security Maturity Assessment", num: sectionNum }); }
  if (topMetrics.length > 0) { sectionNum++; tocItems.push({ id: "metrics", label: "Metrics Dashboard", num: sectionNum }); }
  if (findings.length > 0) { sectionNum++; tocItems.push({ id: "findings", label: "Detailed Findings", num: sectionNum }); }
  if (attackChainAnalysis.length > 0) { sectionNum++; tocItems.push({ id: "attack-chains", label: "Attack Chain Analysis", num: sectionNum }); }
  if (riskMatrix.length > 0) { sectionNum++; tocItems.push({ id: "risk-matrix", label: "Risk Assessment Matrix", num: sectionNum }); }
  sections.forEach((s: any, i: number) => { sectionNum++; tocItems.push({ id: `section-${i}`, label: s.title, num: sectionNum }); });
  if (recommendations.length > 0) { sectionNum++; tocItems.push({ id: "recommendations", label: "Recommendations & Roadmap", num: sectionNum }); }
  if (trendAnalysis) { sectionNum++; tocItems.push({ id: "trend-analysis", label: "Trend Analysis", num: sectionNum }); }
  if (complianceMapping.length > 0) { sectionNum++; tocItems.push({ id: "compliance-mapping", label: "Compliance Mapping", num: sectionNum }); }
  if (complianceNotes) { sectionNum++; tocItems.push({ id: "compliance", label: "Compliance & Regulatory Notes", num: sectionNum }); }
  if (msspValueStatement.incidentsPrevented || msspValueStatement.threatsBlocked || msspValueStatement.hoursSaved) { sectionNum++; tocItems.push({ id: "mssp-value", label: "MSSP Value Statement", num: sectionNum }); }
  if (conclusion) { sectionNum++; tocItems.push({ id: "conclusion", label: "Conclusion & Next Steps", num: sectionNum }); }
  if (appendix.glossary || appendix.severityDefinitions) { sectionNum++; tocItems.push({ id: "appendix", label: "Appendices", num: sectionNum }); }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    const el = contentScrollRef.current;
    const handleScroll = () => {
      if (!el) return;
      const pct = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100;
      setScrollProgress(Math.min(100, Math.max(0, pct)));
      // Update active section via intersection
      const ids = tocItems.map(t => t.id);
      for (const id of [...ids].reverse()) {
        const el2 = document.getElementById(id);
        if (el2 && el2.getBoundingClientRect().top <= 120) { setActiveSection(id); break; }
      }
    };
    el?.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      el?.removeEventListener("scroll", handleScroll);
      document.body.style.overflow = "";
    };
  }, [onClose, tocItems]);

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const brandParam = currentTenant?.name ? `?brandName=${encodeURIComponent(currentTenant.name)}` : "";
      const response = await fetch(`/api/reports/${report.id}/pdf${brandParam}`, { credentials: "include" });
      if (!response.ok) throw new Error("PDF generation failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.title.replace(/\s+/g, "_")}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "PDF exported", description: "Professional-quality PDF report downloaded successfully." });
    } catch (err) {
      console.error("PDF export failed:", err);
      toast({ title: "Export failed", description: "Could not generate PDF.", variant: "destructive" });
    }
    setExporting(false);
  }, [report.id, report.title, currentTenant?.name, toast]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el && contentScrollRef.current) {
      const containerTop = contentScrollRef.current.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      contentScrollRef.current.scrollBy({ top: elTop - containerTop - 80, behavior: "smooth" });
    }
  };

  const riskColor = (likelihood: number, impact: number) => {
    const score = likelihood * impact;
    if (score >= 16) return "bg-red-500/20 text-red-700 dark:text-red-300";
    if (score >= 9) return "bg-orange-500/20 text-orange-700 dark:text-orange-300";
    if (score >= 4) return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300";
    return "bg-green-500/20 text-green-700 dark:text-green-300";
  };

  const killChainColors: Record<string, string> = {
    "Reconnaissance": "#6366f1", "Weaponization": "#8b5cf6", "Delivery": "#a855f7",
    "Exploitation": "#ef4444", "Installation": "#f97316", "Command & Control": "#dc2626",
    "Actions on Objectives": "#991b1b",
  };

  const mitigationBadge = (status: string) => {
    if (status === "Blocked") return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 text-[9px]">Blocked</Badge>;
    if (status === "Detected") return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 text-[9px]">Detected</Badge>;
    return <Badge className="bg-red-500/15 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 text-[9px]">Missed</Badge>;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex" data-testid="report-viewer-overlay">
      <div className="w-64 border-r bg-slate-50 dark:bg-slate-900/50 flex flex-col shrink-0">
        <div className="p-4 border-b bg-slate-900 dark:bg-slate-950">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${typeInfo.accent}25` }}>
              <TypeIcon className="w-5 h-5" style={{ color: typeInfo.accent }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{typeInfo.label}</p>
              <p className="text-[10px] text-slate-400">{fmt.formatDate(report.createdAt)}</p>
            </div>
          </div>
          {documentControl.documentId && (
            <p className="text-[9px] text-slate-500 font-mono mt-1">REF: {documentControl.documentId}</p>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5" data-testid="report-toc-nav">
          {tocItems.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-[11px] transition-all flex items-center gap-2 ${
                activeSection === item.id
                  ? "bg-slate-900 dark:bg-white/10 text-white dark:text-white font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5"
              }`}
              data-testid={`toc-link-${item.id}`}
            >
              {item.num > 0 && (
                <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                  activeSection === item.id ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                }`}>
                  {item.num}
                </span>
              )}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 border-t space-y-2 bg-slate-100 dark:bg-slate-900/80">
          <Button variant="default" size="sm" className="w-full gap-2" onClick={handleExportPDF} disabled={exporting} data-testid="button-export-pdf">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            {exporting ? "Exporting..." : "Export PDF"}
          </Button>
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={onClose} data-testid="button-close-viewer">
            <X className="w-3.5 h-3.5" /> Close
          </Button>
        </div>
      </div>

      <div ref={contentScrollRef} className="flex-1 overflow-y-auto bg-white dark:bg-background relative">
        {/* Reading progress bar */}
        <div className="sticky top-0 z-30 w-full">
          <div className="h-0.5 bg-muted/30 w-full">
            <div
              className="h-0.5 transition-all duration-150"
              style={{ width: `${scrollProgress}%`, backgroundColor: typeInfo.accent }}
            />
          </div>
          {/* Sticky section label */}
          {activeSection !== "cover" && (
            <div className="flex items-center gap-3 px-6 py-1.5 bg-white/95 dark:bg-background/95 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-700/60">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: typeInfo.accent }} />
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 tracking-wide truncate">
                {tocItems.find(t => t.id === activeSection)?.label || ""}
              </span>
              <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">{Math.round(scrollProgress)}%</span>
            </div>
          )}
        </div>
        <div ref={reportRef} className="max-w-[900px] mx-auto">

          {/* COVER PAGE */}
          <div id="cover" className="scroll-mt-4 relative overflow-hidden" style={{ minHeight: "70vh" }}>
            <div className="absolute inset-0" style={{
              background: `linear-gradient(135deg, ${typeInfo.accent}08 0%, transparent 60%)`,
            }} />
            <div className="absolute top-0 left-0 right-0 h-[6px]" style={{ backgroundColor: typeInfo.accent }} />
            <div className="absolute top-[6px] left-0 right-0 h-20" style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)" }} />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-200 dark:bg-slate-700" />

            <div className="relative z-10 px-12 pt-0 pb-12 flex flex-col justify-between" style={{ minHeight: "70vh" }}>
              <div>
                <div className="flex items-center justify-between py-5 -mx-12 px-12" style={{ marginTop: 6 }}>
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-white/10" style={{ border: `1px solid ${typeInfo.accent}40` }}>
                      <Shield className="w-5 h-5" style={{ color: typeInfo.accent }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold tracking-wider text-white uppercase" style={{ letterSpacing: "0.15em" }}>{currentTenant?.name || "Cyber Command Center"}</p>
                      <p className="text-[9px] text-slate-400 uppercase tracking-[0.25em]">Managed Security Services</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className="text-[9px] uppercase tracking-wider bg-blue-500/20 text-blue-300 border-blue-400/30 hover:bg-blue-500/20">
                      {documentControl.classification || "Confidential"}
                    </Badge>
                  </div>
                </div>

                <div className="mb-10">
                  <p className="text-[11px] uppercase tracking-[0.25em] font-semibold mb-4" style={{ color: typeInfo.accent }}>{typeInfo.label}</p>
                  <h1 className="text-[32px] font-extrabold tracking-tight leading-[1.15] text-slate-900 dark:text-white mb-4">
                    {report.title}
                  </h1>
                  <div className="h-1 w-24 rounded-full mb-6" style={{ backgroundColor: typeInfo.accent }} />
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
                    Prepared exclusively for <span className="font-semibold text-slate-900 dark:text-white">{currentTenant?.name || "Organization"}</span>
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Report Period", value: formatPeriod(report.period) },
                    { label: "Date of Issue", value: fmt.formatDate(report.createdAt) },
                    { label: "Document ID", value: documentControl.documentId || "N/A" },
                    { label: "Version", value: documentControl.version || "1.0" },
                  ].map((card, i) => (
                    <div key={i} className="relative overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-4">
                      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: typeInfo.accent }} />
                      <p className="text-[8px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-2">{card.label}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{card.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto pt-8">
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Confidentiality Notice</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    This document contains confidential and proprietary information. It is intended solely for the use of the individual(s) and entity named above. Unauthorized review, dissemination, distribution, or copying of this document is strictly prohibited. If you have received this document in error, please notify the sender immediately and destroy all copies.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-12 pb-12 space-y-12">

            {/* TABLE OF CONTENTS */}
            {tocItems.length > 3 && (
              <div className="py-8">
                <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-400 mb-6 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Table of Contents
                </h3>
                <div className="space-y-0">
                  {tocItems.filter(t => t.id !== "cover").map((item) => (
                    <button
                      key={item.id}
                      onClick={() => scrollToSection(item.id)}
                      className="flex items-center w-full text-left py-2 group border-b border-dotted border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      data-testid={`toc-item-${item.id}`}
                    >
                      <span className="text-[11px] font-bold text-slate-400 w-8 shrink-0">{item.num > 0 ? `${item.num}.` : ""}</span>
                      <span className="text-[13px] text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white font-medium flex-1">{item.label}</span>
                      <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* DOCUMENT CONTROL */}
            {documentControl.version && (() => {
              const n = tocItems.find(t => t.id === "doc-control")?.num || 0;
              return (
                <div>
                  <SectionHeading id="doc-control" title="Document Control" num={n} accent={typeInfo.accent} subtitle="Document metadata and distribution information" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <tbody>
                        {[
                          ["Document ID", documentControl.documentId],
                          ["Version", documentControl.version],
                          ["Classification", documentControl.classification],
                          ["Prepared By", documentControl.preparedBy],
                          ["Reviewed By", documentControl.reviewedBy],
                          ["Approved By", documentControl.approvedBy],
                          ["Date of Issue", fmt.formatDate(report.createdAt)],
                        ].map(([label, value], i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-slate-50 dark:bg-slate-800/30" : ""}>
                            <td className="p-3 font-semibold text-slate-600 dark:text-slate-400 w-40 border-r border-slate-200 dark:border-slate-700">{label}</td>
                            <td className="p-3 text-slate-900 dark:text-slate-200">{value || "N/A"}</td>
                          </tr>
                        ))}
                        {documentControl.distributionList && (
                          <tr className="bg-slate-50 dark:bg-slate-800/30">
                            <td className="p-3 font-semibold text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">Distribution</td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1.5">
                                {documentControl.distributionList.map((d: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-[10px]">{d}</Badge>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* MANAGEMENT SUMMARY */}
            {(managementSummary.overallRiskRating || managementSummary.ragStatus) && (() => {
              const n = tocItems.find(t => t.id === "mgmt-summary")?.num || 0;
              const ragStatus = managementSummary.ragStatus || [];
              return (
                <div>
                  <SectionHeading id="mgmt-summary" title="Management Summary" num={n} accent={typeInfo.accent} subtitle="Strategic overview and key risk indicators" />

                  <div className="grid grid-cols-3 gap-6 mb-8">
                    <div className="col-span-1 flex flex-col items-center justify-center p-6 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
                      <GaugeChart score={managementSummary.overallRiskScore || 0} label="Risk Score" size={140} />
                      <div className="mt-3 text-center">
                        <Badge className={`text-[10px] uppercase ${
                          managementSummary.overallRiskRating === "critical" ? "bg-red-500/15 text-red-700 border-red-300" :
                          managementSummary.overallRiskRating === "high" ? "bg-orange-500/15 text-orange-700 border-orange-300" :
                          managementSummary.overallRiskRating === "medium" ? "bg-amber-500/15 text-amber-700 border-amber-300" :
                          "bg-emerald-500/15 text-emerald-700 border-emerald-300"
                        }`}>
                          {managementSummary.overallRiskRating || "N/A"} Risk
                        </Badge>
                        {managementSummary.previousRiskScore != null && (
                          <div className="flex items-center justify-center gap-1 mt-2 text-[10px] text-slate-500">
                            {managementSummary.riskTrend === "increasing" ? <ArrowUp className="w-3 h-3 text-red-500" /> : managementSummary.riskTrend === "decreasing" ? <ArrowDown className="w-3 h-3 text-emerald-500" /> : <Minus className="w-3 h-3" />}
                            Previous: {managementSummary.previousRiskScore}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="col-span-2 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">Security Domain Status (RAG)</p>
                      <div className="grid grid-cols-2 gap-2">
                        {ragStatus.map((rag: any, i: number) => {
                          const rc = RAG_COLORS[rag.status] || RAG_COLORS.green;
                          return (
                            <div key={i} className={`p-3 rounded-lg border ${rc.bg} ${rc.border}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{rag.area}</span>
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-2.5 h-2.5 rounded-full ${rc.dot}`} />
                                  <span className="text-[10px] font-bold text-slate-500">{rag.score}</span>
                                </div>
                              </div>
                              <p className="text-[9px] text-slate-500 leading-relaxed">{safeRender(rag.detail)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {managementSummary.criticalActions && managementSummary.criticalActions.length > 0 && (
                    <div className="p-5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">Critical Actions Required</span>
                      </div>
                      <div className="space-y-2">
                        {managementSummary.criticalActions.map((action: string, i: number) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[10px] font-bold text-red-600 mt-0.5 shrink-0">{i + 1}.</span>
                            <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">{safeRender(action)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* SCOPE & METHODOLOGY */}
            {scopeAndMethodology.scope && (() => {
              const n = tocItems.find(t => t.id === "scope")?.num || 0;
              return (
                <div>
                  <SectionHeading id="scope" title="Scope & Methodology" num={n} accent={typeInfo.accent} subtitle="Assessment boundaries and analytical approach" />
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Scope of Assessment</h4>
                      <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap pl-4 border-l-2 border-slate-200 dark:border-slate-700">{safeRender(scopeAndMethodology.scope)}</div>
                    </div>
                    {scopeAndMethodology.methodology && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Methodology</h4>
                        <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap pl-4 border-l-2 border-slate-200 dark:border-slate-700">{safeRender(scopeAndMethodology.methodology)}</div>
                      </div>
                    )}
                    {scopeAndMethodology.dataSources && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Data Sources Analyzed</h4>
                        <div className="flex flex-wrap gap-2">
                          {(Array.isArray(scopeAndMethodology.dataSources) ? scopeAndMethodology.dataSources : []).map((ds: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] bg-slate-50 dark:bg-slate-800/30">{safeRender(ds)}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {scopeAndMethodology.limitations && (
                      <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">Limitations & Caveats</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{safeRender(scopeAndMethodology.limitations)}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* EXECUTIVE SUMMARY */}
            {report.executiveSummary && (() => {
              const n = tocItems.find(t => t.id === "executive-summary")?.num || 0;
              return (
                <div>
                  <SectionHeading id="executive-summary" title="Executive Summary" num={n} accent={typeInfo.accent} subtitle="High-level findings and strategic context" />
                  <div className="text-[13px] leading-[1.8] text-slate-600 dark:text-slate-400 whitespace-pre-wrap pl-5 border-l-[3px]" style={{ borderColor: typeInfo.accent }}>
                    {safeRender(report.executiveSummary)}
                  </div>
                </div>
              );
            })()}

            {/* EXECUTIVE OVERVIEW */}
            {(executiveOverview.totalAssets || executiveOverview.overallRiskPosture) && (() => {
              const n = tocItems.find(t => t.id === "executive-overview")?.num || 0;
              const riskPosture = executiveOverview.overallRiskPosture || "N/A";
              const riskPostureColor = riskPosture === "Critical" ? "text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                : riskPosture === "High" ? "text-orange-600 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                : riskPosture === "Medium" ? "text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                : "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";
              return (
                <div>
                  <SectionHeading id="executive-overview" title="Executive Overview" num={n} accent={typeInfo.accent} subtitle="Key metrics and organizational risk posture" />
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="executive-overview-stats">
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Total Assets</p>
                      <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white" data-testid="text-total-assets">{executiveOverview.totalAssets || 0}</p>
                    </div>
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Security Coverage</p>
                      <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white" data-testid="text-security-coverage">{executiveOverview.securityCoveragePercent || 0}%</p>
                    </div>
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Total Incidents</p>
                      <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white" data-testid="text-total-incidents">{executiveOverview.totalIncidents || 0}</p>
                      {executiveOverview.criticalIncidents > 0 && (
                        <p className="text-[10px] text-red-500 font-semibold mt-1">{executiveOverview.criticalIncidents} Critical</p>
                      )}
                    </div>
                    <div className={`p-5 rounded-xl border text-center ${riskPostureColor}`}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-70 mb-2">Risk Posture</p>
                      <p className="text-2xl font-extrabold tracking-tight" data-testid="text-risk-posture">{riskPosture}</p>
                    </div>
                  </div>
                  {executiveOverview.compliancePosture && (
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 mb-6">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">Compliance Posture</p>
                      <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed" data-testid="text-compliance-posture">{safeRender(executiveOverview.compliancePosture)}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    {executiveOverview.topRisks && executiveOverview.topRisks.length > 0 && (
                      <div className="p-5 rounded-xl bg-red-50 dark:bg-red-950/15 border border-red-200 dark:border-red-800/30" data-testid="executive-overview-risks">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-3">Top 3 Risks</p>
                        <div className="space-y-2">
                          {executiveOverview.topRisks.map((risk: string, i: number) => (
                            <div key={i} className="flex items-start gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                              <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">{safeRender(risk)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {executiveOverview.topRecommendations && executiveOverview.topRecommendations.length > 0 && (
                      <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/15 border border-emerald-200 dark:border-emerald-800/30" data-testid="executive-overview-recommendations">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-3">Top 3 Recommendations</p>
                        <div className="space-y-2">
                          {executiveOverview.topRecommendations.map((rec: string, i: number) => (
                            <div key={i} className="flex items-start gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                              <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">{safeRender(rec)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ASSET & SECURITY COVERAGE MATRIX */}
            {assetCoverage.length > 0 && (() => {
              const n = tocItems.find(t => t.id === "asset-coverage")?.num || 0;
              const coverageColor = (pct: number) => {
                if (pct >= 80) return "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30";
                if (pct >= 50) return "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30";
                return "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30";
              };
              return (
                <div>
                  <SectionHeading id="asset-coverage" title="Asset & Security Coverage" num={n} accent={typeInfo.accent} subtitle="Infrastructure inventory and protection scope" />
                  <div className="overflow-x-auto" data-testid="asset-coverage-table">
                    <table className="w-full text-xs border-collapse border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-slate-900 dark:bg-slate-800 text-white">
                          <th className="p-3 text-left font-bold text-[10px] uppercase tracking-wider">Asset Type</th>
                          <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider w-20">Total</th>
                          <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider w-20">Protected</th>
                          <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider w-24">Coverage %</th>
                          <th className="p-3 text-left font-bold text-[10px] uppercase tracking-wider">Technology</th>
                          <th className="p-3 text-left font-bold text-[10px] uppercase tracking-wider">Gaps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assetCoverage.map((ac: any, i: number) => (
                          <tr key={i} className={`border-b border-slate-200 dark:border-slate-700 ${i % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-slate-50 dark:bg-slate-800/20"}`} data-testid={`asset-coverage-row-${i}`}>
                            <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{ac.assetType}</td>
                            <td className="p-3 text-center font-bold text-slate-900 dark:text-white">{ac.total}</td>
                            <td className="p-3 text-center font-bold text-slate-900 dark:text-white">{ac.protected}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[11px] font-bold ${coverageColor(ac.coveragePercent)}`}>
                                {ac.coveragePercent}%
                              </span>
                            </td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">{ac.technology || "N/A"}</td>
                            <td className="p-3 text-slate-500 text-[11px]">{ac.gaps || "None identified"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* INCIDENT SUMMARY */}
            {(incidentSummary.totalIncidents || incidentSummary.bySeverity) && (() => {
              const n = tocItems.find(t => t.id === "incident-summary")?.num || 0;
              const sevData = incidentSummary.severityChartData || [];
              return (
                <div>
                  <SectionHeading id="incident-summary" title="Incident Summary" num={n} accent={typeInfo.accent} subtitle="Security event analysis and classification" />
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="incident-summary-metrics">
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">MTTD</p>
                      <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white" data-testid="text-mttd">{incidentSummary.mttdHours || 0}h</p>
                      <p className="text-[10px] text-slate-500">Mean Time to Detect</p>
                    </div>
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">MTTR</p>
                      <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white" data-testid="text-mttr">{incidentSummary.mttrHours || 0}h</p>
                      <p className="text-[10px] text-slate-500">Mean Time to Respond</p>
                    </div>
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">SLA Adherence</p>
                      <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white" data-testid="text-sla-adherence">{incidentSummary.slaAdherencePercent || 0}%</p>
                    </div>
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Auto-Remediated</p>
                      <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white" data-testid="text-auto-remediated">{incidentSummary.autoRemediatedPercent || 0}%</p>
                    </div>
                  </div>
                  {incidentSummary.monthOverMonthTrend && (
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs text-slate-500">Month-over-month trend:</span>
                      <Badge variant="outline" className={`text-[10px] ${incidentSummary.monthOverMonthTrend === "decreasing" ? "text-emerald-600 border-emerald-300" : incidentSummary.monthOverMonthTrend === "increasing" ? "text-red-600 border-red-300" : "text-slate-600 border-slate-300"}`}>
                        {incidentSummary.monthOverMonthTrend === "decreasing" && <ArrowDown className="w-3 h-3 mr-1" />}
                        {incidentSummary.monthOverMonthTrend === "increasing" && <ArrowUp className="w-3 h-3 mr-1" />}
                        {incidentSummary.monthOverMonthTrend === "stable" && <Minus className="w-3 h-3 mr-1" />}
                        {incidentSummary.monthOverMonthTrend} {incidentSummary.trendPercent ? `(${incidentSummary.trendPercent}%)` : ""}
                      </Badge>
                    </div>
                  )}
                  {sevData.length > 0 && (
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={sevData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                            {sevData.map((entry: any, ci: number) => {
                              const sevColor = entry.name === "Critical" ? "#dc2626" : entry.name === "High" ? "#ea580c" : entry.name === "Medium" ? "#d97706" : "#16a34a";
                              return <Cell key={ci} fill={sevColor} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* DETECTION METRICS (Cyber Ops) */}
            {(detectionMetrics.totalAlerts != null || detectionMetrics.detectionRate != null) && (() => {
              const n = tocItems.find(t => t.id === "detection-metrics")?.num || 0;
              const sevDist = detectionMetrics.severityDistribution || [];
              return (
                <div>
                  <SectionHeading id="detection-metrics" title="Detection & Response Metrics" num={n} accent={typeInfo.accent} subtitle="Alert volumes, detection rates, and response performance" />
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="detection-metrics-grid">
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Total Alerts</p>
                      <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{detectionMetrics.totalAlerts || 0}</p>
                    </div>
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Detection Rate</p>
                      <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{detectionMetrics.detectionRate || 0}%</p>
                    </div>
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">MTTD</p>
                      <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{detectionMetrics.mttdMinutes || 0}m</p>
                    </div>
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">SLA Compliance</p>
                      <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{detectionMetrics.slaCompliancePercent || 0}%</p>
                    </div>
                  </div>
                  {sevDist.length > 0 && (
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/20 border">
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={sevDist}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                            {sevDist.map((entry: any, ci: number) => {
                              const c = entry.name === "Critical" ? "#dc2626" : entry.name === "High" ? "#ea580c" : entry.name === "Medium" ? "#d97706" : "#16a34a";
                              return <Cell key={ci} fill={c} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* THREAT ANALYSIS (Cyber Ops) */}
            {(threatAnalysis.topAttackVectors || threatAnalysis.topMitreTactics) && (() => {
              const n = tocItems.find(t => t.id === "threat-analysis")?.num || 0;
              return (
                <div>
                  <SectionHeading id="threat-analysis" title="Threat Analysis" num={n} accent={typeInfo.accent} subtitle="Attack vectors, MITRE ATT&CK mapping, and geo distribution" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="threat-analysis-grid">
                    {threatAnalysis.topAttackVectors?.length > 0 && (
                      <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Top Attack Vectors</p>
                        <div className="space-y-2">
                          {threatAnalysis.topAttackVectors.map((v: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-slate-700 dark:text-slate-300">{v.vector}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-bold">{v.count}</span>
                                <Badge variant="outline" className="text-[9px]">{v.trend}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {threatAnalysis.topMitreTactics?.length > 0 && (
                      <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">MITRE ATT&CK Tactics</p>
                        <div className="space-y-2">
                          {threatAnalysis.topMitreTactics.map((t: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-slate-700 dark:text-slate-300">{t.tactic}</span>
                              <span className="font-bold">{t.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ASSET CENSUS (CAASM) */}
            {(assetCensus.totalDevices != null || assetCensus.byType) && (() => {
              const n = tocItems.find(t => t.id === "asset-census")?.num || 0;
              const osData = assetCensus.osDistribution || [];
              return (
                <div>
                  <SectionHeading id="asset-census" title="Asset Census & Classification" num={n} accent={typeInfo.accent} subtitle="Device inventory, type distribution, and risk analysis" />
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="asset-census-grid">
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Total Devices</p>
                      <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{assetCensus.totalDevices || 0}</p>
                    </div>
                    {assetCensus.byStatus && (
                      <>
                        <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">
                          <p className="text-[10px] font-bold uppercase text-emerald-600 mb-2">Online</p>
                          <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">{assetCensus.byStatus.online || 0}</p>
                        </div>
                        <div className="p-5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                          <p className="text-[10px] font-bold uppercase text-red-600 mb-2">Offline</p>
                          <p className="text-2xl font-extrabold text-red-700 dark:text-red-400">{assetCensus.byStatus.offline || 0}</p>
                        </div>
                        <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border text-center">
                          <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Unknown</p>
                          <p className="text-2xl font-extrabold text-slate-600 dark:text-slate-400">{assetCensus.byStatus.unknown || 0}</p>
                        </div>
                      </>
                    )}
                  </div>
                  {osData.length > 0 && (
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/20 border">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">OS Distribution</p>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={osData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {osData.map((_: any, ci: number) => <Cell key={ci} fill={CHART_PALETTE[ci % CHART_PALETTE.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* IDENTITY ANALYSIS (CAASM) */}
            {identityAnalysis.totalUsers != null && (() => {
              const n = tocItems.find(t => t.id === "identity-analysis")?.num || 0;
              return (
                <div>
                  <SectionHeading id="identity-analysis" title="Identity & Access Analysis" num={n} accent={typeInfo.accent} subtitle="User accounts, privilege analysis, and identity posture" />
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border text-center">
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Total Users</p>
                      <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{identityAnalysis.totalUsers}</p>
                    </div>
                    <div className="p-5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-center">
                      <p className="text-[10px] font-bold uppercase text-amber-600 mb-2">Admin Accounts</p>
                      <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-400">{identityAnalysis.adminAccounts || 0}</p>
                      <p className="text-[10px] text-amber-500">{identityAnalysis.adminRatio}</p>
                    </div>
                    <div className="p-5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                      <p className="text-[10px] font-bold uppercase text-red-600 mb-2">Stale Accounts</p>
                      <p className="text-2xl font-extrabold text-red-700 dark:text-red-400">{identityAnalysis.staleAccounts || 0}</p>
                      <p className="text-[10px] text-red-500">{'>'}{identityAnalysis.stalePeriodDays || 90} days</p>
                    </div>
                  </div>
                  {identityAnalysis.highRiskUsers?.length > 0 && (
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">High Risk Users</p>
                      <div className="space-y-2">
                        {identityAnalysis.highRiskUsers.map((u: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-slate-700 dark:text-slate-300">{u.user}</span>
                            <div className="flex items-center gap-2">
                              <Badge className={`text-[9px] ${u.risk === "critical" ? "bg-red-500/15 text-red-600" : "bg-orange-500/15 text-orange-600"}`}>{u.risk}</Badge>
                              <span className="text-[10px] text-slate-500">{u.reason}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* CONTROL EFFECTIVENESS (Governance) */}
            {controlEffectiveness.length > 0 && (() => {
              const n = tocItems.find(t => t.id === "control-effectiveness")?.num || 0;
              return (
                <div>
                  <SectionHeading id="control-effectiveness" title="Control Effectiveness" num={n} accent={typeInfo.accent} subtitle="Security control implementation and effectiveness assessment" />
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800/50">
                          <th className="text-left px-4 py-3 font-bold uppercase tracking-wider text-slate-500">Control Area</th>
                          <th className="text-center px-4 py-3 font-bold uppercase tracking-wider text-slate-500">Implemented</th>
                          <th className="text-center px-4 py-3 font-bold uppercase tracking-wider text-slate-500">Total</th>
                          <th className="text-center px-4 py-3 font-bold uppercase tracking-wider text-slate-500">Effectiveness</th>
                          <th className="text-center px-4 py-3 font-bold uppercase tracking-wider text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {controlEffectiveness.map((c: any, i: number) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">{c.controlArea}</td>
                            <td className="text-center px-4 py-3">{c.implemented || 0}</td>
                            <td className="text-center px-4 py-3">{c.total || 0}</td>
                            <td className="text-center px-4 py-3 font-bold">{c.effectivenessPercent || 0}%</td>
                            <td className="text-center px-4 py-3">
                              <Badge className={`text-[9px] ${c.status === "Effective" ? "bg-emerald-500/15 text-emerald-600" : c.status === "Partial" ? "bg-amber-500/15 text-amber-600" : "bg-red-500/15 text-red-600"}`}>{c.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* GAP ANALYSIS (Governance) */}
            {gapAnalysis.length > 0 && (() => {
              const n = tocItems.find(t => t.id === "gap-analysis")?.num || 0;
              return (
                <div>
                  <SectionHeading id="gap-analysis" title="Gap Analysis" num={n} accent={typeInfo.accent} subtitle="Identified gaps with remediation priorities" />
                  <div className="space-y-3">
                    {gapAnalysis.map((g: any, i: number) => (
                      <div key={i} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border">
                        <div className="flex items-start justify-between mb-2">
                          <p className="font-semibold text-sm text-slate-900 dark:text-white">{g.area}</p>
                          <Badge className={`text-[9px] ${g.priority === "critical" ? "bg-red-500/15 text-red-600" : g.priority === "high" ? "bg-orange-500/15 text-orange-600" : "bg-yellow-500/15 text-yellow-600"}`}>{g.priority}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-[11px]">
                          <div><span className="text-slate-500">Current:</span> <span className="text-slate-700 dark:text-slate-300">{g.currentState}</span></div>
                          <div><span className="text-slate-500">Target:</span> <span className="text-slate-700 dark:text-slate-300">{g.targetState}</span></div>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">Timeline: {g.timeline} | Effort: {g.remediationEffort}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* INVESTMENT ANALYSIS (Executive) */}
            {(investmentAnalysis.roiPercent || investmentAnalysis.costAvoidance) && (() => {
              const n = tocItems.find(t => t.id === "investment-analysis")?.num || 0;
              return (
                <div>
                  <SectionHeading id="investment-analysis" title="Investment Analysis" num={n} accent={typeInfo.accent} subtitle="Security investment efficiency and ROI metrics" />
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {investmentAnalysis.costAvoidance && (
                      <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">
                        <p className="text-[10px] font-bold uppercase text-emerald-600 mb-2">Cost Avoidance</p>
                        <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">{investmentAnalysis.costAvoidance}</p>
                      </div>
                    )}
                    {investmentAnalysis.roiPercent != null && (
                      <div className="p-5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-center">
                        <p className="text-[10px] font-bold uppercase text-blue-600 mb-2">ROI</p>
                        <p className="text-2xl font-extrabold text-blue-700 dark:text-blue-400">{investmentAnalysis.roiPercent}%</p>
                      </div>
                    )}
                    {investmentAnalysis.incidentCostReduction && (
                      <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border text-center">
                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Incident Cost Reduction</p>
                        <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{investmentAnalysis.incidentCostReduction}</p>
                      </div>
                    )}
                  </div>
                  {investmentAnalysis.kpiTrends?.length > 0 && (
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">KPI Trends</p>
                      <div className="space-y-2">
                        {investmentAnalysis.kpiTrends.map((k: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-slate-700 dark:text-slate-300">{k.kpi}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-500 text-[10px]">{k.previous}</span>
                              <span className="font-bold">{k.current}</span>
                              <Badge variant="outline" className={`text-[9px] ${k.trend === "up" ? "text-red-500" : k.trend === "down" ? "text-emerald-500" : ""}`}>{k.trend}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* PLATFORM BREAKDOWN (Assessment) */}
            {(platformBreakdown.distributions || platformBreakdown.chartData) && (() => {
              const n = tocItems.find(t => t.id === "platform-breakdown")?.num || 0;
              const pData = platformBreakdown.chartData || platformBreakdown.distributions?.map((d: any) => ({ name: d.platform, value: d.count })) || [];
              return (
                <div>
                  <SectionHeading id="platform-breakdown" title="Platform Distribution" num={n} accent={typeInfo.accent} subtitle="Infrastructure platform analysis and categorization" />
                  {pData.length > 0 && (
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/20 border">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={pData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                            {pData.map((_: any, ci: number) => <Cell key={ci} fill={CHART_PALETTE[ci % CHART_PALETTE.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* WORKLOAD CLASSIFICATION (Assessment) */}
            {workloadClassification.sixR && (() => {
              const n = tocItems.find(t => t.id === "workload-classification")?.num || 0;
              const sixR = workloadClassification.sixR;
              const wlData = workloadClassification.chartData || Object.entries(sixR).filter(([, v]) => (v as number) > 0).map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: v }));
              return (
                <div>
                  <SectionHeading id="workload-classification" title="Workload Classification (6R)" num={n} accent={typeInfo.accent} subtitle="Migration suitability and workload categorization" />
                  <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                    {Object.entries(sixR).map(([key, val]) => (
                      <div key={key} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border text-center">
                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">{key}</p>
                        <p className="text-xl font-extrabold text-slate-900 dark:text-white">{val as number}</p>
                      </div>
                    ))}
                  </div>
                  {wlData.length > 0 && (
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/20 border">
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={wlData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {wlData.map((_: any, ci: number) => <Cell key={ci} fill={CHART_PALETTE[ci % CHART_PALETTE.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* KEY HIGHLIGHTS / KPIs */}
            {keyHighlights.length > 0 && (() => {
              const n = tocItems.find(t => t.id === "highlights")?.num || 0;
              return (
                <div>
                  <SectionHeading id="highlights" title="Key Performance Indicators" num={n} accent={typeInfo.accent} subtitle="Performance metrics and trend analysis" />
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {keyHighlights.map((h: any, i: number) => (
                      <div key={i} className="relative overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow p-5">
                        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: h.trend === "up" ? "#dc2626" : h.trend === "down" ? "#10b981" : typeInfo.accent }} />
                        <p className="text-[18px] font-extrabold text-slate-300 dark:text-slate-700 absolute top-2 right-3">{String(i + 1).padStart(2, "0")}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">{h.label}</p>
                        <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{h.value}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          {h.trend === "up" && <ArrowUp className="w-3.5 h-3.5 text-red-500" />}
                          {h.trend === "down" && <ArrowDown className="w-3.5 h-3.5 text-emerald-500" />}
                          {h.trend === "stable" && <Minus className="w-3.5 h-3.5 text-slate-400" />}
                          <span className="text-[10px] text-slate-500">{h.trendDetail}</span>
                        </div>
                        {h.context && <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{h.context}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* SECURITY SCORECARD */}
            {securityScorecard.categories && (() => {
              const n = tocItems.find(t => t.id === "scorecard")?.num || 0;
              const cats = securityScorecard.categories || [];
              return (
                <div>
                  <SectionHeading id="scorecard" title="Security Scorecard" num={n} accent={typeInfo.accent} subtitle="Domain scores and benchmark grading" />
                  <div className="grid grid-cols-4 gap-6 mb-8">
                    <div className="col-span-1 flex flex-col items-center justify-center p-6 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
                      <GaugeChart score={securityScorecard.overallScore || 0} label="Overall Score" size={130} />
                      {securityScorecard.previousScore != null && (
                        <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-500">
                          {(securityScorecard.overallScore || 0) > securityScorecard.previousScore ?
                            <ArrowUp className="w-3 h-3 text-emerald-500" /> :
                            <ArrowDown className="w-3 h-3 text-red-500" />}
                          Previous: {securityScorecard.previousScore}
                        </div>
                      )}
                    </div>
                    <div className="col-span-3 space-y-3">
                      {cats.map((cat: any, i: number) => {
                        const pct = (cat.score / cat.maxScore) * 100;
                        const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
                        return (
                          <div key={i} className="flex items-center gap-4">
                            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 w-36 shrink-0 truncate">{cat.name}</span>
                            <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                              <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-300">{cat.score}/{cat.maxScore}</span>
                            </div>
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold border ${GRADE_COLORS[cat.grade] || GRADE_COLORS.C}`}>
                              {cat.grade}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* MATURITY ASSESSMENT with Radar Chart */}
            {maturityAssessment.domains && (() => {
              const n = tocItems.find(t => t.id === "maturity")?.num || 0;
              const domains = maturityAssessment.domains || [];
              const radarData = domains.map((d: any) => ({
                domain: d.domain,
                current: d.score,
                target: d.target,
              }));
              return (
                <div>
                  <SectionHeading id="maturity" title="Security Maturity Assessment" num={n} accent={typeInfo.accent} subtitle="Capability maturity model evaluation" />
                  <div className="flex items-center gap-2 mb-6">
                    <span className="text-xs text-slate-500">Overall Maturity Level:</span>
                    <Badge className="text-[10px] bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
                      {maturityAssessment.overallMaturity || "N/A"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="flex items-center justify-center">
                      <ResponsiveContainer width="100%" height={300}>
                        <RadarChart data={radarData}>
                          <PolarGrid stroke="hsl(var(--border))" />
                          <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                          <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 9 }} />
                          <Radar name="Current" dataKey="current" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} strokeWidth={2} />
                          <Radar name="Target" dataKey="target" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} strokeDasharray="5 5" />
                          <Legend wrapperStyle={{ fontSize: "11px" }} />
                          <Tooltip contentStyle={tooltipStyle} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3">
                      {domains.map((d: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{d.domain}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">Current: <span className="font-bold text-blue-600">{d.score}</span>/5</span>
                              <span className="text-[10px] text-slate-500">Target: <span className="font-bold text-emerald-600">{d.target}</span>/5</span>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 leading-relaxed">{safeRender(d.detail)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {maturityAssessment.nistMapping && (
                    <div className="mt-6 p-5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">NIST CSF Alignment</span>
                      </div>
                      <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed whitespace-pre-wrap">{maturityAssessment.nistMapping}</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* METRICS DASHBOARD */}
            {topMetrics.length > 0 && (() => {
              const n = tocItems.find(t => t.id === "metrics")?.num || 0;
              return (
                <div>
                  <SectionHeading id="metrics" title="Metrics Dashboard" num={n} accent={typeInfo.accent} subtitle="Operational performance data" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {topMetrics.map(({ key, value }) => (
                      <div key={key} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                        <p className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">{String(value)}</p>
                        <p className="text-[10px] text-slate-400 capitalize mt-1">{key.replace(/_/g, " ")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* FINDINGS */}
            {findings.length > 0 && (() => {
              const n = tocItems.find(t => t.id === "findings")?.num || 0;
              const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
              const sorted = [...findings].sort((a, b) => (sevOrder[a.severity as keyof typeof sevOrder] ?? 4) - (sevOrder[b.severity as keyof typeof sevOrder] ?? 4));
              return (
                <div>
                  <SectionHeading id="findings" title="Detailed Findings" num={n} accent={typeInfo.accent} subtitle="Technical assessment and vulnerability analysis" />
                  <div className="flex items-center gap-4 mb-6 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
                    {Object.entries(SEV_COLORS).map(([sev, color]) => {
                      const count = findings.filter((f: any) => f.severity === sev).length;
                      return (
                        <div key={sev} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                          <span className="text-[11px] font-semibold capitalize text-slate-600 dark:text-slate-400">{sev}: {count}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-4">
                    {sorted.map((finding: any, i: number) => {
                      const sevColor = SEV_COLORS[finding.severity] || SEV_COLORS.medium;
                      return (
                        <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" data-testid={`finding-card-${i}`}>
                          <div className="h-1" style={{ backgroundColor: sevColor }} />
                          <div className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <span className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">{finding.id || `F-${String(i + 1).padStart(3, "0")}`}</span>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{finding.title}</h4>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {finding.cvssScore != null && (
                                  <Badge variant="outline" className="text-[10px] font-mono font-bold" style={{ borderColor: sevColor, color: sevColor }}>
                                    CVSS {finding.cvssScore}
                                  </Badge>
                                )}
                                <Badge className="text-[10px] uppercase font-bold text-white" style={{ backgroundColor: sevColor }}>
                                  {finding.severity}
                                </Badge>
                              </div>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{safeRender(finding.description)}</p>

                            <div className="grid grid-cols-2 gap-3">
                              {finding.impact && (
                                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/15 border border-orange-200 dark:border-orange-800/30">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-orange-600 mb-1">Business Impact</p>
                                  <p className="text-[11px] text-orange-800 dark:text-orange-300 leading-relaxed break-words">{safeRender(finding.impact)}</p>
                                </div>
                              )}
                              {finding.affectedSystems && (
                                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Affected Systems</p>
                                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed break-words">{safeRender(finding.affectedSystems)}</p>
                                </div>
                              )}
                            </div>

                            {finding.evidence && (
                              <div className="p-3 rounded-lg bg-slate-900 dark:bg-slate-950 border border-slate-700">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Evidence</p>
                                <p className="text-[11px] text-slate-300 leading-relaxed font-mono break-words">{safeRender(finding.evidence)}</p>
                              </div>
                            )}

                            <div className="flex items-center gap-3 flex-wrap">
                              {finding.mitreTechnique && (
                                <Badge variant="outline" className="text-[9px] bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                                  MITRE: {finding.mitreTechnique}
                                </Badge>
                              )}
                              {finding.nistFunction && (
                                <Badge variant="outline" className="text-[9px] bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                  NIST: {finding.nistFunction}
                                </Badge>
                              )}
                              {finding.riskQuantification && (
                                <Badge variant="outline" className="text-[9px] bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
                                  {finding.riskQuantification}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ATTACK CHAIN ANALYSIS */}
            {attackChainAnalysis.length > 0 && (() => {
              const n = tocItems.find(t => t.id === "attack-chains")?.num || 0;
              return (
                <div>
                  <SectionHeading id="attack-chains" title="Attack Chain Analysis" num={n} accent={typeInfo.accent} subtitle="MITRE ATT&CK and Kill Chain mapping" />
                  <div className="space-y-8">
                    {attackChainAnalysis.map((chain: any, ci: number) => (
                      <div key={ci} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Zap className="w-4 h-4 text-red-500" />
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{chain.chainName}</h4>
                          </div>
                          <Badge className="text-[10px] uppercase font-bold text-white" style={{ backgroundColor: SEV_COLORS[chain.severity] || SEV_COLORS.high }}>
                            {chain.severity}
                          </Badge>
                        </div>
                        <div className="p-5">
                          <div className="relative">
                            {(chain.stages || []).map((stage: any, si: number) => (
                              <div key={si} className="flex items-start gap-4 mb-4 last:mb-0">
                                <div className="flex flex-col items-center shrink-0">
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: killChainColors[stage.phase] || "#6366f1" }}>
                                    {si + 1}
                                  </div>
                                  {si < (chain.stages?.length || 0) - 1 && (
                                    <div className="w-0.5 h-8 bg-slate-200 dark:bg-slate-700 mt-1" />
                                  )}
                                </div>
                                <div className="flex-1 pb-2">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{stage.phase}</span>
                                    {mitigationBadge(stage.mitigationStatus)}
                                  </div>
                                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{safeRender(stage.description)}</p>
                                  {stage.indicators && (
                                    <p className="text-[10px] text-slate-400 mt-1 font-mono">{safeRender(stage.indicators)}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {chain.impactAssessment && (
                            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/15 border border-red-200 dark:border-red-800/30">
                              <p className="text-[10px] font-bold uppercase text-red-600 mb-1">Impact Assessment</p>
                              <p className="text-[11px] text-red-800 dark:text-red-300 leading-relaxed">{chain.impactAssessment}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* RISK MATRIX */}
            {riskMatrix.length > 0 && (() => {
              const n = tocItems.find(t => t.id === "risk-matrix")?.num || 0;
              return (
                <div>
                  <SectionHeading id="risk-matrix" title="Risk Assessment Matrix" num={n} accent={typeInfo.accent} subtitle="Likelihood and impact evaluation" />
                  <div className="overflow-x-auto mb-8">
                    <table className="w-full text-xs border-collapse border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-slate-900 dark:bg-slate-800 text-white">
                          <th className="p-3 text-left font-bold text-[10px] uppercase tracking-wider">Risk</th>
                          <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider w-16">L</th>
                          <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider w-16">I</th>
                          <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider w-16">Score</th>
                          <th className="p-3 text-left font-bold text-[10px] uppercase tracking-wider">Current Mitigation</th>
                          <th className="p-3 text-left font-bold text-[10px] uppercase tracking-wider">Owner</th>
                          <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider">Residual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riskMatrix.map((r: any, i: number) => (
                          <tr key={i} className={`border-b border-slate-200 dark:border-slate-700 ${i % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-slate-50 dark:bg-slate-800/20"}`} data-testid={`risk-row-${i}`}>
                            <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{r.risk}</td>
                            <td className="p-3 text-center"><span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold ${riskColor(r.likelihood, 1)}`}>{r.likelihood}</span></td>
                            <td className="p-3 text-center"><span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold ${riskColor(1, r.impact)}`}>{r.impact}</span></td>
                            <td className="p-3 text-center"><span className={`inline-flex items-center justify-center w-8 h-7 rounded-md text-[11px] font-bold ${riskColor(r.likelihood, r.impact)}`}>{r.likelihood * r.impact}</span></td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">{r.currentMitigation}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">{r.riskOwner || "N/A"}</td>
                            <td className="p-3 text-center">
                              <Badge className={`text-[9px] uppercase ${
                                r.residualRisk === "critical" ? "bg-red-500/15 text-red-700 border-red-300" :
                                r.residualRisk === "high" ? "bg-orange-500/15 text-orange-700 border-orange-300" :
                                r.residualRisk === "medium" ? "bg-amber-500/15 text-amber-700 border-amber-300" :
                                "bg-emerald-500/15 text-emerald-700 border-emerald-300"
                              }`}>{r.residualRisk}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-4">Risk Heat Map (Likelihood × Impact)</p>
                    <div className="overflow-x-auto">
                      <table className="border-collapse text-[10px]">
                        <thead>
                          <tr>
                            <th className="p-1.5 w-24"></th>
                            {[1, 2, 3, 4, 5].map((imp) => (
                              <th key={imp} className="p-1.5 text-center text-slate-500 w-20 font-bold">Impact {imp}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[5, 4, 3, 2, 1].map((lik) => (
                            <tr key={lik}>
                              <td className="p-1.5 text-slate-500 font-bold">Likelihood {lik}</td>
                              {[1, 2, 3, 4, 5].map((imp) => {
                                const risksHere = riskMatrix.filter((r: any) => r.likelihood === lik && r.impact === imp);
                                return (
                                  <td key={imp} className={`p-2 rounded-md ${riskColor(lik, imp)} border border-white/50 dark:border-slate-700/50`}>
                                    {risksHere.length > 0 && (
                                      <div className="space-y-0.5">{risksHere.map((r: any, ri: number) => <div key={ri} className="truncate font-bold text-[9px]">{r.risk}</div>)}</div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* DETAILED SECTIONS */}
            {sections.map((section: any, i: number) => {
              const n = tocItems.find(t => t.id === `section-${i}`)?.num || 0;
              return (
                <div key={i}>
                  <SectionHeading id={`section-${i}`} title={section.title} num={n} accent={typeInfo.accent} />
                  {section.keyInsight && (
                    <div className="p-4 mb-5 rounded-lg border-l-4 bg-blue-50 dark:bg-blue-950/15" style={{ borderColor: typeInfo.accent }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">Key Insight</p>
                      <p className="text-xs text-blue-800 dark:text-blue-300 font-semibold leading-relaxed">{safeRender(section.keyInsight)}</p>
                    </div>
                  )}
                  <div className="text-[13px] text-slate-600 dark:text-slate-400 leading-[1.8] whitespace-pre-wrap break-words mb-6">{safeRender(section.content)}</div>
                  {section.chartData && section.chartData.length > 0 && (
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700">
                      <ResponsiveContainer width="100%" height={280}>
                        {section.chartType === "pie" ? (
                          <PieChart>
                            <Pie data={section.chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }}>
                              {section.chartData.map((_: any, ci: number) => <Cell key={ci} fill={CHART_PALETTE[ci % CHART_PALETTE.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                          </PieChart>
                        ) : (
                          <BarChart data={section.chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={32}>
                              {section.chartData.map((_: any, ci: number) => <Cell key={ci} fill={CHART_PALETTE[ci % CHART_PALETTE.length]} />)}
                            </Bar>
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  )}
                  {(!section.chartData || section.chartData.length === 0) && section.content && (
                    <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400" data-testid={`section-no-chart-${i}`}>
                      No chart data available for this section
                    </div>
                  )}
                </div>
              );
            })}

            {/* RECOMMENDATIONS & ROADMAP */}
            {recommendations.length > 0 && (() => {
              const n = tocItems.find(t => t.id === "recommendations")?.num || 0;
              const timelineGroups = { immediate: [] as any[], "short-term": [] as any[], "medium-term": [] as any[], "long-term": [] as any[] };
              recommendations.forEach((r: any) => {
                const tl = r.timeline || "short-term";
                if (timelineGroups[tl as keyof typeof timelineGroups]) {
                  timelineGroups[tl as keyof typeof timelineGroups].push(r);
                }
              });
              return (
                <div>
                  <SectionHeading id="recommendations" title="Recommendations & Roadmap" num={n} accent={typeInfo.accent} subtitle="Prioritized action items and implementation timeline" />

                  <div className="mb-8">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-4">Implementation Roadmap</p>
                    <div className="grid grid-cols-4 gap-3">
                      {Object.entries(timelineGroups).map(([phase, items]) => {
                        const colors = {
                          immediate: { bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-200 dark:border-red-800", label: "text-red-600", dot: "bg-red-500" },
                          "short-term": { bg: "bg-orange-50 dark:bg-orange-950/20", border: "border-orange-200 dark:border-orange-800", label: "text-orange-600", dot: "bg-orange-500" },
                          "medium-term": { bg: "bg-blue-50 dark:bg-blue-950/20", border: "border-blue-200 dark:border-blue-800", label: "text-blue-600", dot: "bg-blue-500" },
                          "long-term": { bg: "bg-emerald-50 dark:bg-emerald-950/20", border: "border-emerald-200 dark:border-emerald-800", label: "text-emerald-600", dot: "bg-emerald-500" },
                        };
                        const c = colors[phase as keyof typeof colors] || colors["short-term"];
                        return (
                          <div key={phase} className={`p-3 rounded-lg border ${c.bg} ${c.border}`}>
                            <div className="flex items-center gap-1.5 mb-2">
                              <div className={`w-2 h-2 rounded-full ${c.dot}`} />
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${c.label}`}>
                                {phase.replace("-", " ")}
                              </span>
                            </div>
                            <p className="text-lg font-extrabold text-slate-900 dark:text-white">{items.length}</p>
                            <p className="text-[9px] text-slate-500">recommendations</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {recommendations.map((rec: any, i: number) => (
                      <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" data-testid={`recommendation-card-${i}`}>
                        <div className="p-5 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <span className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">{rec.id || `R-${String(i + 1).padStart(3, "0")}`}</span>
                              <div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{rec.title}</h4>
                                {rec.relatedFinding && (
                                  <span className="text-[9px] text-slate-400 font-mono">Related: {rec.relatedFinding}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className="text-[10px] uppercase font-bold text-white" style={{ backgroundColor: SEV_COLORS[rec.priority] || SEV_COLORS.medium }}>
                                {rec.priority}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{safeRender(rec.description)}</p>

                          <div className="flex items-center gap-4 flex-wrap">
                            {rec.timeline && <Badge variant="outline" className="text-[9px]"><Clock className="w-2.5 h-2.5 mr-1" />{rec.timeline}</Badge>}
                            {rec.category && <Badge variant="outline" className="text-[9px]">{rec.category}</Badge>}
                            {rec.effort && <Badge variant="outline" className="text-[9px]">Effort: {rec.effort}</Badge>}
                            {rec.estimatedCost && <Badge variant="outline" className="text-[9px]">Cost: {rec.estimatedCost}</Badge>}
                          </div>

                          {rec.expectedBenefit && (
                            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/15 border border-emerald-200 dark:border-emerald-800/30">
                              <p className="text-[9px] font-bold uppercase text-emerald-600 mb-1">Expected Benefit</p>
                              <p className="text-[11px] text-emerald-800 dark:text-emerald-300">{rec.expectedBenefit}</p>
                            </div>
                          )}

                          {rec.implementationSteps && rec.implementationSteps.length > 0 && (
                            <div className="pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-1">
                              {rec.implementationSteps.map((step: string, si: number) => (
                                <div key={si} className="flex items-start gap-2">
                                  <span className="text-[10px] font-bold text-slate-400 mt-0.5">{si + 1}.</span>
                                  <p className="text-[11px] text-slate-600 dark:text-slate-400">{step}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* TREND ANALYSIS */}
            {trendAnalysis && (() => {
              const n = tocItems.find(t => t.id === "trend-analysis")?.num || 0;
              return (
                <div>
                  <SectionHeading id="trend-analysis" title="Trend Analysis" num={n} accent={typeInfo.accent} subtitle="Historical patterns and projections" />
                  <div className="text-[13px] text-slate-600 dark:text-slate-400 leading-[1.8] whitespace-pre-wrap">{safeRender(trendAnalysis)}</div>
                </div>
              );
            })()}

            {/* COMPLIANCE MAPPING */}
            {complianceMapping.length > 0 && (() => {
              const n = tocItems.find(t => t.id === "compliance-mapping")?.num || 0;
              const statusColors: Record<string, string> = {
                "Compliant": "bg-emerald-500/15 text-emerald-700 border-emerald-300",
                "Partial": "bg-amber-500/15 text-amber-700 border-amber-300",
                "Non-Compliant": "bg-red-500/15 text-red-700 border-red-300",
                "Not Assessed": "bg-slate-500/15 text-slate-700 border-slate-300",
              };
              return (
                <div>
                  <SectionHeading id="compliance-mapping" title="Compliance Mapping" num={n} accent={typeInfo.accent} subtitle="Framework control status and gaps" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-slate-900 dark:bg-slate-800 text-white">
                          <th className="p-3 text-left font-bold text-[10px] uppercase tracking-wider">Framework</th>
                          <th className="p-3 text-left font-bold text-[10px] uppercase tracking-wider">Requirement</th>
                          <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider w-28">Status</th>
                          <th className="p-3 text-left font-bold text-[10px] uppercase tracking-wider">Gap / Remediation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {complianceMapping.map((cm: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-slate-50 dark:bg-slate-800/20"}>
                            <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{cm.framework}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">{cm.requirement}</td>
                            <td className="p-3 text-center">
                              <Badge className={`text-[9px] ${statusColors[cm.status] || statusColors["Not Assessed"]}`}>{cm.status}</Badge>
                            </td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">{cm.gap || cm.remediation || "N/A"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* COMPLIANCE NOTES */}
            {complianceNotes && (() => {
              const n = tocItems.find(t => t.id === "compliance")?.num || 0;
              return (
                <div>
                  <SectionHeading id="compliance" title="Compliance & Regulatory Notes" num={n} accent={typeInfo.accent} subtitle="Regulatory observations and requirements" />
                  <div className="p-5 rounded-xl bg-blue-50 dark:bg-blue-950/15 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div className="text-[13px] text-blue-800 dark:text-blue-300 leading-[1.8] whitespace-pre-wrap">{safeRender(complianceNotes)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* MSSP VALUE STATEMENT */}
            {(msspValueStatement.incidentsPrevented || msspValueStatement.threatsBlocked || msspValueStatement.hoursSaved) && (() => {
              const n = tocItems.find(t => t.id === "mssp-value")?.num || 0;
              return (
                <div>
                  <SectionHeading id="mssp-value" title="MSSP Value Statement" num={n} accent={typeInfo.accent} subtitle="Service value and ROI demonstration" />
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="mssp-value-stats">
                    {msspValueStatement.incidentsPrevented != null && (
                      <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-center">
                        <Shield className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                        <p className="text-2xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-300" data-testid="text-incidents-prevented">{msspValueStatement.incidentsPrevented}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mt-1">Incidents Prevented</p>
                      </div>
                    )}
                    {msspValueStatement.threatsBlocked != null && (
                      <div className="p-5 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-center">
                        <Zap className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                        <p className="text-2xl font-extrabold tracking-tight text-blue-700 dark:text-blue-300" data-testid="text-threats-blocked">{msspValueStatement.threatsBlocked}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mt-1">Threats Blocked</p>
                      </div>
                    )}
                    {msspValueStatement.hoursSaved != null && (
                      <div className="p-5 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 text-center">
                        <Clock className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                        <p className="text-2xl font-extrabold tracking-tight text-purple-700 dark:text-purple-300" data-testid="text-hours-saved">{msspValueStatement.hoursSaved}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 mt-1">Hours Saved</p>
                      </div>
                    )}
                    {msspValueStatement.costAvoidance && (
                      <div className="p-5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-center">
                        <Target className="w-6 h-6 text-amber-600 mx-auto mb-2" />
                        <p className="text-lg font-extrabold tracking-tight text-amber-700 dark:text-amber-300" data-testid="text-cost-avoidance">{msspValueStatement.costAvoidance}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mt-1">Cost Avoidance</p>
                      </div>
                    )}
                  </div>
                  {(msspValueStatement.coverageImprovement || msspValueStatement.meanTimeToDetect || msspValueStatement.meanTimeToRespond) && (
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      {msspValueStatement.coverageImprovement && (
                        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Coverage Improvement</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{msspValueStatement.coverageImprovement}</p>
                        </div>
                      )}
                      {msspValueStatement.meanTimeToDetect && (
                        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Avg. Time to Detect</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{msspValueStatement.meanTimeToDetect}</p>
                        </div>
                      )}
                      {msspValueStatement.meanTimeToRespond && (
                        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Avg. Time to Respond</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{msspValueStatement.meanTimeToRespond}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* CONCLUSION */}
            {conclusion && (() => {
              const n = tocItems.find(t => t.id === "conclusion")?.num || 0;
              return (
                <div>
                  <SectionHeading id="conclusion" title="Conclusion & Next Steps" num={n} accent={typeInfo.accent} subtitle="Summary and forward-looking actions" />
                  <div className="p-6 rounded-xl border-2" style={{ borderColor: `${typeInfo.accent}40` }}>
                    <div className="text-[13px] text-slate-600 dark:text-slate-400 leading-[1.8] whitespace-pre-wrap">{safeRender(conclusion)}</div>
                  </div>
                </div>
              );
            })()}

            {/* APPENDICES */}
            {(appendix.glossary || appendix.severityDefinitions) && (() => {
              const n = tocItems.find(t => t.id === "appendix")?.num || 0;
              return (
                <div>
                  <SectionHeading id="appendix" title="Appendices" num={n} accent={typeInfo.accent} subtitle="Reference definitions and terminology" />

                  {appendix.severityDefinitions && (
                    <div className="mb-8">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Appendix A: Severity Definitions</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                          <thead>
                            <tr className="bg-slate-100 dark:bg-slate-800">
                              <th className="p-3 text-left font-bold text-slate-600 dark:text-slate-400 w-24">Level</th>
                              <th className="p-3 text-left font-bold text-slate-600 dark:text-slate-400">Description</th>
                              <th className="p-3 text-left font-bold text-slate-600 dark:text-slate-400 w-28">Response Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {appendix.severityDefinitions.map((sd: any, i: number) => (
                              <tr key={i} className={i % 2 === 0 ? "" : "bg-slate-50 dark:bg-slate-800/20"}>
                                <td className="p-3">
                                  <Badge className="text-[9px] uppercase font-bold text-white" style={{ backgroundColor: SEV_COLORS[sd.level?.toLowerCase()] || SEV_COLORS.medium }}>
                                    {sd.level}
                                  </Badge>
                                </td>
                                <td className="p-3 text-slate-600 dark:text-slate-400">{safeRender(sd.description)}</td>
                                <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{safeRender(sd.responseTime)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {appendix.glossary && appendix.glossary.length > 0 && (
                    <div className="mb-8">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Appendix B: Glossary of Terms</h4>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                        {appendix.glossary.map((g: any, i: number) => (
                          <div key={i} className="py-2 border-b border-dotted border-slate-200 dark:border-slate-700">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{g.term}</span>
                            <span className="text-xs text-slate-500 ml-2">— {g.definition}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {appendix.dataClassification && (
                    <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Data Classification Notice</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{appendix.dataClassification}</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* FOOTER */}
            <div className="mt-12">
              <div className="rounded-lg overflow-hidden" style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)" }}>
                <div className="h-[3px]" style={{ backgroundColor: typeInfo.accent }} />
                <div className="px-8 py-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5" style={{ color: typeInfo.accent }} />
                      <span className="text-sm font-bold text-white tracking-wider uppercase" style={{ letterSpacing: "0.1em" }}>{currentTenant?.name || "Cyber Command Center"}</span>
                    </div>
                    <Badge className="text-[9px] uppercase tracking-wider bg-blue-500/20 text-blue-300 border-blue-400/30 hover:bg-blue-500/20">
                      {documentControl.classification || "Confidential"}
                    </Badge>
                  </div>
                  <div className="border-t border-slate-700 pt-4 text-center space-y-1">
                    <p className="text-[10px] text-slate-400">
                      End of Report — {report.title}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Generated {fmt.formatDate(report.createdAt)} • Document {documentControl.documentId || "N/A"}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold mt-3 tracking-[0.2em]">
                      CONFIDENTIAL — INTERNAL USE ONLY
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { currentTenant, isMSS } = useTenant();
  const fmt = useTenantDateFormatter();
  const { toast } = useToast();
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [selectedReportType, setSelectedReportType] = useState("executive_summary");
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [regenerateReport, setRegenerateReport] = useState<Report | null>(null);
  const [regeneratePrompt, setRegeneratePrompt] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [showSchedules, setShowSchedules] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingReportId, setDeletingReportId] = useState<number | null>(null);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareReportA, setCompareReportA] = useState<string>("");
  const [compareReportB, setCompareReportB] = useState<string>("");
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [lastGenerateFallback, setLastGenerateFallback] = useState(false);

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["/api/reports", currentTenant?.id],
    enabled: !!currentTenant,
  });

  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: ["/api/report-schedules", currentTenant?.id],
    enabled: !!currentTenant && showSchedules,
  });

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/reports/generate", {
        ...data,
        tenantId: currentTenant?.id,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports", currentTenant?.id] });
      setGenerateDialogOpen(false);
      if (data?.fallback_used) {
        setLastGenerateFallback(true);
        toast({ title: "Report generated (AI unavailable)", description: "AI generation failed — report uses template structure. Re-generate when AI services are restored.", variant: "default" });
      } else {
        setLastGenerateFallback(false);
        toast({ title: "Report generated", description: "AI has generated your Big4-quality security report." });
      }
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      const isAIIssue = msg.toLowerCase().includes("ai") || msg.toLowerCase().includes("openai") || msg.toLowerCase().includes("unavailable") || msg.toLowerCase().includes("budget");
      toast({
        title: isAIIssue ? "AI generation unavailable" : "Generation failed",
        description: isAIIssue ? "AI services are temporarily unavailable — using template structure. Try again shortly." : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/reports/generate", {
        ...data,
        tenantId: currentTenant?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      setRegenerateDialogOpen(false);
      setRegenerateReport(null);
      setRegeneratePrompt("");
      toast({ title: "Report regenerated", description: "A new version has been generated with your instructions." });
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      const isAIIssue = msg.toLowerCase().includes("ai") || msg.toLowerCase().includes("openai") || msg.toLowerCase().includes("unavailable") || msg.toLowerCase().includes("budget");
      toast({
        title: isAIIssue ? "AI regeneration unavailable" : "Regeneration failed",
        description: isAIIssue ? "AI services are temporarily unavailable. Report will use template structure." : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleRegenerate = () => {
    if (!regenerateReport) return;
    regenerateMutation.mutate({
      title: regenerateReport.title,
      period: regenerateReport.period,
      reportType: (regenerateReport as any).reportType || "executive_summary",
      ...(regeneratePrompt.trim() ? { customPrompt: regeneratePrompt.trim() } : {}),
    });
  };

  const createScheduleMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/report-schedules", {
        ...data,
        tenantId: currentTenant?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      setScheduleDialogOpen(false);
      toast({ title: "Schedule created", description: "Report will be generated automatically on schedule." });
    },
    onError: () => {
      toast({ title: "Failed to create schedule", variant: "destructive" });
    },
  });

  const toggleScheduleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/report-schedules/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      toast({ title: "Schedule updated" });
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/report-schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      toast({ title: "Schedule deleted" });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports", currentTenant?.id] });
      setDeletingReportId(null);
      toast({ title: "Report deleted", description: "The report has been permanently removed." });
    },
    onError: () => {
      toast({ title: "Failed to delete report", variant: "destructive" });
    },
  });

  const editReportMutation = useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      const res = await apiRequest("PATCH", `/api/reports/${id}`, { title });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports", currentTenant?.id] });
      setEditingReport(null);
      setEditTitle("");
      toast({ title: "Report updated", description: "The report title has been updated." });
    },
    onError: () => {
      toast({ title: "Failed to update report", variant: "destructive" });
    },
  });

  const handleCreateSchedule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const emails = (formData.get("emails") as string || "").split(",").map(e => e.trim()).filter(Boolean);
    createScheduleMutation.mutate({
      name: formData.get("scheduleName"),
      reportType: formData.get("scheduleReportType") || "executive_summary",
      period: formData.get("schedulePeriod") || "last_month",
      frequency: formData.get("frequency"),
      customPrompt: (formData.get("schedulePrompt") as string || "").trim() || null,
      recipientEmails: emails,
    });
  };

  const handleTemplateGenerate = (template: typeof REPORT_TEMPLATES[0]) => {
    const titleSuffix = currentTenant?.name ? ` - ${currentTenant.name}` : "";
    generateMutation.mutate({
      title: `${template.name}${titleSuffix}`,
      period: template.period,
      reportType: template.reportType,
      customPrompt: template.prompt,
    });
  };

  const handleGenerate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const customPrompt = (formData.get("customPrompt") as string || "").trim();
    generateMutation.mutate({
      title: formData.get("title"),
      period: formData.get("period"),
      reportType: selectedReportType,
      ...(customPrompt ? { customPrompt } : {}),
    });
  };

  const handleDownload = async (reportId: number) => {
    try {
      const response = await fetch(`/api/reports/download/${reportId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Download failed");
      const disposition = response.headers.get("content-disposition");
      let filename = `report_${reportId}.json`;
      if (disposition) {
        const match = disposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const handleCompare = async () => {
    if (!compareReportA || !compareReportB || !currentTenant?.id) return;
    setComparisonLoading(true);
    setComparisonError(null);
    setComparisonData(null);
    try {
      const res = await fetch(
        `/api/reports/${currentTenant.id}/compare?report1=${compareReportA}&report2=${compareReportB}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Comparison failed");
      const data = await res.json();
      setComparisonData(data);
    } catch {
      setComparisonError("Failed to compare reports. Please try again.");
    } finally {
      setComparisonLoading(false);
    }
  };

  const renderDelta = (change: number, inverse?: boolean) => {
    const improved = inverse ? change < 0 : change > 0;
    const degraded = inverse ? change > 0 : change < 0;
    if (improved) return <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium"><ArrowUpRight className="w-3.5 h-3.5" />{Math.abs(change).toFixed(1)}</span>;
    if (degraded) return <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 text-xs font-medium"><ArrowDownRight className="w-3.5 h-3.5" />{Math.abs(change).toFixed(1)}</span>;
    return <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs font-medium"><Minus className="w-3.5 h-3.5" />0</span>;
  };

  if (viewingReport) {
    return <FullScreenReportViewer report={viewingReport} onClose={() => setViewingReport(null)} />;
  }

  const selectedTypeInfo = getTypeInfo(selectedReportType);

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      {lastGenerateFallback && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/25 rounded-lg px-4 py-3" data-testid="banner-report-ai-fallback">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">AI generation unavailable — template used</p>
            <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">The last report was generated using a static template structure because AI services were temporarily unavailable. Re-generate when AI services are restored for a full AI-authored narrative.</p>
          </div>
          <button className="text-amber-500 hover:text-amber-400 transition-colors shrink-0" onClick={() => setLastGenerateFallback(false)} data-testid="btn-dismiss-fallback-banner">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Security Reports</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentTenant?.name} — Enterprise-grade AI-powered reporting
          </p>
        </div>
        {isMSS && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setCompareDialogOpen(true); setComparisonData(null); setComparisonError(null); setCompareReportA(""); setCompareReportB(""); }} data-testid="btn-compare-reports">
              <GitCompareArrows className="w-3.5 h-3.5 mr-1.5" />
              Compare
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setShowSchedules(true); setScheduleDialogOpen(true); }} data-testid="button-schedule-report">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              Schedule
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSchedules(!showSchedules)} data-testid="button-toggle-schedules">
              <Timer className="w-3.5 h-3.5 mr-1.5" />
              {showSchedules ? "Hide" : "Show"} Schedules {schedules.length > 0 && `(${schedules.length})`}
            </Button>
            <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-generate-report">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Generate Report
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  AI Report Generator
                </DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="templates" className="mt-2">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="templates" data-testid="tab-templates">Templates</TabsTrigger>
                  <TabsTrigger value="custom" data-testid="tab-custom">Custom Report</TabsTrigger>
                </TabsList>
                <TabsContent value="templates" className="mt-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Select a pre-configured template to generate a professional report with one click.
                  </p>
                  {(() => {
                    const groups = REPORT_TEMPLATES.reduce<Record<string, typeof REPORT_TEMPLATES>>((acc, t) => {
                      const g = t.group || "General";
                      if (!acc[g]) acc[g] = [];
                      acc[g].push(t);
                      return acc;
                    }, {});
                    const groupOrder = ["General", "CAASM Reports", "Cyber Security Operations", "Governance & Risk", "Executive & Strategic", "Assessment & Migration", "Discovery & Posture Assessment", "Modernization Readiness", "Strategic Roadmap & Recommendations"];
                    return groupOrder.filter(g => groups[g]).map((groupName) => (
                      <div key={groupName} className="space-y-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">{groupName}</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {groups[groupName].map((template) => {
                            const TIcon = template.icon;
                            const tInfo = getTypeInfo(template.reportType);
                            return (
                              <button
                                key={template.id}
                                className="text-left p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/30 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleTemplateGenerate(template)}
                                disabled={generateMutation.isPending}
                                data-testid={`template-${template.id}`}
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <div className={`w-7 h-7 rounded-md ${tInfo.bg} flex items-center justify-center shrink-0`}>
                                    <TIcon className={`w-3.5 h-3.5 ${tInfo.color}`} />
                                  </div>
                                  <p className="text-xs font-semibold group-hover:text-primary transition-colors">{template.name}</p>
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{template.description}</p>
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <Badge variant="outline" className="text-[8px] px-1.5 py-0">{tInfo.label}</Badge>
                                  <Badge variant="secondary" className="text-[8px] px-1.5 py-0">{formatPeriod(template.period)}</Badge>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                  {generateMutation.isPending && (
                    <div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-muted/30 border">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Generating report (30-60s)...</span>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="custom" className="mt-4">
                  <form onSubmit={handleGenerate} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="report-title">Report Title</Label>
                      <Input
                        id="report-title"
                        name="title"
                        defaultValue={`Monthly Security Report - ${currentTenant?.name}`}
                        required
                        data-testid="input-report-title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Report Type</Label>
                      <Select value={selectedReportType} onValueChange={setSelectedReportType}>
                        <SelectTrigger data-testid="select-report-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(REPORT_TYPES).map(([key, info]) => {
                            const Icon = info.icon;
                            return (
                              <SelectItem key={key} value={key} data-testid={`select-item-${key}`}>
                                <span className="flex items-center gap-2">
                                  <Icon className={`w-3.5 h-3.5 ${info.color}`} />
                                  {info.label}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Report Period</Label>
                      <Select name="period" defaultValue="last_month">
                        <SelectTrigger data-testid="select-report-period">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="last_week">Last Week</SelectItem>
                          <SelectItem value="last_month">Last Month</SelectItem>
                          <SelectItem value="last_quarter">Last Quarter</SelectItem>
                          <SelectItem value="last_year">Last Year</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-prompt">Custom Instructions (Optional)</Label>
                      <textarea
                        id="custom-prompt"
                        name="customPrompt"
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="E.g., Focus on cloud security posture, emphasize compliance gaps with ISO 27001, include executive-level risk summary..."
                        data-testid="input-custom-prompt"
                      />
                    </div>
                    <div className="p-3 rounded-md bg-muted/30 border">
                      <div className="flex items-start gap-2">
                        <selectedTypeInfo.icon className={`w-4 h-4 mt-0.5 ${selectedTypeInfo.color}`} />
                        <p className="text-xs text-muted-foreground">
                          Generate a Big4 consulting-grade {selectedTypeInfo.label.toLowerCase()} with maturity assessment, NIST/MITRE mapping, attack chain analysis, risk quantification, compliance mapping, and implementation roadmap.
                        </p>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={generateMutation.isPending} data-testid="button-submit-report">
                      {generateMutation.isPending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Generating Report (30-60s)...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                          Generate Report
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Dialog open={compareDialogOpen} onOpenChange={(open) => { setCompareDialogOpen(open); if (!open) { setComparisonData(null); setComparisonError(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <GitCompareArrows className="w-4 h-4 text-primary" />
              </div>
              Compare Reports
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Report A</Label>
                <Select value={compareReportA} onValueChange={setCompareReportA}>
                  <SelectTrigger data-testid="select-report-a">
                    <SelectValue placeholder="Select report..." />
                  </SelectTrigger>
                  <SelectContent>
                    {reports.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)} data-testid={`select-report-a-${r.id}`}>
                        {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Report B</Label>
                <Select value={compareReportB} onValueChange={setCompareReportB}>
                  <SelectTrigger data-testid="select-report-b">
                    <SelectValue placeholder="Select report..." />
                  </SelectTrigger>
                  <SelectContent>
                    {reports.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)} data-testid={`select-report-b-${r.id}`}>
                        {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!compareReportA || !compareReportB || compareReportA === compareReportB || comparisonLoading}
              onClick={handleCompare}
              data-testid="btn-run-compare"
            >
              {comparisonLoading ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Comparing...</>
              ) : (
                <><GitCompareArrows className="w-3.5 h-3.5 mr-1.5" />Compare</>
              )}
            </Button>

            {comparisonError && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm" data-testid="comparison-error">
                {comparisonError}
              </div>
            )}

            {comparisonData && (
              <div className="space-y-4" data-testid="comparison-results">
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs font-semibold">Report A</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-1">
                      <p className="text-sm font-medium truncate">{comparisonData.reportA.title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{getTypeInfo(comparisonData.reportA.type).label}</Badge>
                        <span className="text-[10px] text-muted-foreground">{fmt.formatDate(comparisonData.reportA.createdAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs font-semibold">Report B</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-1">
                      <p className="text-sm font-medium truncate">{comparisonData.reportB.title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{getTypeInfo(comparisonData.reportB.type).label}</Badge>
                        <span className="text-[10px] text-muted-foreground">{fmt.formatDate(comparisonData.reportB.createdAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-xs font-semibold">Key Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1 text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Score</p>
                        {comparisonData.deltas.riskScore ? (
                          <>
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-sm font-semibold">{comparisonData.deltas.riskScore.before}</span>
                              <ChevronRight className="w-3 h-3 text-muted-foreground" />
                              <span className="text-sm font-semibold">{comparisonData.deltas.riskScore.after}</span>
                            </div>
                            <div className="flex justify-center">{renderDelta(comparisonData.deltas.riskScore.change, true)}</div>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">N/A</p>
                        )}
                      </div>
                      <div className="space-y-1 text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Maturity Score</p>
                        {comparisonData.deltas.maturityScore ? (
                          <>
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-sm font-semibold">{comparisonData.deltas.maturityScore.before}</span>
                              <ChevronRight className="w-3 h-3 text-muted-foreground" />
                              <span className="text-sm font-semibold">{comparisonData.deltas.maturityScore.after}</span>
                            </div>
                            <div className="flex justify-center">{renderDelta(comparisonData.deltas.maturityScore.change)}</div>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">N/A</p>
                        )}
                      </div>
                      <div className="space-y-1 text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Findings</p>
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-sm font-semibold">{comparisonData.deltas.findings.before}</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm font-semibold">{comparisonData.deltas.findings.after}</span>
                        </div>
                        <div className="flex justify-center">
                          {comparisonData.deltas.findings.change > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 text-xs font-medium">+{comparisonData.deltas.findings.change}</span>
                          ) : comparisonData.deltas.findings.change < 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">{comparisonData.deltas.findings.change}</span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs font-medium"><Minus className="w-3.5 h-3.5" />0</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-xs font-semibold">Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-3">
                    {comparisonData.summary.improved.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Improved ({comparisonData.summary.improved.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {comparisonData.summary.improved.map((item: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">{item}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {comparisonData.summary.degraded.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <ArrowDownRight className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                          <span className="text-xs font-semibold text-red-600 dark:text-red-400">Degraded ({comparisonData.summary.degraded.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {comparisonData.summary.degraded.map((item: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">{item}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {comparisonData.summary.unchanged.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground">Unchanged ({comparisonData.summary.unchanged.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {comparisonData.summary.unchanged.map((item: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{item}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-40" /></CardContent></Card>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="p-16 text-center">
            <div className="w-14 h-14 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No reports generated</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {isMSS
                ? "Click 'Generate Report' to create your first enterprise-grade security report"
                : "No reports available at this time"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => {
            const typeInfo = getTypeInfo((report as any).reportType || "executive_summary");
            const TypeIcon = typeInfo.icon;
            return (
              <Card key={report.id} className="hover:shadow-md transition-shadow cursor-pointer group" data-testid={`report-card-${report.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-md ${typeInfo.bg} flex items-center justify-center shrink-0`}>
                      <TypeIcon className={`w-5 h-5 ${typeInfo.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{report.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{typeInfo.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <Badge variant={report.status === "published" ? "default" : "secondary"} className="text-[9px]">
                      {report.status}
                    </Badge>
                    <Badge variant="outline" className="text-[9px]">{formatPeriod(report.period)}</Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">{fmt.formatDate(report.createdAt)}</span>
                  </div>
                  {report.executiveSummary && (
                    <p className="text-[10px] text-muted-foreground leading-relaxed mb-4 line-clamp-3">
                      {report.executiveSummary.substring(0, 200)}...
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="default" size="sm" className="flex-1 gap-1" onClick={() => setViewingReport(report)} data-testid={`button-view-report-${report.id}`}>
                      <Eye className="w-3 h-3" /> View Report
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDownload(report.id)} data-testid={`button-download-report-${report.id}`}>
                      <Download className="w-3 h-3" />
                    </Button>
                    {isMSS && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => { setEditingReport(report); setEditTitle(report.title); }} data-testid={`button-edit-report-${report.id}`} title="Edit report">
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setRegenerateReport(report); setRegenerateDialogOpen(true); }} data-testid={`button-regenerate-report-${report.id}`} title="Regenerate with custom prompt">
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeletingReportId(report.id)} data-testid={`button-delete-report-${report.id}`} title="Delete report">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showSchedules && isMSS && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Scheduled Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            {schedules.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No scheduled reports yet. Click "Schedule" to create one.</p>
            ) : (
              <div className="space-y-2">
                {schedules.map((schedule: any) => {
                  const sTypeInfo = getTypeInfo(schedule.reportType);
                  const SIcon = sTypeInfo.icon;
                  return (
                    <div key={schedule.id} className="flex items-center gap-3 p-3 rounded-lg border" data-testid={`schedule-row-${schedule.id}`}>
                      <div className={`w-8 h-8 rounded-md ${sTypeInfo.bg} flex items-center justify-center shrink-0`}>
                        <SIcon className={`w-4 h-4 ${sTypeInfo.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{schedule.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {schedule.frequency} — {sTypeInfo.label} — {formatPeriod(schedule.period)}
                        </p>
                        {schedule.nextRunAt && (
                          <p className="text-[10px] text-muted-foreground">
                            Next run: {fmt.formatDate(schedule.nextRunAt)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={schedule.enabled ? "default" : "secondary"} className="text-[9px]">
                          {schedule.enabled ? "Active" : "Paused"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => toggleScheduleMutation.mutate({ id: schedule.id, enabled: !schedule.enabled })}
                          data-testid={`toggle-schedule-${schedule.id}`}
                        >
                          {schedule.enabled ? "Pause" : "Enable"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                          data-testid={`delete-schedule-${schedule.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={regenerateDialogOpen} onOpenChange={(open) => { setRegenerateDialogOpen(open); if (!open) { setRegenerateReport(null); setRegeneratePrompt(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-primary" />
              </div>
              Regenerate Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {regenerateReport && (
              <div className="p-3 rounded-md bg-muted/30 border">
                <p className="text-xs font-medium">{regenerateReport.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {(regenerateReport as any).reportType ? getTypeInfo((regenerateReport as any).reportType).label : "Report"} — {formatPeriod(regenerateReport.period)}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="regenerate-prompt">Custom Instructions</Label>
              <textarea
                id="regenerate-prompt"
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Provide specific instructions for this regeneration. E.g., Focus more on endpoint threats, add detailed MITRE ATT&CK mapping, emphasize compliance with HIPAA..."
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                data-testid="input-regenerate-prompt"
              />
              <p className="text-[10px] text-muted-foreground">
                Leave blank to regenerate with default AI analysis, or provide instructions to guide the AI output.
              </p>
            </div>
            <Button className="w-full" disabled={regenerateMutation.isPending} onClick={handleRegenerate} data-testid="button-submit-regenerate">
              {regenerateMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Regenerating Report (30-60s)...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Regenerate Report
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              Schedule Report
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSchedule} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Schedule Name</Label>
              <Input id="schedule-name" name="scheduleName" defaultValue={`Monthly Report - ${currentTenant?.name}`} required data-testid="input-schedule-name" />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select name="frequency" defaultValue="monthly">
                <SelectTrigger data-testid="select-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select name="scheduleReportType" defaultValue="executive_summary">
                <SelectTrigger data-testid="select-schedule-report-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_TYPES).map(([key, info]) => {
                    const Icon = info.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className={`w-3.5 h-3.5 ${info.color}`} />
                          {info.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Report Period</Label>
              <Select name="schedulePeriod" defaultValue="last_month">
                <SelectTrigger data-testid="select-schedule-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_week">Last Week</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="last_quarter">Last Quarter</SelectItem>
                  <SelectItem value="last_year">Last Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-emails">Recipient Emails (comma-separated)</Label>
              <Input id="schedule-emails" name="emails" placeholder="ciso@company.com, security@company.com" data-testid="input-schedule-emails" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-prompt">Custom Instructions (Optional)</Label>
              <textarea
                id="schedule-prompt"
                name="schedulePrompt"
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Custom instructions for each generated report..."
                data-testid="input-schedule-prompt"
              />
            </div>
            <Button type="submit" className="w-full" disabled={createScheduleMutation.isPending} data-testid="button-submit-schedule">
              {createScheduleMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Creating Schedule...
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 mr-1.5" />
                  Create Schedule
                </>
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingReportId !== null} onOpenChange={(open) => { if (!open) setDeletingReportId(null); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-delete-report">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" />
              Delete Report
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete this report? This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingReportId(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteReportMutation.isPending}
              onClick={() => { if (deletingReportId) deleteReportMutation.mutate(deletingReportId); }}
              data-testid="button-confirm-delete"
            >
              {deleteReportMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingReport !== null} onOpenChange={(open) => { if (!open) { setEditingReport(null); setEditTitle(""); } }}>
        <DialogContent className="max-w-md" data-testid="dialog-edit-report">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-report-title">Report Title</Label>
              <Input
                id="edit-report-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter report title"
                data-testid="input-edit-report-title"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setEditingReport(null); setEditTitle(""); }} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={editReportMutation.isPending || !editTitle.trim()}
                onClick={() => { if (editingReport) editReportMutation.mutate({ id: editingReport.id, title: editTitle.trim() }); }}
                data-testid="button-save-edit"
              >
                {editReportMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}