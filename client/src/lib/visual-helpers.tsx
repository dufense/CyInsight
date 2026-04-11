import {
  SiOpenai, SiGoogle, SiGoogledrive, SiGooglechrome, SiAdobecreativecloud,
  SiSlack, SiDropbox, SiGithub, SiSalesforce, SiZoom, SiAmazon,
  SiNotion, SiTrello, SiJira, SiConfluence, SiAtlassian, SiAsana,
  SiBox, SiTwilio, SiCloudflare, SiHubspot, SiZendesk, SiIntercom,
  SiMailchimp, SiFigma, SiCanva, SiLinkedin, SiFacebook, SiX,
  SiInstagram, SiWhatsapp, SiTelegram, SiReddit, SiYoutube,
  SiApple, SiDocker, SiKubernetes, SiMongodb, SiElasticsearch,
  SiGrafana, SiDatadog, SiSnowflake, SiSplunk, SiPagerduty,
  SiOkta, SiAuth0, SiLastpass, SiBitdefender,
  SiWordpress, SiShopify, SiStripe, SiPaypal, SiAdobeacrobatreader,
} from "react-icons/si";
import {
  Globe, Shield, Bot, Cloud, Monitor, AlertTriangle,
  ShieldCheck, Lock, Network, Wifi, Server, Eye,
} from "lucide-react";

const iconSize = "w-4 h-4";

const APP_ICON_MAP: Record<string, { icon: any; color: string }> = {
  "cynet": { icon: Shield, color: "#0066CC" },
  "cyneteps": { icon: Shield, color: "#0066CC" },
  "cynet 360": { icon: Shield, color: "#0066CC" },
  "cynet 360 autoxdr": { icon: Shield, color: "#0066CC" },
  "fortinet": { icon: Shield, color: "#EE3124" },
  "fortinac": { icon: Network, color: "#EE3124" },
  "fortinac persistent agent": { icon: Network, color: "#EE3124" },
  "forticlient": { icon: Shield, color: "#EE3124" },
  "forticlient vpn": { icon: Lock, color: "#EE3124" },
  "fortisiem": { icon: Eye, color: "#EE3124" },
  "fortisiem log agent": { icon: Eye, color: "#EE3124" },
  "fortigate": { icon: Shield, color: "#EE3124" },
  "trellix": { icon: Shield, color: "#F37021" },
  "trellix edr": { icon: Shield, color: "#F37021" },
  "mcafee": { icon: Shield, color: "#C01818" },
  "fireeye": { icon: Shield, color: "#F37021" },
  "crowdstrike": { icon: Shield, color: "#E01E26" },
  "falcon": { icon: Shield, color: "#E01E26" },
  "checkpoint": { icon: ShieldCheck, color: "#7B68EE" },
  "check point": { icon: ShieldCheck, color: "#7B68EE" },
  "check point software": { icon: ShieldCheck, color: "#7B68EE" },
  "harmony": { icon: ShieldCheck, color: "#7B68EE" },
  "checkpoint harmony email & collaboration": { icon: ShieldCheck, color: "#7B68EE" },
  "checkpoint harmony email": { icon: ShieldCheck, color: "#7B68EE" },
  "skyhigh": { icon: Cloud, color: "#00BCD4" },
  "skyhigh security": { icon: Cloud, color: "#00BCD4" },
  "skyhigh security sse": { icon: Cloud, color: "#00BCD4" },
  "skyhigh client proxy": { icon: Cloud, color: "#00BCD4" },
  "skyhigh security sse (casb / swg / rbi)": { icon: Cloud, color: "#00BCD4" },
  "trend micro": { icon: Shield, color: "#D71921" },
  "trend micro security agent": { icon: Shield, color: "#D71921" },
  "trend micro deep security agent": { icon: Shield, color: "#D71921" },
  "palo alto": { icon: Shield, color: "#4B53BC" },
  "palo alto networks": { icon: Shield, color: "#4B53BC" },
  "cortex xdr": { icon: Shield, color: "#4B53BC" },
  "sentinelone": { icon: Shield, color: "#6C2DC7" },
  "sophos": { icon: Shield, color: "#003B7A" },
  "kaspersky": { icon: Shield, color: "#006D5C" },
  "eset": { icon: Shield, color: "#21A559" },
  "microsoft defender": { icon: ShieldCheck, color: "#00A4EF" },
  "windows defender": { icon: ShieldCheck, color: "#00A4EF" },
  "anydesk": { icon: Monitor, color: "#EF443B" },
  "logmein": { icon: Monitor, color: "#009CE7" },
  "logmein resolve unattended": { icon: Monitor, color: "#009CE7" },
  "teamviewer": { icon: Monitor, color: "#0E8EE9" },
  "splashtop": { icon: Monitor, color: "#FF6B00" },
  "vmware": { icon: Server, color: "#696566" },
  "deceptive bytes": { icon: Shield, color: "#2D3436" },
  "malwarebytes": { icon: Shield, color: "#0096DB" },
  "rapid7": { icon: Shield, color: "#FF6600" },
  "tenable": { icon: Shield, color: "#007DFF" },
  "nessus": { icon: Shield, color: "#007DFF" },
  "qualys": { icon: Shield, color: "#ED2939" },
  "vicarius": { icon: Shield, color: "#6B4EFF" },
  "cyberark": { icon: Lock, color: "#29528E" },
  "wazuh": { icon: Eye, color: "#3789FF" },
  "veeam": { icon: Server, color: "#00B336" },
  "acronis": { icon: Server, color: "#1B67F5" },
  "aws security": { icon: SiAmazon, color: "#FF9900" },
  "openai": { icon: SiOpenai, color: "#412991" },
  "chatgpt": { icon: SiOpenai, color: "#412991" },
  "openai - chatgpt": { icon: SiOpenai, color: "#412991" },
  "anthropic": { icon: Bot, color: "#D4A574" },
  "anthropic - claude": { icon: Bot, color: "#D4A574" },
  "claude": { icon: Bot, color: "#D4A574" },
  "google": { icon: SiGoogle, color: "#4285F4" },
  "google drive": { icon: SiGoogledrive, color: "#0F9D58" },
  "google docs": { icon: SiGoogle, color: "#4285F4" },
  "google sheets": { icon: SiGoogle, color: "#0F9D58" },
  "google chrome": { icon: SiGooglechrome, color: "#4285F4" },
  "google connected apps": { icon: SiGoogle, color: "#EA4335" },
  "google workspace": { icon: SiGoogle, color: "#4285F4" },
  "gmail": { icon: SiGoogle, color: "#EA4335" },
  "microsoft": { icon: Cloud, color: "#00A4EF" },
  "microsoft 365": { icon: Cloud, color: "#D83B01" },
  "microsoft teams": { icon: Cloud, color: "#6264A7" },
  "microsoft outlook": { icon: Cloud, color: "#0078D4" },
  "onedrive": { icon: Cloud, color: "#0078D4" },
  "azure": { icon: Cloud, color: "#0078D4" },
  "clarity": { icon: Cloud, color: "#7B83EB" },
  "clarity by microsoft": { icon: Cloud, color: "#7B83EB" },
  "adobe": { icon: SiAdobecreativecloud, color: "#FF0000" },
  "adobe creative cloud": { icon: SiAdobecreativecloud, color: "#FF0000" },
  "adobe creative cloud express": { icon: SiAdobecreativecloud, color: "#FF0000" },
  "adobe acrobat": { icon: SiAdobeacrobatreader, color: "#EC1C24" },
  "slack": { icon: SiSlack, color: "#4A154B" },
  "dropbox": { icon: SiDropbox, color: "#0061FF" },
  "github": { icon: SiGithub, color: "#181717" },
  "salesforce": { icon: SiSalesforce, color: "#00A1E0" },
  "zoom": { icon: SiZoom, color: "#2D8CFF" },
  "aws": { icon: SiAmazon, color: "#FF9900" },
  "amazon web services": { icon: SiAmazon, color: "#FF9900" },
  "notion": { icon: SiNotion, color: "#000000" },
  "trello": { icon: SiTrello, color: "#0052CC" },
  "jira": { icon: SiJira, color: "#0052CC" },
  "confluence": { icon: SiConfluence, color: "#172B4D" },
  "atlassian": { icon: SiAtlassian, color: "#0052CC" },
  "asana": { icon: SiAsana, color: "#F06A6A" },
  "box": { icon: SiBox, color: "#0061D5" },
  "twilio": { icon: SiTwilio, color: "#F22F46" },
  "cloudflare": { icon: SiCloudflare, color: "#F38020" },
  "hubspot": { icon: SiHubspot, color: "#FF7A59" },
  "zendesk": { icon: SiZendesk, color: "#03363D" },
  "intercom": { icon: SiIntercom, color: "#6AFDEF" },
  "mailchimp": { icon: SiMailchimp, color: "#FFE01B" },
  "figma": { icon: SiFigma, color: "#F24E1E" },
  "canva": { icon: SiCanva, color: "#00C4CC" },
  "linkedin": { icon: SiLinkedin, color: "#0A66C2" },
  "facebook": { icon: SiFacebook, color: "#1877F2" },
  "twitter": { icon: SiX, color: "#000000" },
  "x": { icon: SiX, color: "#000000" },
  "instagram": { icon: SiInstagram, color: "#E4405F" },
  "whatsapp": { icon: SiWhatsapp, color: "#25D366" },
  "telegram": { icon: SiTelegram, color: "#26A5E4" },
  "reddit": { icon: SiReddit, color: "#FF4500" },
  "youtube": { icon: SiYoutube, color: "#FF0000" },
  "apple": { icon: SiApple, color: "#000000" },
  "icloud": { icon: SiApple, color: "#3693F3" },
  "docker": { icon: SiDocker, color: "#2496ED" },
  "kubernetes": { icon: SiKubernetes, color: "#326CE5" },
  "mongodb": { icon: SiMongodb, color: "#47A248" },
  "elasticsearch": { icon: SiElasticsearch, color: "#005571" },
  "grafana": { icon: SiGrafana, color: "#F46800" },
  "datadog": { icon: SiDatadog, color: "#632CA6" },
  "snowflake": { icon: SiSnowflake, color: "#29B5E8" },
  "splunk": { icon: SiSplunk, color: "#000000" },
  "pagerduty": { icon: SiPagerduty, color: "#06AC38" },
  "servicenow": { icon: Shield, color: "#81B5A1" },
  "okta": { icon: SiOkta, color: "#007DC1" },
  "auth0": { icon: SiAuth0, color: "#EB5424" },
  "lastpass": { icon: SiLastpass, color: "#D32D27" },
  "bitdefender": { icon: SiBitdefender, color: "#ED1C24" },
  "wordpress": { icon: SiWordpress, color: "#21759B" },
  "shopify": { icon: SiShopify, color: "#7AB55C" },
  "stripe": { icon: SiStripe, color: "#635BFF" },
  "paypal": { icon: SiPaypal, color: "#00457C" },
  "smart recruiters": { icon: Globe, color: "#E74C3C" },
  "smartrecruiters": { icon: Globe, color: "#E74C3C" },
};

export function AppIcon({ name, className }: { name: string; className?: string }) {
  const key = name.toLowerCase().trim();
  let match = APP_ICON_MAP[key];
  if (!match) {
    for (const [k, v] of Object.entries(APP_ICON_MAP)) {
      if (key.includes(k) || k.includes(key)) {
        match = v;
        break;
      }
    }
  }
  if (!match) {
    return <Globe className={className || iconSize} style={{ color: "hsl(var(--muted-foreground))" }} />;
  }
  const Icon = match.icon;
  return <Icon className={className || iconSize} style={{ color: match.color }} />;
}

const COUNTRY_FLAGS: Record<string, string> = {};
function codeToFlag(code: string): string {
  if (!code || code.length < 2) return "";
  const upper = code.toUpperCase().slice(0, 2);
  return String.fromCodePoint(
    ...upper.split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  DE: "Germany", FR: "France", JP: "Japan", CN: "China", IN: "India",
  BR: "Brazil", KE: "Kenya", NG: "Nigeria", ZA: "South Africa",
  AE: "UAE", SG: "Singapore", KR: "South Korea", IL: "Israel",
  NL: "Netherlands", SE: "Sweden", NO: "Norway", FI: "Finland",
  CH: "Switzerland", IT: "Italy", ES: "Spain", PT: "Portugal",
  MX: "Mexico", AR: "Argentina", CO: "Colombia", CL: "Chile",
  EG: "Egypt", SA: "Saudi Arabia", PK: "Pakistan", BD: "Bangladesh",
  TH: "Thailand", MY: "Malaysia", ID: "Indonesia", PH: "Philippines",
  VN: "Vietnam", TW: "Taiwan", HK: "Hong Kong", RU: "Russia",
  UA: "Ukraine", PL: "Poland", CZ: "Czech Republic", RO: "Romania",
  HU: "Hungary", AT: "Austria", BE: "Belgium", DK: "Denmark",
  IE: "Ireland", NZ: "New Zealand", GH: "Ghana", TZ: "Tanzania",
  UG: "Uganda", ET: "Ethiopia", MA: "Morocco", TN: "Tunisia",
};

export function CountryFlag({ code, showName, className }: { code: string; showName?: boolean; className?: string }) {
  if (!code) return <span className="text-muted-foreground text-[11px]">--</span>;
  const codes = code.split(",").map(c => c.trim()).filter(Boolean);
  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className || ""}`}>
      {codes.map((c, i) => {
        const flag = codeToFlag(c);
        const name = COUNTRY_NAMES[c.toUpperCase()] || c.toUpperCase();
        return (
          <span key={i} className="inline-flex items-center gap-1" title={name}>
            <span className="text-base leading-none">{flag}</span>
            {showName && <span className="text-[11px]">{name}</span>}
            {!showName && codes.length <= 3 && <span className="text-[10px] text-muted-foreground">{c.toUpperCase()}</span>}
          </span>
        );
      })}
    </span>
  );
}

const RISK_COLORS = {
  critical: { bar: "#ef4444", bg: "#ef444420", text: "text-red-600 dark:text-red-400" },
  high: { bar: "#f97316", bg: "#f9731620", text: "text-orange-600 dark:text-orange-400" },
  medium: { bar: "#eab308", bg: "#eab30820", text: "text-yellow-600 dark:text-yellow-400" },
  low: { bar: "#22c55e", bg: "#22c55e20", text: "text-green-600 dark:text-green-400" },
  info: { bar: "#3b82f6", bg: "#3b82f620", text: "text-blue-600 dark:text-blue-400" },
};

export function RiskBar({ level, score, showLabel, compact }: { level?: string; score?: number; showLabel?: boolean; compact?: boolean }) {
  const normalized = (level || "low").toLowerCase() as keyof typeof RISK_COLORS;
  const config = RISK_COLORS[normalized] || RISK_COLORS.low;
  const pct = score != null ? Math.min(score, 100) : (
    normalized === "critical" ? 95 :
    normalized === "high" ? 75 :
    normalized === "medium" ? 50 :
    normalized === "info" ? 20 : 25
  );
  const h = compact ? "h-1.5" : "h-2";
  const w = compact ? "w-16" : "w-20";
  return (
    <div className="flex items-center gap-2">
      <div className={`${w} ${h} rounded-full overflow-hidden`} style={{ backgroundColor: config.bg }}>
        <div className={`${h} rounded-full transition-all`} style={{ width: `${pct}%`, backgroundColor: config.bar }} />
      </div>
      {showLabel !== false && (
        <span className={`text-[10px] font-semibold capitalize ${config.text}`}>{level || "low"}</span>
      )}
    </div>
  );
}

export function SeverityDot({ level }: { level?: string }) {
  const normalized = (level || "info").toLowerCase();
  const color = RISK_COLORS[normalized as keyof typeof RISK_COLORS]?.bar || "#3b82f6";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-medium capitalize">{level || "info"}</span>
    </span>
  );
}
