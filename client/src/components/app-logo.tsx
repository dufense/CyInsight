import { useState } from "react";
import { AppWindow, Bot, Globe } from "lucide-react";

const DOMAIN_MAP: Record<string, string> = {
  "openai": "openai.com",
  "chatgpt": "openai.com",
  "openai - chatgpt": "openai.com",
  "gmail": "gmail.com",
  "google": "google.com",
  "google maps": "maps.google.com",
  "google connected apps": "google.com",
  "google drive": "drive.google.com",
  "google docs": "docs.google.com",
  "google sheets": "sheets.google.com",
  "google slides": "slides.google.com",
  "google calendar": "calendar.google.com",
  "google meet": "meet.google.com",
  "google cloud": "cloud.google.com",
  "google analytics": "analytics.google.com",
  "google ads": "ads.google.com",
  "google gemini": "gemini.google.com",
  "google gemini (formerly bard)": "gemini.google.com",
  "google workspace": "workspace.google.com",
  "youtube": "youtube.com",
  "microsoft": "microsoft.com",
  "microsoft 365": "microsoft.com",
  "microsoft teams": "teams.microsoft.com",
  "microsoft azure": "azure.microsoft.com",
  "clarity by microsoft": "clarity.microsoft.com",
  "microsoft clarity": "clarity.microsoft.com",
  "outlook": "outlook.com",
  "onedrive": "onedrive.com",
  "sharepoint": "sharepoint.com",
  "office 365": "office.com",
  "linkedin": "linkedin.com",
  "github": "github.com",
  "gitlab": "gitlab.com",
  "bitbucket": "bitbucket.org",
  "slack": "slack.com",
  "discord": "discord.com",
  "zoom": "zoom.us",
  "webex": "webex.com",
  "dropbox": "dropbox.com",
  "box": "box.com",
  "salesforce": "salesforce.com",
  "hubspot": "hubspot.com",
  "zendesk": "zendesk.com",
  "jira": "atlassian.com",
  "confluence": "atlassian.com",
  "atlassian": "atlassian.com",
  "trello": "trello.com",
  "asana": "asana.com",
  "monday.com": "monday.com",
  "notion": "notion.so",
  "airtable": "airtable.com",
  "figma": "figma.com",
  "canva": "canva.com",
  "adobe": "adobe.com",
  "adobe creative cloud": "adobe.com",
  "photoshop": "adobe.com",
  "aws": "aws.amazon.com",
  "amazon web services": "aws.amazon.com",
  "amazon": "amazon.com",
  "stripe": "stripe.com",
  "paypal": "paypal.com",
  "twilio": "twilio.com",
  "sendgrid": "sendgrid.com",
  "mailchimp": "mailchimp.com",
  "intercom": "intercom.com",
  "freshdesk": "freshdesk.com",
  "servicenow": "servicenow.com",
  "snowflake": "snowflake.com",
  "databricks": "databricks.com",
  "datadog": "datadoghq.com",
  "splunk": "splunk.com",
  "pagerduty": "pagerduty.com",
  "okta": "okta.com",
  "auth0": "auth0.com",
  "cloudflare": "cloudflare.com",
  "fastly": "fastly.com",
  "akamai": "akamai.com",
  "crowdstrike": "crowdstrike.com",
  "sentinelone": "sentinelone.com",
  "palo alto": "paloaltonetworks.com",
  "palo alto networks": "paloaltonetworks.com",
  "fortinet": "fortinet.com",
  "zscaler": "zscaler.com",
  "sophos": "sophos.com",
  "mcafee": "mcafee.com",
  "norton": "norton.com",
  "kaspersky": "kaspersky.com",
  "trend micro": "trendmicro.com",
  "proofpoint": "proofpoint.com",
  "mimecast": "mimecast.com",
  "barracuda": "barracuda.com",
  "carbon black": "carbonblack.com",
  "vmware": "vmware.com",
  "citrix": "citrix.com",
  "sap": "sap.com",
  "oracle": "oracle.com",
  "workday": "workday.com",
  "tableau": "tableau.com",
  "power bi": "powerbi.com",
  "looker": "looker.com",
  "docker": "docker.com",
  "kubernetes": "kubernetes.io",
  "terraform": "terraform.io",
  "hashicorp": "hashicorp.com",
  "vercel": "vercel.com",
  "netlify": "netlify.com",
  "heroku": "heroku.com",
  "digitalocean": "digitalocean.com",
  "linode": "linode.com",
  "vultr": "vultr.com",
  "pubmatic": "pubmatic.com",
  "criteo": "criteo.com",
  "ilovepdf": "ilovepdf.com",
  "intuit": "intuit.com",
  "intuit - proconnect tax online": "intuit.com",
  "dell": "dell.com",
  "dell premier": "dell.com",
  "hp": "hp.com",
  "lenovo": "lenovo.com",
  "apple": "apple.com",
  "icloud": "icloud.com",
  "deepseek": "deepseek.com",
  "anthropic": "anthropic.com",
  "anthropic - claude": "anthropic.com",
  "claude": "anthropic.com",
  "perplexity": "perplexity.ai",
  "perplexity ai": "perplexity.ai",
  "grok": "x.ai",
  "copilot": "copilot.microsoft.com",
  "microsoft copilot": "copilot.microsoft.com",
  "github copilot": "github.com",
  "midjourney": "midjourney.com",
  "stability ai": "stability.ai",
  "stable diffusion": "stability.ai",
  "hugging face": "huggingface.co",
  "huggingface": "huggingface.co",
  "cohere": "cohere.com",
  "jasper": "jasper.ai",
  "jasper ai": "jasper.ai",
  "grammarly": "grammarly.com",
  "writesonic": "writesonic.com",
  "copy.ai": "copy.ai",
  "runway": "runwayml.com",
  "runway ml": "runwayml.com",
  "descript": "descript.com",
  "synthesia": "synthesia.io",
  "elevenlabs": "elevenlabs.io",
  "replicate": "replicate.com",
  "meta": "meta.com",
  "facebook": "facebook.com",
  "instagram": "instagram.com",
  "whatsapp": "whatsapp.com",
  "twitter": "x.com",
  "x": "x.com",
  "tiktok": "tiktok.com",
  "snapchat": "snapchat.com",
  "pinterest": "pinterest.com",
  "reddit": "reddit.com",
  "yahoo": "yahoo.com",
  "yahoo mail": "mail.yahoo.com",
  "bing": "bing.com",
  "duckduckgo": "duckduckgo.com",
  "brave": "brave.com",
  "firefox": "mozilla.org",
  "chrome": "google.com",
  "edge": "microsoft.com",
  "standard chartered": "sc.com",
  "standard chartered - straight2bank": "sc.com",
  "standard chartered bank": "sc.com",
  "hsbc": "hsbc.com",
  "jpmorgan": "jpmorgan.com",
  "jp morgan": "jpmorgan.com",
  "citibank": "citibank.com",
  "wells fargo": "wellsfargo.com",
  "bank of america": "bankofamerica.com",
  "barclays": "barclays.com",
  "deutsche bank": "db.com",
  "ubs": "ubs.com",
  "credit suisse": "credit-suisse.com",
  "morgan stanley": "morganstanley.com",
  "goldman sachs": "goldmansachs.com",
  "hcontact": "hcontact.com",
  "cisco": "cisco.com",
  "ibm": "ibm.com",
  "intel": "intel.com",
  "nvidia": "nvidia.com",
  "amd": "amd.com",
  "qualcomm": "qualcomm.com",
  "broadcom": "broadcom.com",
  "tenable": "tenable.com",
  "qualys": "qualys.com",
  "rapid7": "rapid7.com",
  "elastic": "elastic.co",
  "mongodb": "mongodb.com",
  "redis": "redis.com",
  "postgresql": "postgresql.org",
  "mysql": "mysql.com",
  "twitch": "twitch.tv",
  "spotify": "spotify.com",
  "netflix": "netflix.com",
  "shopify": "shopify.com",
  "wix": "wix.com",
  "squarespace": "squarespace.com",
  "wordpress": "wordpress.com",
  "evernote": "evernote.com",
  "todoist": "todoist.com",
  "miro": "miro.com",
  "loom": "loom.com",
  "calendly": "calendly.com",
  "docusign": "docusign.com",
  "1password": "1password.com",
  "lastpass": "lastpass.com",
  "bitwarden": "bitwarden.com",
  "dashlane": "dashlane.com",
  "nordvpn": "nordvpn.com",
  "expressvpn": "expressvpn.com",
  "skyhigh": "skyhighsecurity.com",
  "skyhigh security": "skyhighsecurity.com",
  "mcafee skyhigh": "skyhighsecurity.com",
  "trellix": "trellix.com",
  "symantec": "broadcom.com",
  "checkpoint": "checkpoint.com",
  "check point": "checkpoint.com",
  "varonis": "varonis.com",
  "cyberark": "cyberark.com",
  "sailpoint": "sailpoint.com",
  "ping identity": "pingidentity.com",
  "duo": "duo.com",
  "duo security": "duo.com",
};

const domainCache = new Map<string, string | null>();

function appNameToDomain(name: string): string | null {
  const normalized = name.toLowerCase().trim();

  if (domainCache.has(normalized)) return domainCache.get(normalized)!;

  let result: string | null = null;

  if (DOMAIN_MAP[normalized]) {
    result = DOMAIN_MAP[normalized];
  }

  if (!result) {
    const withoutSuffix = normalized.replace(/\s*[-–]\s*.+$/, "").trim();
    if (withoutSuffix !== normalized && DOMAIN_MAP[withoutSuffix]) {
      result = DOMAIN_MAP[withoutSuffix];
    }
  }

  if (!result) {
    for (const [key, domain] of Object.entries(DOMAIN_MAP)) {
      if (key.length >= 5 && normalized.includes(key)) {
        result = domain;
        break;
      }
    }
  }

  domainCache.set(normalized, result);
  return result;
}

interface AppLogoProps {
  name: string;
  size?: number;
  fallbackIcon?: "app" | "bot" | "globe";
  fallbackColor?: string;
  className?: string;
}

export function AppLogo({ name, size = 18, fallbackIcon = "app", fallbackColor = "text-muted-foreground", className = "" }: AppLogoProps) {
  const [failed, setFailed] = useState(false);
  const domain = appNameToDomain(name);

  if (!domain || failed) {
    const iconSize = `h-[${size}px] w-[${size}px]`;
    const classes = `${iconSize} ${fallbackColor} ${className}`;
    if (fallbackIcon === "bot") return <Bot className={classes} style={{ width: size, height: size }} />;
    if (fallbackIcon === "globe") return <Globe className={classes} style={{ width: size, height: size }} />;
    return <AppWindow className={classes} style={{ width: size, height: size }} />;
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`}
      alt={`${name} logo`}
      width={size}
      height={size}
      className={`rounded-sm object-contain ${className}`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
