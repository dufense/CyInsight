import { useTenant } from "./tenant-context";

export function formatTenantDateTime(date: string | Date | null | undefined, timezone: string = "UTC"): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleString();
  }
}

export function formatTenantDateTimeShort(date: string | Date | null | undefined, timezone: string = "UTC"): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleString();
  }
}

export function formatTenantDate(date: string | Date | null | undefined, timezone: string = "UTC"): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: timezone,
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleDateString();
  }
}

export function formatTenantTime(date: string | Date | null | undefined, timezone: string = "UTC"): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleTimeString();
  }
}

export function formatTenantRelative(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

export function formatTenantChartLabel(date: string | Date | null | undefined, timezone: string = "UTC", range?: string): string {
  if (!date) return "";
  try {
    const d = new Date(date);
    if (range === "1h" || range === "24h") {
      return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: timezone,
      }).format(d);
    }
    if (range === "7d") {
      return new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        timeZone: timezone,
      }).format(d);
    }
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      day: "numeric",
      timeZone: timezone,
    }).format(d);
  } catch {
    return new Date(date).toLocaleDateString();
  }
}

export function formatTenantDateTimeCombined(date: string | Date | null | undefined, timezone: string = "UTC"): string {
  if (!date) return "—";
  const formatted = formatTenantDateTimeShort(date, timezone);
  const relative = formatTenantRelative(date);
  return `${formatted} (${relative})`;
}

export function getTimezoneAbbr(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" }).formatToParts(new Date());
    const tzPart = parts.find(p => p.type === "timeZoneName");
    return tzPart?.value || timezone;
  } catch {
    return timezone;
  }
}

export function useTenantDateFormatter() {
  const { currentTenant } = useTenant();
  const tz = currentTenant?.timezone || "UTC";

  return {
    timezone: tz,
    timezoneAbbr: getTimezoneAbbr(tz),
    formatDateTime: (date: string | Date | null | undefined) => formatTenantDateTime(date, tz),
    formatDateTimeShort: (date: string | Date | null | undefined) => formatTenantDateTimeShort(date, tz),
    formatDate: (date: string | Date | null | undefined) => formatTenantDate(date, tz),
    formatTime: (date: string | Date | null | undefined) => formatTenantTime(date, tz),
    formatRelative: (date: string | Date | null | undefined) => formatTenantRelative(date),
    formatChartLabel: (date: string | Date | null | undefined, range?: string) => formatTenantChartLabel(date, tz, range),
    formatCombined: (date: string | Date | null | undefined) => formatTenantDateTimeCombined(date, tz),
  };
}

export const TIMEZONE_OPTIONS = [
  "UTC",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Seoul",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Asia/Riyadh",
  "Asia/Tel_Aviv",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Zurich",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Europe/Warsaw",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];
