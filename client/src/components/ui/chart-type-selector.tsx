import { BarChart3, PieChart as PieChartIcon, AreaChart as AreaChartIcon, Table2, Circle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList, Legend,
} from "recharts";

const FLEX_PALETTE = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#14b8a6", "#f97316", "#3b82f6",
];

const CHART_TYPE_OPTIONS = [
  { value: "bar", icon: BarChart3, label: "Bar" },
  { value: "pie", icon: PieChartIcon, label: "Pie" },
  { value: "donut", icon: Circle, label: "Donut" },
  { value: "table", icon: Table2, label: "Table" },
];

export function ChartTypeSelector({ active, onChange, options }: {
  active: string;
  onChange: (v: string) => void;
  options?: string[];
}) {
  const available = options
    ? CHART_TYPE_OPTIONS.filter(t => options.includes(t.value))
    : CHART_TYPE_OPTIONS;

  return (
    <div className="flex items-center gap-0.5" data-testid="chart-type-selector">
      {available.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`p-1 rounded transition-colors ${active === t.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          data-testid={`chart-type-${t.value}`}
          title={t.label}>
          <t.icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

interface FlexibleChartProps {
  data: Array<{ name: string; value: number; color?: string }>;
  chartType: string;
  height?: number;
  colors?: Record<string, string>;
  colorArray?: string[];
}

export function FlexibleChart({ data, chartType, height = 250, colors, colorArray }: FlexibleChartProps) {
  const getColor = (item: { name: string; color?: string }, index: number) => {
    if (item.color) return item.color;
    if (colors?.[item.name]) return colors[item.name];
    if (colorArray) return colorArray[index % colorArray.length];
    return FLEX_PALETTE[index % FLEX_PALETTE.length];
  };

  if (chartType === "table") {
    return (
      <div className="max-h-[300px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, i) => {
              const total = data.reduce((s, d) => s + d.value, 0);
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
              return (
                <TableRow key={item.name}>
                  <TableCell className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getColor(item, i) }} />
                    {item.name}
                  </TableCell>
                  <TableCell className="text-right font-medium">{item.value.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{pct}%</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (chartType === "pie" || chartType === "donut") {
    const innerRadius = chartType === "donut" ? Math.max(height / 5, 30) : 0;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%"
            innerRadius={innerRadius}
            outerRadius={Math.max(height / 3, 55)}
            paddingAngle={2} dataKey="value" nameKey="name"
            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
            labelLine={true}
            animationDuration={800}>
            {data.map((item, i) => (
              <Cell key={item.name} fill={getColor(item, i)} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => value.toLocaleString()} />
          <Legend wrapperStyle={{ fontSize: "10px" }}
            formatter={(v) => <span className="capitalize text-[10px]">{typeof v === "object" ? String(v) : v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
          angle={data.length > 6 ? -30 : 0}
          textAnchor={data.length > 6 ? "end" : "middle"}
          height={data.length > 6 ? 60 : 30} />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <Tooltip formatter={(value: number) => value.toLocaleString()} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28} animationDuration={800}>
          {data.map((item, i) => (
            <Cell key={item.name} fill={getColor(item, i)} />
          ))}
          <LabelList dataKey="value" position="top" fontSize={11} fill="hsl(var(--foreground))" formatter={(v: number) => v.toLocaleString()} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
