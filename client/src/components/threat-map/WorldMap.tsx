import { useRef, useEffect, useState, useContext } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  MapContext,
} from "react-simple-maps";
import { COUNTRY_MAP } from "@/lib/country-centroids";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const GEO_URL = "/countries-110m.json";

export interface ArcData {
  from: string;
  to: string;
  severity: string;
  count: number;
  toLat?: number;
  toLon?: number;
  toCity?: string;
  fromLat?: number;
  fromLon?: number;
}

export interface OfficeLocation {
  id?: number | null;
  name?: string;
  code: string;
  city: string;
  countryCode: string;
  lat: number;
  lon: number;
  hostnameKeywords?: string[];
}

export const SEV_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#22c55e",
  info:     "#3b82f6",
};

interface MapPalette {
  oceanBackground: string;
  countryDefault: string;
  countryHoverFill: string;
  strokeDefault: string;
  strokeHover: string;
  strokeThreat: string;
  strokeTarget: string;
  targetFill: string;
  unknownCountry: string;
  officeFill: string;
  officeCountryFill: string;
  officeStroke: string;
  officeRingStroke: string;
  officeInnerFill: string;
  officeInnerFillHover: string;
  officeLabel: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipSubText: string;
  glowBlendMode: string;
  glowStdDeviation: number;
  arcOpacity: number;
}

const DARK_PALETTE: MapPalette = {
  oceanBackground: "linear-gradient(135deg, hsl(222,33%,6%) 0%, hsl(222,33%,9%) 100%)",
  countryDefault: "#1e2d3d",
  countryHoverFill: "#2d3748",
  strokeDefault: "rgba(51,65,85,0.6)",
  strokeHover: "rgba(203,213,225,0.9)",
  strokeThreat: "rgba(148,163,184,0.4)",
  strokeTarget: "#60a5fa",
  targetFill: "#3b82f650",
  unknownCountry: "rgba(51,65,85,0.5)",
  officeFill: "#1e3a5f60",
  officeCountryFill: "#1e3a5f60",
  officeStroke: "#60a5fa80",
  officeRingStroke: "#60a5fa",
  officeInnerFill: "#1e3a5f",
  officeInnerFillHover: "#1e40af",
  officeLabel: "#93c5fd",
  tooltipBg: "#0f172a",
  tooltipText: "#93c5fd",
  tooltipSubText: "#94a3b8",
  glowBlendMode: "screen",
  glowStdDeviation: 1.5,
  arcOpacity: 0.6,
};

const LIGHT_PALETTE: MapPalette = {
  oceanBackground: "linear-gradient(135deg, hsl(210,40%,88%) 0%, hsl(210,35%,82%) 100%)",
  countryDefault: "#c8d8e8",
  countryHoverFill: "#b0c4d8",
  strokeDefault: "rgba(100,130,160,0.5)",
  strokeHover: "rgba(30,60,90,0.9)",
  strokeThreat: "rgba(60,90,130,0.5)",
  strokeTarget: "#2563eb",
  targetFill: "#3b82f640",
  unknownCountry: "rgba(100,130,160,0.4)",
  officeFill: "#bfdbfe50",
  officeCountryFill: "#bfdbfe50",
  officeStroke: "#2563eb60",
  officeRingStroke: "#2563eb",
  officeInnerFill: "#1d4ed8",
  officeInnerFillHover: "#1e40af",
  officeLabel: "#1d4ed8",
  tooltipBg: "#1e3a5f",
  tooltipText: "#bfdbfe",
  tooltipSubText: "#93c5fd",
  glowBlendMode: "multiply",
  glowStdDeviation: 1.0,
  arcOpacity: 0.75,
};

const NAME_TO_ALPHA2: Record<string, string> = {
  "Afghanistan": "AF", "Albania": "AL", "Algeria": "DZ", "Angola": "AO",
  "Argentina": "AR", "Armenia": "AM", "Australia": "AU", "Austria": "AT",
  "Azerbaijan": "AZ", "Bahrain": "BH", "Bangladesh": "BD", "Belarus": "BY",
  "Belgium": "BE", "Bolivia": "BO", "Bosnia and Herz.": "BA", "Brazil": "BR",
  "Bulgaria": "BG", "Cambodia": "KH", "Cameroon": "CM", "Canada": "CA",
  "Chile": "CL", "China": "CN", "Colombia": "CO", "Congo": "CG",
  "Dem. Rep. Congo": "CD", "Croatia": "HR", "Cuba": "CU", "Cyprus": "CY",
  "Czechia": "CZ", "Czech Republic": "CZ", "Denmark": "DK", "Ecuador": "EC",
  "Egypt": "EG", "Ethiopia": "ET", "Finland": "FI", "France": "FR",
  "Georgia": "GE", "Germany": "DE", "Ghana": "GH", "Greece": "GR",
  "Guatemala": "GT", "Honduras": "HN", "Hungary": "HU", "India": "IN",
  "Indonesia": "ID", "Iran": "IR", "Iraq": "IQ", "Ireland": "IE",
  "Israel": "IL", "Italy": "IT", "Japan": "JP", "Jordan": "JO",
  "Kazakhstan": "KZ", "Kenya": "KE", "North Korea": "KP", "South Korea": "KR",
  "Kuwait": "KW", "Lebanon": "LB", "Libya": "LY", "Malaysia": "MY",
  "Mexico": "MX", "Morocco": "MA", "Mozambique": "MZ", "Myanmar": "MM",
  "Nepal": "NP", "Netherlands": "NL", "New Zealand": "NZ", "Nigeria": "NG",
  "Norway": "NO", "Oman": "OM", "Pakistan": "PK", "Palestine": "PS",
  "Panama": "PA", "Peru": "PE", "Philippines": "PH", "Poland": "PL",
  "Portugal": "PT", "Qatar": "QA", "Romania": "RO", "Russia": "RU",
  "Saudi Arabia": "SA", "Senegal": "SN", "Serbia": "RS", "Singapore": "SG",
  "Slovakia": "SK", "Slovenia": "SI", "Somalia": "SO", "South Africa": "ZA",
  "S. Sudan": "SS", "Spain": "ES", "Sri Lanka": "LK", "Sudan": "SD",
  "Sweden": "SE", "Switzerland": "CH", "Syria": "SY", "Taiwan": "TW",
  "Tanzania": "TZ", "Thailand": "TH", "Tunisia": "TN", "Turkey": "TR",
  "Turkmenistan": "TM", "Uganda": "UG", "Ukraine": "UA",
  "United Arab Emirates": "AE", "United Kingdom": "GB",
  "United States of America": "US", "Uruguay": "UY", "Uzbekistan": "UZ",
  "Venezuela": "VE", "Vietnam": "VN", "Yemen": "YE", "Zambia": "ZM",
  "Zimbabwe": "ZW", "W. Sahara": "EH", "Kosovo": "XK",
  "Greenland": "GL", "Puerto Rico": "PR", "North Macedonia": "MK",
  "eSwatini": "SZ", "Timor-Leste": "TL", "Papua New Guinea": "PG",
  "Laos": "LA", "Bhutan": "BT", "Brunei": "BN", "Mongolia": "MN",
  "Madagascar": "MG", "Malawi": "MW", "Mali": "ML", "Mauritania": "MR",
  "Niger": "NE", "Rwanda": "RW", "Sierra Leone": "SL", "Togo": "TG",
  "Central African Rep.": "CF", "Eritrea": "ER", "Djibouti": "DJ",
  "Burundi": "BI", "Benin": "BJ", "Burkina Faso": "BF", "Chad": "TD",
  "Côte d'Ivoire": "CI", "Guinea": "GN", "Guinea-Bissau": "GW",
  "Liberia": "LR", "Namibia": "NA", "Botswana": "BW", "Lesotho": "LS",
  "Eq. Guinea": "GQ", "Gabon": "GA", "Paraguay": "PY",
  "Guyana": "GY", "Suriname": "SR", "El Salvador": "SV", "Nicaragua": "NI",
  "Costa Rica": "CR", "Belize": "BZ", "Jamaica": "JM", "Haiti": "HT",
  "Dominican Rep.": "DO", "Trinidad and Tobago": "TT", "Fiji": "FJ",
  "Solomon Is.": "SB", "Vanuatu": "VU", "Samoa": "WS",
};

interface ArcPath {
  d: string;
  color: string;
  count: number;
  key: string;
  delay: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

export interface WorldMapProps {
  arcs: ArcData[];
  width: number;
  height: number;
  onCountryHover?: (code: string | null) => void;
  onCountryClick?: (code: string) => void;
  targetCountry?: string;
  offices?: OfficeLocation[];
  className?: string;
  mini?: boolean;
}

function OfficeMarkers({
  offices,
  animFrame,
  pal,
}: {
  offices: OfficeLocation[];
  animFrame: number;
  pal: MapPalette;
}) {
  const mapContext = useContext(MapContext);
  // @ts-ignore
  const projection = mapContext?.projection;
  const [hoveredOffice, setHoveredOffice] = useState<string | null>(null);
  if (!projection || !offices.length) return null;

  return (
    <g>
      <defs>
        <filter id="wm-office-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {offices.map((office, i) => {
        const xy = projection([office.lon, office.lat]);
        if (!xy) return null;
        const [x, y] = xy;
        const animDur = `${2.0 + (i % 4) * 0.4}s`;
        const officeKey = String(office.id ?? office.code);
        const isHovered = hoveredOffice === officeKey;

        return (
          <g
            key={officeKey}
            filter="url(#wm-office-glow)"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredOffice(officeKey)}
            onMouseLeave={() => setHoveredOffice(null)}
          >
            {/* Outer pulse ring */}
            <circle
              cx={x} cy={y}
              r={isHovered ? 14 : 12}
              fill="#3b82f6" fillOpacity={0}
              stroke={isHovered ? pal.tooltipText : pal.officeRingStroke}
              strokeWidth={isHovered ? 1.8 : 1.2}
              strokeOpacity={isHovered ? 0.7 : 0.4}
            >
              <animate attributeName="r" values="9;16;9" dur={animDur} repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur={animDur} repeatCount="indefinite" />
            </circle>
            {/* Inner ring */}
            <circle cx={x} cy={y} r={isHovered ? 7 : 6} fill={isHovered ? pal.officeInnerFillHover : pal.officeInnerFill} stroke={pal.officeRingStroke} strokeWidth={1.5} fillOpacity={0.9}>
              <animate attributeName="r" values="5;7;5" dur={animDur} repeatCount="indefinite" />
            </circle>
            {/* Center dot */}
            <circle cx={x} cy={y} r={2.5} fill={pal.tooltipText} fillOpacity={0.95}>
              <animate attributeName="opacity" values="1;0.6;1" dur={animDur} repeatCount="indefinite" />
            </circle>
            {/* Code label */}
            <text
              x={x + 9}
              y={y + 3}
              fontSize="5.5"
              fill={pal.officeLabel}
              fontWeight="600"
              fontFamily="monospace"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {office.code}
            </text>
            {/* Hover tooltip: city name + office name */}
            {isHovered && (
              <g>
                <rect
                  x={x - 32}
                  y={y - 24}
                  width={64}
                  height={17}
                  rx={3}
                  fill={pal.tooltipBg}
                  fillOpacity={0.92}
                  stroke={pal.officeRingStroke}
                  strokeWidth={0.6}
                />
                <text
                  x={x}
                  y={y - 13}
                  textAnchor="middle"
                  fontSize="5"
                  fill={pal.tooltipText}
                  fontWeight="600"
                  fontFamily="sans-serif"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {office.city}
                </text>
                <text
                  x={x}
                  y={y - 7}
                  textAnchor="middle"
                  fontSize="4"
                  fill={pal.tooltipSubText}
                  fontFamily="sans-serif"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {office.name || office.city}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

function ArcOverlay({
  arcs,
  targetCountry,
  mini,
  animFrame,
  sourceCounts,
  maxCount,
  isDark,
  pal,
  offices,
}: {
  arcs: ArcData[];
  targetCountry: string;
  mini: boolean;
  animFrame: number;
  sourceCounts: Map<string, { count: number; maxSev: string }>;
  maxCount: number;
  isDark: boolean;
  pal: MapPalette;
  offices: OfficeLocation[];
}) {
  const mapContext = useContext(MapContext);
  // @ts-ignore
  const projection = mapContext?.projection;
  if (!projection) return null;

  // Build office position lookup keyed by stable id (or code as fallback) for fast access
  const officeXY = new Map<string, [number, number]>();
  for (const office of offices) {
    const xy = projection([office.lon, office.lat]);
    if (xy) officeXY.set(String(office.id ?? office.code), xy as [number, number]);
  }

  // Default target: use first office if available, else use country centroid or US neutral fallback
  let defaultTX: number;
  let defaultTY: number;
  if (offices.length > 0) {
    const firstXY = officeXY.get(String(offices[0].id ?? offices[0].code));
    if (firstXY) {
      [defaultTX, defaultTY] = firstXY;
    } else {
      const centroid = COUNTRY_MAP.get(targetCountry.toUpperCase()) || COUNTRY_MAP.get("US");
      const xy = centroid ? projection([centroid.lon, centroid.lat]) : null;
      [defaultTX, defaultTY] = xy || [0, 0];
    }
  } else {
    const centroid = COUNTRY_MAP.get(targetCountry.toUpperCase()) || COUNTRY_MAP.get("US");
    const xy = centroid ? projection([centroid.lon, centroid.lat]) : null;
    [defaultTX, defaultTY] = xy || [0, 0];
  }

  const uniqueArcs = arcs.slice(0, mini ? 15 : 50);
  const visibleArcs: ArcPath[] = [];

  uniqueArcs.forEach((arc, i) => {
    // Skip if source is same as target country
    if (arc.from.toUpperCase() === targetCountry.toUpperCase()) return;

    // Use IP-geolocated position if available; fall back to country centroid
    let fromXY: [number, number] | null = null;
    if (arc.fromLat !== undefined && arc.fromLon !== undefined) {
      fromXY = projection([arc.fromLon, arc.fromLat]) as [number, number] | null;
    }
    if (!fromXY) {
      const fromCentroid = COUNTRY_MAP.get(arc.from.toUpperCase());
      if (!fromCentroid) return;
      fromXY = projection([fromCentroid.lon, fromCentroid.lat]) as [number, number] | null;
    }
    if (!fromXY) return;
    const [fx, fy] = fromXY;

    // Use per-arc office coordinates if available, else default target
    let tx: number;
    let ty: number;
    if (arc.toLat !== undefined && arc.toLon !== undefined) {
      const xy = projection([arc.toLon, arc.toLat]);
      if (xy) {
        [tx, ty] = xy;
      } else {
        [tx, ty] = [defaultTX, defaultTY];
      }
    } else {
      [tx, ty] = [defaultTX, defaultTY];
    }

    const dist = Math.sqrt((tx - fx) ** 2 + (ty - fy) ** 2);
    const cx = (fx + tx) / 2;
    const cy = Math.min(fy, ty) - dist * 0.35;
    const d = `M ${fx.toFixed(1)} ${fy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;

    visibleArcs.push({
      d, fx, fy, tx, ty,
      color: SEV_COLORS[arc.severity] || SEV_COLORS.medium,
      count: arc.count,
      key: `${arc.from}-${arc.to}-${i}`,
      delay: (i * 0.15) % 3,
    });
  });

  return (
    <g>
      <defs>
        <filter id="wm-arc-glow-live" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={pal.glowStdDeviation} result="blur" />
          <feBlend in="SourceGraphic" in2="blur" mode={pal.glowBlendMode} result="blended" />
          <feComposite in="blended" in2="SourceGraphic" operator="over" />
        </filter>
      </defs>

      {visibleArcs.map((arc, i) => {
        const dashLen = 200;
        const dashGap = 100;
        const offset = ((animFrame * 2 + i * 30) % (dashLen + dashGap));
        return (
          <g key={arc.key} filter="url(#wm-arc-glow-live)">
            <path
              d={arc.d}
              fill="none"
              stroke={arc.color}
              strokeWidth={Math.max(0.8, Math.min(2.5, (arc.count / maxCount) * 3))}
              strokeOpacity={pal.arcOpacity}
              strokeDasharray={`${dashLen} ${dashGap}`}
              strokeDashoffset={-offset}
            />
            <path
              d={arc.d}
              fill="none"
              stroke={arc.color}
              strokeWidth={Math.max(0.4, Math.min(1.2, (arc.count / maxCount) * 1.5))}
              strokeOpacity={isDark ? 0.12 : 0.18}
            />
          </g>
        );
      })}

      {/* Source dots */}
      {visibleArcs.map((arc, i) => (
        <circle
          key={`dot-${arc.key}`}
          cx={arc.fx}
          cy={arc.fy}
          r={3}
          fill={arc.color}
          opacity={0.9}
          filter="url(#wm-arc-glow-live)"
        >
          <animate attributeName="r" values="2.5;4.5;2.5" dur={`${1.5 + (i % 5) * 0.3}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.9;0.5;0.9" dur={`${1.5 + (i % 5) * 0.3}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Default target glow — only shown when no specific offices */}
      {offices.length === 0 && (
        <>
          <circle cx={defaultTX} cy={defaultTY} r={24} fill="url(#wm-target-glow)">
            <animate attributeName="r" values="20;30;20" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx={defaultTX} cy={defaultTY} r={6} fill="#3b82f6" stroke="white" strokeWidth={1.5}>
            <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
          </circle>
        </>
      )}
    </g>
  );
}

export function WorldMap({
  arcs,
  width,
  height,
  onCountryHover,
  onCountryClick,
  targetCountry = "US",
  offices = [],
  className,
  mini = false,
}: WorldMapProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const pal = isDark ? DARK_PALETTE : LIGHT_PALETTE;

  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [animFrame, setAnimFrame] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let running = true;
    let frame = 0;
    function tick() {
      if (!running) return;
      frame++;
      if (frame % 2 === 0) setAnimFrame(f => f + 1);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  const sourceCounts = new Map<string, { count: number; maxSev: string }>();
  const sevOrder = ["critical", "high", "medium", "low", "info"];
  for (const arc of arcs) {
    const existing = sourceCounts.get(arc.from) || { count: 0, maxSev: "info" };
    const newMaxSev = sevOrder.indexOf(arc.severity) < sevOrder.indexOf(existing.maxSev)
      ? arc.severity : existing.maxSev;
    sourceCounts.set(arc.from, { count: existing.count + arc.count, maxSev: newMaxSev });
  }

  const maxCount = Math.max(...Array.from(sourceCounts.values()).map(v => v.count), 1);

  // Highlight countries that have offices
  const officeCodes = new Set(offices.map(o => o.countryCode.toUpperCase()));

  function countryFill(code: string): string {
    if (code === targetCountry) return pal.targetFill;
    if (officeCodes.has(code)) return pal.officeCountryFill;
    const data = sourceCounts.get(code);
    if (!data) return pal.countryDefault;
    const intensity = Math.min(data.count / maxCount, 1);
    const color = SEV_COLORS[data.maxSev] || "#ef4444";
    const minAlpha = isDark ? 0.25 : 0.35;
    const opacity = minAlpha + intensity * (isDark ? 0.65 : 0.55);
    return `${color}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`;
  }

  function countryStroke(code: string, isHovered: boolean): string {
    if (isHovered) return pal.strokeHover;
    if (code === targetCountry) return pal.strokeTarget;
    if (officeCodes.has(code)) return pal.officeStroke;
    if (sourceCounts.has(code)) return pal.strokeThreat;
    return pal.strokeDefault;
  }

  const w = width || 800;
  const h = height || 400;
  const scale = Math.min(w / 6.5, h / 3.5);
  const center: [number, number] = [0, 20];

  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      style={{ width: w, height: h, background: pal.oceanBackground }}
    >
      <ComposableMap
        width={w}
        height={h}
        projection="geoMercator"
        projectionConfig={{ scale, center }}
        style={{ width: "100%", height: "100%", background: "transparent" }}
      >
        <defs>
          <radialGradient id="wm-target-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={isDark ? 0.5 : 0.4} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          <filter id="wm-country-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={pal.glowStdDeviation + 0.5} result="blur" />
            <feBlend in="SourceGraphic" in2="blur" mode={pal.glowBlendMode} result="blended" />
            <feComposite in="blended" in2="SourceGraphic" operator="over" />
          </filter>
        </defs>

        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const countryName = geo.properties?.name as string | undefined;
              const code = countryName ? (NAME_TO_ALPHA2[countryName] || "") : "";
              const isHovered = !!(code && hoveredCountry === code);
              const hasThreat = !!(code && (sourceCounts.has(code) || code === targetCountry || officeCodes.has(code)));
              const fill = code ? countryFill(code) : pal.unknownCountry;
              const stroke = code ? countryStroke(code, isHovered) : pal.unknownCountry;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isHovered ? 1.2 : officeCodes.has(code) ? 0.8 : 0.5}
                  style={{
                    default: { outline: "none", filter: hasThreat ? "url(#wm-country-glow)" : undefined },
                    hover: { outline: "none", cursor: hasThreat ? "pointer" : "default", fill: isHovered ? (hasThreat ? fill : pal.countryHoverFill) : fill },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={() => {
                    if (code) { setHoveredCountry(code); onCountryHover?.(code); }
                  }}
                  onMouseLeave={() => {
                    setHoveredCountry(null); onCountryHover?.(null);
                  }}
                  onClick={() => {
                    if (code && hasThreat) onCountryClick?.(code);
                  }}
                />
              );
            })
          }
        </Geographies>

        <ArcOverlay
          arcs={arcs}
          targetCountry={targetCountry}
          mini={mini}
          animFrame={animFrame}
          sourceCounts={sourceCounts}
          maxCount={maxCount}
          isDark={isDark}
          pal={pal}
          offices={offices}
        />

        <OfficeMarkers offices={offices} animFrame={animFrame} pal={pal} />
      </ComposableMap>
    </div>
  );
}
