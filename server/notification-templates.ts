import { classifyAttackType, classifySecurityDomain } from "./ai-soc-analyst";

export type AttackType = 'generic' | 'malware' | 'phishing' | 'brute_force' | 'ransomware' | 'network_intrusion' | 'web_app_attack' | 'vuln_exploit' | 'social_engineering' | 'incident_closure';

interface NotificationParams {
  domain: 'endpoint' | 'email' | 'network' | 'web_app' | 'cloud' | 'identity';
  attackType?: AttackType;
  incident: {
    id: number | string;
    title: string;
    severity: string;
    status: string;
    sourceIp?: string | null;
    destinationIp?: string | null;
    affectedAssets?: string | null;
    sourceCategory?: string | null;
    actionTaken?: string | null;
    description?: string | null;
    incidentType?: string | null;
    detectionSource?: string | null;
    attackVector?: string | null;
  };
  investigation: {
    executiveSummary?: string | null;
    technicalReport?: string | null;
    riskScore?: number | null;
    confidenceScore?: number | null;
    attackChain?: Array<{ phase: string; description: string; evidence: string }> | null;
    iocsSummary?: Array<{ type: string; value: string; reputation: string; context: string }> | null;
    affectedEntities?: any[] | null;
    findings?: any | null;
    recommendations?: any | null;
    verdict?: string | null;
    verdictReasoning?: string | null;
  };
  tenant: {
    name: string;
    timezone?: string | null;
    brandColor?: string | null;
    logoUrl?: string | null;
  };
  actionToken: string;
  baseUrl: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
};

const ATTACK_TYPE_LABELS: Record<string, string> = {
  generic: 'Security Incident',
  malware: 'Malware Infection',
  phishing: 'Phishing Attack',
  brute_force: 'Brute Force / Credential Attack',
  ransomware: 'Ransomware Incident',
  network_intrusion: 'Network Intrusion',
  web_app_attack: 'Web Application Attack',
  vuln_exploit: 'Vulnerability Exploit',
  social_engineering: 'Social Engineering',
  incident_closure: 'Incident Closure',
};

const DOMAIN_LABELS: Record<string, string> = {
  endpoint: 'Endpoint Threat',
  email: 'Email Threat',
  network: 'Network Threat',
  web_app: 'Web Application Threat',
  cloud: 'Cloud Security',
  identity: 'Identity Threat',
};

function esc(str: string | number | null | undefined): string {
  if (str === null || str === undefined || str === '') return '';
  const s = String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function val(v: string | number | null | undefined, fallback = 'N/A'): string {
  if (v === null || v === undefined || v === '') return fallback;
  return esc(String(v));
}

function formatTimestamp(tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC',
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'short',
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

function extractField(text: string | null | undefined, ...keywords: string[]): string | null {
  if (!text) return null;
  for (const kw of keywords) {
    const regex = new RegExp(`${kw}[:\\s]+([^\\n]+)`, 'i');
    const match = text.match(regex);
    if (match) return match[1].trim();
  }
  return null;
}

function sectionHeader(title: string): string {
  return `<tr><td style="padding:24px 32px 8px 32px;"><h2 style="margin:0;font-size:18px;font-weight:700;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">${esc(title)}</h2></td></tr>`;
}

function infoRow(label: string, value: string): string {
  return `<tr><td style="padding:2px 0;"><span style="color:#64748b;font-weight:600;font-size:13px;">${esc(label)}:</span> <span style="color:#1e293b;font-size:13px;">${value}</span></td></tr>`;
}

function bulletList(items: string[] | null | undefined): string {
  if (!Array.isArray(items) || items.length === 0) return '<li style="font-size:13px;color:#94a3b8;">None specified.</li>';
  return items.filter(Boolean).map(i => `<li style="margin-bottom:4px;font-size:13px;color:#1e293b;">${esc(String(i))}</li>`).join('');
}

function renderGenericAttackSection(p: NotificationParams): string {
  const { incident, investigation } = p;
  const tech = investigation.technicalReport || '';
  const desc = incident.description || '';
  const combined = `${desc}\n${tech}`;

  return `
    ${sectionHeader('Incident Details')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
        ${infoRow('Affected Asset(s)', val(incident.affectedAssets))}
        ${infoRow('Detection Source', val(incident.detectionSource, val(incident.sourceCategory)))}
        ${infoRow('Severity', val(incident.severity))}
        ${infoRow('Current Status', val(incident.status))}
        ${infoRow('Source IP', val(incident.sourceIp))}
        ${infoRow('Destination IP', val(incident.destinationIp))}
      </table>
    </td></tr>
    ${sectionHeader('Immediate Actions Requested')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">Do not use the affected system until cleared. Reset passwords if credential exposure is suspected. Confirm business impact and validate recent changes on affected assets.</p>
    </td></tr>`;
}

function renderMalwareSection(p: NotificationParams): string {
  const { incident, investigation } = p;
  const combined = `${incident.description || ''}\n${investigation.technicalReport || ''}`;

  const hostname = val(incident.affectedAssets);
  const ip = val(incident.sourceIp);
  const malwareFamily = extractField(combined, 'malware family', 'malware', 'family', 'signature') || 'Under analysis';
  const detectionSource = val(incident.detectionSource, val(incident.sourceCategory));
  const iocs = (investigation.iocsSummary || []).filter(i => i.type === 'hash' || i.type === 'domain' || i.type === 'ip').slice(0, 5);

  const findings = (typeof investigation.findings === 'object' && investigation.findings) ? investigation.findings : {};
  const isolated = findings.lateralMovement ? 'Recommended — lateral movement detected' : 'Assessment in progress';
  const persistMechs = Array.isArray(findings.persistenceMechanisms) ? findings.persistenceMechanisms : [];

  return `
    ${sectionHeader('Malware Infection Details')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
        ${infoRow('Hostname', esc(hostname))}
        ${infoRow('IP Address', esc(ip))}
        ${infoRow('Malware Family / Signature', esc(malwareFamily))}
        ${infoRow('Detection Source', esc(detectionSource))}
        ${infoRow('Host Isolation Status', esc(isolated))}
        ${infoRow('Malicious Files Quarantined', persistMechs.length > 0 ? 'In progress' : 'Yes / Under review')}
        ${iocs.length > 0 ? infoRow('IOCs Identified', iocs.map(i => `${i.type || 'unknown'}: ${i.value || 'N/A'}`).join(', ')) : ''}
      </table>
    </td></tr>
    ${sectionHeader('Required Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Validate if the asset can be taken offline for full scan and remediation.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Run full AV/EDR scan and remove/quarantine all detections.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Confirm any business impact or critical processes running on this host.</li>
      </ul>
    </td></tr>`;
}

function renderPhishingSection(p: NotificationParams): string {
  const { incident, investigation } = p;
  const combined = `${incident.description || ''}\n${investigation.technicalReport || ''}`;

  const sender = extractField(combined, 'sender', 'from address', 'from') || val(incident.sourceIp);
  const phishSubject = extractField(combined, 'subject', 'email subject', 'phishing subject') || val(incident.title);
  const maliciousIndicators = extractField(combined, 'URL', 'malicious URL', 'link', 'attachment') || 'See IOC table below';

  return `
    ${sectionHeader('Phishing Attack Details')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
        ${infoRow('Sender Address', esc(sender))}
        ${infoRow('Phishing Subject', esc(phishSubject))}
        ${infoRow('Malicious Indicator(s)', esc(maliciousIndicators))}
        ${infoRow('Affected Users', val(incident.affectedAssets))}
      </table>
    </td></tr>
    ${sectionHeader('What You Should Do')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">If you received this email, <strong>do not click any links or open attachments</strong>.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Delete the email from Inbox and Deleted Items.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">If you already clicked a link or entered credentials, immediately change your password and inform the SOC team.</li>
      </ul>
    </td></tr>`;
}

function renderBruteForceSection(p: NotificationParams): string {
  const { incident, investigation } = p;
  const combined = `${incident.description || ''}\n${investigation.technicalReport || ''}`;

  const account = extractField(combined, 'account', 'user', 'username', 'target account') || val(incident.affectedAssets);
  const targetSystem = extractField(combined, 'target system', 'system', 'application') || 'AD/VPN/Email';
  const sourceIps = val(incident.sourceIp);
  const failedAttempts = extractField(combined, 'failed attempt', 'attempt count', 'failed login') || 'Multiple';
  const accountLocked = extractField(combined, 'locked', 'lockout', 'account status') || 'Under review';

  return `
    ${sectionHeader('Brute Force / Credential Attack Details')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
        ${infoRow('Target Account', esc(account))}
        ${infoRow('Target System', esc(targetSystem))}
        ${infoRow('Source IP(s)', esc(sourceIps))}
        ${infoRow('Failed Attempts', esc(failedAttempts))}
        ${infoRow('Account Lockout Status', esc(accountLocked))}
      </table>
    </td></tr>
    ${sectionHeader('SOC Actions Taken')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Enabled/confirmed account lockout policy.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Blocked offending IP(s)/countries at firewall/WAF/VPN.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Monitoring for further attempts.</li>
      </ul>
    </td></tr>
    ${sectionHeader('Required Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Confirm if this login activity could be legitimate (e.g., misconfigured script, VPN issue).</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">If suspicious, reset the account password and enforce MFA.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Validate any recent access from unusual locations with the user.</li>
      </ul>
    </td></tr>`;
}

function renderRansomwareSection(p: NotificationParams): string {
  const { incident, investigation } = p;
  const combined = `${incident.description || ''}\n${investigation.technicalReport || ''}`;
  const findings = (typeof investigation.findings === 'object' && investigation.findings) ? investigation.findings : {};

  const affectedSystems = val(incident.affectedAssets);
  const symptoms = extractField(combined, 'symptom', 'encryption', 'ransom note', 'locked') || 'File encryption detected, services stopped';
  const ransomNote = extractField(combined, 'ransom note', 'ransom') || 'Under investigation';

  return `
    ${sectionHeader('Ransomware Incident Details')}
    <tr><td style="padding:8px 32px 8px 32px;">
      <div style="background:#fef2f2;border:2px solid #dc2626;border-radius:6px;padding:12px 16px;margin-bottom:12px;">
        <strong style="color:#dc2626;font-size:14px;">&#9888; CRITICAL: Suspected ransomware attack — Immediate response required</strong>
      </div>
    </td></tr>
    <tr><td style="padding:0 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
        ${infoRow('Affected Systems', esc(affectedSystems))}
        ${infoRow('Symptoms', esc(symptoms))}
        ${infoRow('Ransom Note', esc(ransomNote))}
        ${infoRow('Lateral Movement Detected', findings.lateralMovement ? 'Yes' : 'Under investigation')}
        ${infoRow('Data Exfiltration Risk', findings.dataExfiltration ? 'Yes — assess regulatory notification requirements' : 'Under investigation')}
      </table>
    </td></tr>
    ${sectionHeader('SOC Actions Initiated')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Isolating affected systems from the network.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Blocking known malicious IPs/domains associated with the incident.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Preserving forensic evidence (logs, memory, disk snapshots) where possible.</li>
      </ul>
    </td></tr>
    ${sectionHeader('Immediate Actions Required')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Authorize isolation of additional at-risk systems if needed.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Activate the incident response / crisis management plan.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Confirm legal, PR, and compliance contacts for regulatory notifications (if data exposure is suspected).</li>
      </ul>
    </td></tr>`;
}

function renderNetworkIntrusionSection(p: NotificationParams): string {
  const { incident, investigation } = p;
  const combined = `${incident.description || ''}\n${investigation.technicalReport || ''}`;

  const segment = extractField(combined, 'segment', 'VLAN', 'network segment') || val(incident.affectedAssets);
  const behavior = extractField(combined, 'behavior', 'detected behavior', 'scanning', 'lateral') || 'Suspicious network activity detected';
  const detectionSource = val(incident.detectionSource, val(incident.sourceCategory));

  return `
    ${sectionHeader('Network Intrusion Details')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
        ${infoRow('Affected Segment/VLAN', esc(segment))}
        ${infoRow('Key Hosts Involved', `${val(incident.sourceIp)} &rarr; ${val(incident.destinationIp)}`)}
        ${infoRow('Detected Behavior', esc(behavior))}
        ${infoRow('Detection Source', esc(detectionSource))}
      </table>
    </td></tr>
    ${sectionHeader('SOC Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Applied temporary blocks or ACLs on suspicious IPs/ports.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Enabled increased logging and packet capture on affected segments.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Correlated events with endpoint and identity logs for potential compromise.</li>
      </ul>
    </td></tr>
    ${sectionHeader('Required Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Validate whether any of this traffic is expected (e.g., new tool, maintenance).</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Review recent changes and privileged sessions on the involved systems.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Assist with additional segmentation or isolation as required.</li>
      </ul>
    </td></tr>`;
}

function renderWebAppAttackSection(p: NotificationParams): string {
  const { incident, investigation } = p;
  const combined = `${incident.description || ''}\n${investigation.technicalReport || ''}`;

  const appName = extractField(combined, 'application', 'app name', 'app', 'URL') || val(incident.affectedAssets);
  const attackTypes = extractField(combined, 'attack type', 'SQL injection', 'XSS', 'OWASP', 'injection') || val(incident.attackVector, 'Web attack pattern detected');
  const sourceIps = val(incident.sourceIp);
  const detectionSource = val(incident.detectionSource, 'WAF/SIEM');
  const payload = extractField(combined, 'payload', 'payload sample') || '';
  const truncPayload = payload.length > 150 ? payload.substring(0, 150) + '...' : payload;

  return `
    ${sectionHeader('Web Application Attack Details')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
        ${infoRow('Application', esc(appName))}
        ${infoRow('Attack Type(s)', esc(attackTypes))}
        ${infoRow('Source IP(s)', esc(sourceIps))}
        ${infoRow('Detection Source', esc(detectionSource))}
        ${truncPayload ? infoRow('Payload Sample', `<code style="font-size:12px;background:#f1f5f9;padding:2px 6px;border-radius:3px;word-break:break-all;">${esc(truncPayload)}</code>`) : ''}
      </table>
    </td></tr>
    ${sectionHeader('SOC Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Blocked or rate-limited malicious IPs/ranges at WAF or firewall.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Enabled or tightened specific WAF rules for the relevant attack pattern.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Captured HTTP request samples for forensic and development review.</li>
      </ul>
    </td></tr>
    ${sectionHeader('Required Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Review captured requests and assess if any exploit attempts were successful.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Validate that input validation, authentication, and authorization controls are correctly implemented.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Plan remediation (code fix/config change) and regression testing if vulnerabilities are confirmed.</li>
      </ul>
    </td></tr>`;
}

function renderVulnExploitSection(p: NotificationParams): string {
  const { incident, investigation } = p;
  const combined = `${incident.description || ''}\n${investigation.technicalReport || ''}`;

  const cveId = extractField(combined, 'CVE', 'CVE-', 'vulnerability') || 'Under analysis';
  const asset = val(incident.affectedAssets, val(incident.sourceIp));
  const status = extractField(combined, 'status', 'exploit status') || 'Under investigation';
  const detectionSource = val(incident.detectionSource, val(incident.sourceCategory));

  return `
    ${sectionHeader('Vulnerability Exploit Details')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
        ${infoRow('Vulnerability ID', esc(cveId))}
        ${infoRow('Affected Asset', esc(asset))}
        ${infoRow('Detection Source', esc(detectionSource))}
        ${infoRow('Exploit Status', esc(status))}
        ${infoRow('Source IP', val(incident.sourceIp))}
      </table>
    </td></tr>
    ${sectionHeader('SOC Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Blocked the offending IP(s)/request patterns where feasible.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Checked for known post-exploitation indicators on the host(s).</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Correlated with vulnerability scanning data to confirm exposure.</li>
      </ul>
    </td></tr>
    ${sectionHeader('Required Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Apply the recommended patch/workaround on all affected systems as priority.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Validate system integrity (logs, processes, services, scheduled tasks) for signs of compromise.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Confirm maintenance window and rollback plans if needed.</li>
      </ul>
    </td></tr>`;
}

function renderSocialEngineeringSection(p: NotificationParams): string {
  const { incident, investigation } = p;
  const combined = `${incident.description || ''}\n${investigation.technicalReport || ''}`;

  const attackChannel = extractField(combined, 'channel', 'type', 'method') || 'Email/Phone';
  const pretext = extractField(combined, 'pretext', 'pretending', 'impersonat') || 'Social engineering tactics detected';
  const requestedInfo = extractField(combined, 'requested', 'information', 'target data') || 'Credentials / sensitive data';

  return `
    ${sectionHeader('Social Engineering Attack Details')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
        ${infoRow('Attack Channel', esc(attackChannel))}
        ${infoRow('Attacker Pretext', esc(pretext))}
        ${infoRow('Requested Information/Actions', esc(requestedInfo))}
        ${infoRow('Affected User(s)', val(incident.affectedAssets))}
      </table>
    </td></tr>
    ${sectionHeader('SOC Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Validated that the communication is not from a legitimate internal or trusted external source.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Blocked related domains/addresses/phone numbers where technically possible.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Logged IOCs and updated awareness material.</li>
      </ul>
    </td></tr>
    ${sectionHeader('Awareness & Required Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Do not share passwords, OTPs, or financial information with anyone via email/SMS/unsolicited calls.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">Report any similar attempts immediately to SOC/IT Security.</li>
        <li style="margin-bottom:4px;font-size:13px;color:#1e293b;">If any sensitive information was shared, notify SOC for containment (password reset, access review).</li>
      </ul>
    </td></tr>`;
}

function renderIncidentClosureSection(p: NotificationParams): string {
  const { incident, investigation } = p;
  const findings = (typeof investigation.findings === 'object' && investigation.findings) ? investigation.findings : {};
  const recs = (typeof investigation.recommendations === 'object' && investigation.recommendations) ? investigation.recommendations : {};
  const containment = Array.isArray(recs.containmentActions) ? recs.containmentActions.map((a: any) => a.action || a) : (Array.isArray(recs.containment) ? recs.containment : []);
  const remediation = Array.isArray(recs.remediationSteps) ? recs.remediationSteps.map((a: any) => a.step || a) : (Array.isArray(recs.remediation) ? recs.remediation : []);
  const prevention = Array.isArray(recs.preventionMeasures) ? recs.preventionMeasures : [];

  const entities = Array.isArray(investigation.affectedEntities) ? investigation.affectedEntities : (Array.isArray(findings.affectedEntities) ? findings.affectedEntities : []);

  return `
    ${sectionHeader('What Happened')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">${esc(investigation.executiveSummary || 'Incident has been investigated and resolved.')}</p>
    </td></tr>

    ${sectionHeader('Impact')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
        ${infoRow('Affected Systems/Users', entities.length > 0 ? entities.map((e: any) => `${e.type}: ${e.value}`).join(', ') : val(incident.affectedAssets))}
        ${infoRow('Risk Score', `${investigation.riskScore || 0}/100`)}
        ${infoRow('Lateral Movement', findings.lateralMovement ? 'Detected' : 'Not detected')}
        ${infoRow('Data Exfiltration', findings.dataExfiltration ? 'Suspected' : 'Not detected')}
      </table>
    </td></tr>

    ${sectionHeader('Actions Taken')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <h3 style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#dc2626;">Containment</h3>
      <ul style="margin:0 0 12px 0;padding-left:18px;list-style-type:disc;">${bulletList(containment)}</ul>
      <h3 style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#2563eb;">Remediation</h3>
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">${bulletList(remediation)}</ul>
    </td></tr>

    ${sectionHeader('Lessons Learned & Recommendations')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <ul style="margin:0;padding-left:18px;list-style-type:disc;">${bulletList(prevention.length > 0 ? prevention : ['Continue monitoring for recurrence', 'Review and update detection rules'])}</ul>
      <p style="margin:12px 0 0 0;font-size:13px;color:#64748b;">The incident is now marked as <strong>Closed</strong>, with continued monitoring in place for any recurrence.</p>
    </td></tr>`;
}

function renderAttackTypeSection(p: NotificationParams): string {
  const attackType = p.attackType || 'generic';
  switch (attackType) {
    case 'malware': return renderMalwareSection(p);
    case 'phishing': return renderPhishingSection(p);
    case 'brute_force': return renderBruteForceSection(p);
    case 'ransomware': return renderRansomwareSection(p);
    case 'network_intrusion': return renderNetworkIntrusionSection(p);
    case 'web_app_attack': return renderWebAppAttackSection(p);
    case 'vuln_exploit': return renderVulnExploitSection(p);
    case 'social_engineering': return renderSocialEngineeringSection(p);
    case 'incident_closure': return renderIncidentClosureSection(p);
    default: return renderGenericAttackSection(p);
  }
}

function renderAttackChain(investigation: NotificationParams['investigation'], severityColor: string): string {
  if (!Array.isArray(investigation.attackChain) || investigation.attackChain.length === 0) {
    return '';
  }

  const rows = investigation.attackChain.map((step, i) => {
    const s = (typeof step === 'object' && step) ? step : { phase: 'Unknown', description: '', evidence: '' };
    return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;width:32px;text-align:center;">
        <span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:50%;background:${severityColor};color:#fff;font-size:12px;font-weight:700;text-align:center;">${i + 1}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">
        <strong style="color:#1e293b;font-size:13px;">${esc(s.phase)}</strong><br/>
        <span style="color:#475569;font-size:13px;">${esc(s.description)}</span><br/>
        <span style="color:#64748b;font-size:12px;font-style:italic;">Evidence: ${esc(s.evidence)}</span>
      </td>
    </tr>`;
  }).join('');

  return `
    ${sectionHeader('Attack Chain')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        ${rows}
      </table>
    </td></tr>`;
}

function renderIOCTable(investigation: NotificationParams['investigation']): string {
  if (!Array.isArray(investigation.iocsSummary) || investigation.iocsSummary.length === 0) {
    return '';
  }

  const rows = investigation.iocsSummary.map(rawIoc => {
    const ioc = (typeof rawIoc === 'object' && rawIoc) ? rawIoc : { type: 'unknown', value: 'N/A', reputation: 'unknown', context: '' };
    return `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#1e293b;">${esc(ioc.type)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#1e293b;word-break:break-all;"><code style="font-size:11px;background:#f1f5f9;padding:1px 4px;border-radius:2px;">${esc(ioc.value)}</code></td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#1e293b;">${esc(ioc.reputation)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">${esc(ioc.context)}</td>
    </tr>`;
  }).join('');

  return `
    ${sectionHeader('Indicators of Compromise (IOCs)')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        <tr style="background:#f1f5f9;">
          <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #cbd5e1;">Type</th>
          <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #cbd5e1;">Value</th>
          <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #cbd5e1;">Reputation</th>
          <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #cbd5e1;">Context</th>
        </tr>
        ${rows}
      </table>
    </td></tr>`;
}

function renderRecommendations(investigation: NotificationParams['investigation']): string {
  const rawRecs = (investigation && investigation.recommendations) || {};
  const recs = (typeof rawRecs === 'object' && rawRecs && !Array.isArray(rawRecs)) ? rawRecs : {};
  const containment = Array.isArray(recs.containmentActions) ? recs.containmentActions.map((a: any) => typeof a === 'string' ? a : `[${a?.priority || 'medium'}] ${a?.action || 'Action'}`) : (Array.isArray(recs.containment) ? recs.containment : []);
  const remediation = Array.isArray(recs.remediationSteps) ? recs.remediationSteps.map((a: any) => typeof a === 'string' ? a : `${a?.step || 'Step'} (${a?.owner || 'SOC'}, ${a?.timeline || 'TBD'})`) : (Array.isArray(recs.remediation) ? recs.remediation : []);

  if (containment.length === 0 && remediation.length === 0) return '';

  return `
    ${sectionHeader('Recommended Actions')}
    <tr><td style="padding:8px 32px 16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;width:50%;padding-right:8px;">
            <h3 style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#dc2626;">Containment</h3>
            <ul style="margin:0;padding-left:18px;list-style-type:disc;">${bulletList(containment)}</ul>
          </td>
          <td style="vertical-align:top;width:50%;padding-left:8px;">
            <h3 style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#2563eb;">Remediation</h3>
            <ul style="margin:0;padding-left:18px;list-style-type:disc;">${bulletList(remediation)}</ul>
          </td>
        </tr>
      </table>
    </td></tr>`;
}

export function generateNotificationEmail(params: NotificationParams): { subject: string; html: string } {
  const { incident, investigation, tenant, actionToken, baseUrl, domain } = params;
  const severity = (incident.severity || 'medium').toLowerCase();
  const severityColor = SEVERITY_COLORS[severity] || SEVERITY_COLORS.medium;
  const rawBrandColor = tenant.brandColor || '#3b82f6';
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(rawBrandColor) ? rawBrandColor : '#3b82f6';
  const logoUrl = tenant.logoUrl || null;
  const domainLabel = DOMAIN_LABELS[domain] || String(domain || 'Endpoint Threat');
  const timestamp = formatTimestamp(tenant.timezone);

  let attackType: AttackType;
  try {
    attackType = (params.attackType || classifyAttackType(incident)) as AttackType;
  } catch {
    attackType = 'generic';
  }
  const attackTypeLabel = ATTACK_TYPE_LABELS[attackType] || ATTACK_TYPE_LABELS.generic;

  const verdict = (investigation.verdict || 'inconclusive').toLowerCase();
  let verdictLabel = 'Inconclusive';
  let verdictBg = '#f59e0b';
  let verdictText = '#92400e';
  if (verdict.includes('true') || verdict === 'true_positive') {
    verdictLabel = 'True Positive';
    verdictBg = '#dc2626';
    verdictText = '#ffffff';
  } else if (verdict.includes('false') || verdict === 'false_positive') {
    verdictLabel = 'False Positive';
    verdictBg = '#16a34a';
    verdictText = '#ffffff';
  }

  const confidencePct = investigation.confidenceScore != null ? `${investigation.confidenceScore}%` : 'N/A';

  let subject: string;
  if (attackType === 'incident_closure') {
    subject = `Incident #${incident.id} — ${attackTypeLabel} — Investigation Closed | ${tenant.name}`;
  } else if (attackType === 'ransomware') {
    subject = `[CRITICAL] Suspected Ransomware Activity — Incident #${incident.id} — Immediate Response | ${tenant.name}`;
  } else if (attackType === 'phishing') {
    subject = `Security Alert: Phishing Detected — Incident #${incident.id} | ${tenant.name}`;
  } else {
    subject = `[${severity.toUpperCase()}] ${attackTypeLabel} — ${incident.title} — Incident #${incident.id} | ${tenant.name}`;
  }

  const closeUrl = `${baseUrl}/incident-action/${actionToken}?action=close`;
  const fpUrl = `${baseUrl}/incident-action/${actionToken}?action=false_positive`;
  const escalateUrl = `${baseUrl}/incident-action/${actionToken}?action=escalate`;
  const acknowledgeUrl = `${baseUrl}/incident-action/${actionToken}?action=acknowledge`;
  const shareUrl = `${baseUrl}/incident-action/${actionToken}?action=share`;

  const isClosureTemplate = attackType === 'incident_closure';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
<tr><td align="center">
<table width="700" cellpadding="0" cellspacing="0" style="max-width:700px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

<!-- Brand Header -->
<tr><td style="background:${brandColor};padding:12px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    ${logoUrl ? `<td style="width:36px;padding-right:12px;vertical-align:middle;"><img src="${esc(logoUrl)}" alt="" style="width:32px;height:32px;border-radius:4px;object-fit:contain;" /></td>` : ''}
    <td style="vertical-align:middle;"><span style="color:#ffffff;font-size:14px;font-weight:700;">${esc(tenant.name)}</span></td>
  </tr></table>
</td></tr>

<!-- Severity Banner -->
<tr><td style="background:${severityColor};padding:10px 32px;">
  <span style="color:#ffffff;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${esc(severity)} SEVERITY — ${esc(attackTypeLabel)}</span>
</td></tr>

<!-- Header -->
<tr><td style="padding:24px 32px 16px 32px;border-bottom:1px solid #e2e8f0;">
  <h1 style="margin:0 0 4px 0;font-size:22px;font-weight:700;color:#0f172a;">SecureOps AI Analyst &mdash; ${isClosureTemplate ? 'Incident Closure Report' : 'Incident Notification'}</h1>
  <p style="margin:0;font-size:13px;color:#64748b;">Automated security analysis and response</p>
</td></tr>

<!-- Incident Info -->
<tr><td style="padding:20px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
    <tr>
      <td style="padding:4px 0;">
        <span style="font-size:12px;color:#64748b;font-weight:600;">Incident ID:</span>
        <span style="font-size:13px;color:#1e293b;font-weight:700;margin-left:4px;">#${esc(String(incident.id))}</span>
      </td>
      <td style="padding:4px 0;text-align:right;">
        <span style="display:inline-block;padding:3px 10px;border-radius:12px;background:${severityColor};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;">${esc(severity)}</span>
        <span style="display:inline-block;padding:3px 10px;border-radius:12px;background:#e2e8f0;color:#475569;font-size:11px;font-weight:600;margin-left:6px;">${esc(domainLabel)}</span>
      </td>
    </tr>
    <tr><td colspan="2" style="padding:6px 0 2px 0;">
      <span style="font-size:15px;font-weight:700;color:#0f172a;">${esc(incident.title)}</span>
    </td></tr>
    <tr><td colspan="2" style="padding:2px 0;">
      <span style="font-size:12px;color:#64748b;">Tenant: <strong>${esc(tenant.name)}</strong> &bull; ${esc(timestamp)}</span>
    </td></tr>
  </table>
</td></tr>

<!-- AI Verdict -->
${sectionHeader('AI Verdict')}
<tr><td style="padding:8px 32px 16px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;">
    <tr><td style="padding:4px 0;">
      <span style="display:inline-block;padding:4px 14px;border-radius:12px;background:${verdictBg};color:${verdictText};font-size:13px;font-weight:700;">${verdictLabel}</span>
      <span style="margin-left:12px;font-size:13px;color:#475569;">Confidence: <strong>${confidencePct}</strong></span>
      <span style="margin-left:12px;font-size:13px;color:#475569;">Risk: <strong>${investigation.riskScore || 0}/100</strong></span>
    </td></tr>
    <tr><td style="padding:8px 0 0 0;">
      <p style="margin:0;font-size:13px;color:#334155;line-height:1.5;">${esc(investigation.verdictReasoning || 'No reasoning provided.')}</p>
    </td></tr>
  </table>
</td></tr>

${!isClosureTemplate ? `
<!-- Executive Summary -->
${sectionHeader('Executive Summary')}
<tr><td style="padding:8px 32px 16px 32px;">
  <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">${esc(investigation.executiveSummary || 'No executive summary available.')}</p>
</td></tr>
` : ''}

<!-- Attack-Type Specific Section -->
${renderAttackTypeSection({ ...params, attackType })}

<!-- Attack Chain -->
${renderAttackChain(investigation, severityColor)}

<!-- IOC Table -->
${renderIOCTable(investigation)}

<!-- Recommendations (for non-closure templates) -->
${!isClosureTemplate ? renderRecommendations(investigation) : ''}

<!-- Action Buttons -->
<tr><td style="padding:24px 32px;text-align:center;">
  <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr>
${(() => {
  const buttons: Array<{url: string; label: string; bg: string}> = [];
  if (verdict.includes('true') || verdict === 'true_positive') {
    buttons.push({ url: closeUrl, label: 'Close Incident', bg: '#16a34a' });
    if (severity === 'critical' || severity === 'high') {
      buttons.push({ url: escalateUrl, label: 'Escalate to Tier 2', bg: '#dc2626' });
    } else {
      buttons.push({ url: acknowledgeUrl, label: 'Acknowledge & Monitor', bg: '#0284c7' });
    }
    buttons.push({ url: shareUrl, label: 'Share Report', bg: brandColor });
  } else if (verdict.includes('false') || verdict === 'false_positive') {
    buttons.push({ url: closeUrl, label: 'Close Incident', bg: '#16a34a' });
    buttons.push({ url: fpUrl, label: 'Report False Positive', bg: '#f59e0b' });
    buttons.push({ url: shareUrl, label: 'Share Report', bg: brandColor });
  } else {
    buttons.push({ url: escalateUrl, label: 'Escalate to Tier 2', bg: '#dc2626' });
    buttons.push({ url: acknowledgeUrl, label: 'Acknowledge & Monitor', bg: '#0284c7' });
    buttons.push({ url: fpUrl, label: 'Report False Positive', bg: '#f59e0b' });
    buttons.push({ url: shareUrl, label: 'Share Report', bg: brandColor });
  }
  return buttons.map((b, i) => `      <td style="padding:0 6px;">
        <a href="${esc(b.url)}" style="display:inline-block;padding:12px 20px;background:${b.bg};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:6px;white-space:nowrap;">${b.label}</a>
      </td>`).join('\n');
})()}
    </tr>
  </table>
</td></tr>

<!-- Footer -->
<tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
  <p style="margin:0;font-size:12px;color:#94a3b8;">Generated by SecureOps AI Analyst | ${esc(tenant.name)} | ${esc(timestamp)}</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}
