import { useEffect, useRef, useMemo } from "react";

const BASE_ARCS = [
  { src: [39.9, 116.4], dst: [37.8, -122.4], sev: "CRITICAL" },
  { src: [55.7, 37.6], dst: [51.5, -0.1], sev: "CRITICAL" },
  { src: [35.7, 139.7], dst: [40.7, -74.0], sev: "HIGH" },
  { src: [48.9, 2.3], dst: [52.5, 13.4], sev: "MEDIUM" },
  { src: [-23.5, -46.6], dst: [1.4, 103.8], sev: "HIGH" },
  { src: [28.6, 77.2], dst: [25.2, 55.3], sev: "HIGH" },
  { src: [59.9, 30.3], dst: [41.9, 12.5], sev: "CRITICAL" },
  { src: [31.2, 121.5], dst: [-33.9, 151.2], sev: "MEDIUM" },
  { src: [37.6, -122.4], dst: [48.9, 2.3], sev: "LOW" },
  { src: [33.7, -84.4], dst: [19.4, -99.1], sev: "HIGH" },
  { src: [37.6, 127.0], dst: [35.7, 139.7], sev: "MEDIUM" },
  { src: [6.5, 3.4], dst: [48.9, 2.3], sev: "HIGH" },
];

const SEV_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#22c55e",
};

export interface ThreatStats {
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  total?: number;
}

function latLngToXY(lat: number, lng: number, w: number, h: number) {
  const x = ((lng + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return [x, y];
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  t: number,
  color: string
) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const cpx = mx;
  const cpy = my - dist * 0.35;

  ctx.beginPath();
  ctx.setLineDash([]);
  ctx.strokeStyle = color + "22";
  ctx.lineWidth = 1;
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cpx, cpy, x2, y2);
  ctx.stroke();

  if (t > 0) {
    const trailStart = Math.max(0, t - 0.25);
    const steps = 30;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const pt = trailStart + (t - trailStart) * (i / steps);
      const bx = (1 - pt) ** 2 * x1 + 2 * (1 - pt) * pt * cpx + pt ** 2 * x2;
      const by = (1 - pt) ** 2 * y1 + 2 * (1 - pt) * pt * cpy + pt ** 2 * y2;
      const alpha = i / steps;
      if (i === 0) {
        ctx.moveTo(bx, by);
      } else {
        ctx.strokeStyle = color + Math.floor(alpha * 220).toString(16).padStart(2, "0");
        ctx.lineWidth = 1.5 + alpha * 1.5;
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx, by);
      }
    }

    const hx = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cpx + t ** 2 * x2;
    const hy = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cpy + t ** 2 * y2;

    ctx.beginPath();
    ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = color + "44";
    ctx.fill();
  }
}

interface ThreatGlobeProps {
  className?: string;
  height?: number;
  threatStats?: ThreatStats;
}

export function ThreatGlobe({ className = "", height = 200, threatStats }: ThreatGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const activeArcs = useMemo(() => {
    if (!threatStats) return BASE_ARCS;
    const { critical = 0, high = 0, medium = 0, low = 0 } = threatStats;
    const total = critical + high + medium + low || 1;
    const critRatio = critical / total;
    const highRatio = high / total;
    const medRatio = medium / total;
    const lowRatio = low / total;

    const activeCount = Math.min(12, Math.max(3, Math.round(3 + (total > 0 ? Math.log10(total + 1) * 3 : 0))));

    const weights: Record<string, number> = {
      CRITICAL: Math.max(critRatio * 4, critical > 0 ? 1 : 0),
      HIGH: Math.max(highRatio * 3, high > 0 ? 1 : 0),
      MEDIUM: Math.max(medRatio * 2, medium > 0 ? 0.5 : 0),
      LOW: Math.max(lowRatio, low > 0 ? 0.5 : 0),
    };

    const weightedArcs = BASE_ARCS.map((arc) => ({
      ...arc,
      weight: weights[arc.sev] ?? 0.5,
    }));

    weightedArcs.sort((a, b) => b.weight - a.weight);

    return weightedArcs.slice(0, activeCount).map((arc) => ({
      src: arc.src,
      dst: arc.dst,
      sev: arc.sev,
    }));
  }, [threatStats]);

  const arcSpeeds = useMemo(() => {
    const { critical = 0 } = threatStats ?? {};
    const urgency = Math.min(critical / 10, 1);
    return activeArcs.map((_, i) => ({
      t: -(i * 0.18),
      speed: 0.003 + urgency * 0.004 + Math.random() * 0.002,
    }));
  }, [activeArcs, threatStats]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const arcStates = arcSpeeds.map((s) => ({ t: s.t, speed: s.speed }));

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < activeArcs.length; i++) {
        const arc = activeArcs[i];
        const st = arcStates[i];
        st.t += st.speed;
        if (st.t > 1.3) st.t = -0.3;
        const t = Math.max(0, Math.min(1, st.t));

        const [x1, y1] = latLngToXY(arc.src[0], arc.src[1], w, h);
        const [x2, y2] = latLngToXY(arc.dst[0], arc.dst[1], w, h);
        const color = SEV_COLORS[arc.sev] ?? "#3b82f6";
        drawArc(ctx, x1, y1, x2, y2, t, color);

        if (st.t >= 0 && st.t <= 0.05) {
          ctx.beginPath();
          ctx.arc(x1, y1, 3, 0, Math.PI * 2);
          ctx.fillStyle = color + "88";
          ctx.fill();
        }
        if (st.t > 0.95 && st.t <= 1) {
          const pulse = Math.sin(Date.now() / 200) * 1.5;
          ctx.beginPath();
          ctx.arc(x2, y2, 3 + pulse, 0, Math.PI * 2);
          ctx.fillStyle = color + "66";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x2, y2, 2, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [activeArcs, arcSpeeds]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full ${className}`}
      style={{ height, display: "block" }}
      aria-label="Global threat activity map"
      data-testid="threat-globe-canvas"
    />
  );
}
