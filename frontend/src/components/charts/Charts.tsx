import { useState, type ReactNode } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipProps,
} from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import clsx from "clsx";
import { compact, periodShort } from "@/utils/format";

/* Validated categorical order (blue, orange, aqua) - colour follows the entity, never its rank. */
export const SERIES = {
  residential: "#2a78d6",
  commercial: "#eb6834",
  industrial: "#1baf7a",
  s1: "#2a78d6",
  s2: "#eb6834",
  s3: "#1baf7a",
};
/* Reserved status colours: always shown with a text label. */
export const STATUS_COLORS: Record<string, string> = {
  paid: "#16A34A",
  pending: "#EA580C",
  partially_paid: "#eda100",
  overdue: "#DC2626",
  generated: "#2563EB",
};
const GRID = "#EEF2F6";
const AXIS = "#64748B";

export function ChartCard({ title, subtitle, children, table, height = 280, action }: {
  title: string; subtitle?: string; children: ReactNode; height?: number; action?: ReactNode;
  table?: { columns: { key: string; label: string; fmt?: (v: number) => string }[]; rows: Record<string, string | number>[] };
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <div className="card flex min-w-0 flex-col">
      <div className="flex items-start justify-between gap-2 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="text-[15px]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          {action}
          {table && (
            <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Chart or table view">
              <button aria-label="Chart view" onClick={() => setView("chart")} className={clsx("rounded-md p-1", view === "chart" ? "bg-slate-100 text-ink" : "text-ink-faint")}>
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
              <button aria-label="Table view" onClick={() => setView("table")} className={clsx("rounded-md p-1", view === "table" ? "bg-slate-100 text-ink" : "text-ink-faint")}>
                <Table2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="px-3 pb-3 pt-2" style={{ height }}>
        {view === "chart" || !table ? (
          children
        ) : (
          <div className="h-full overflow-auto px-2">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr>{table.columns.map((c) => <th key={c.key} className="py-1.5 pr-3 text-left font-semibold text-ink-muted">{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {table.columns.map((c) => (
                      <td key={c.key} className="py-1.5 pr-3 tabular-nums text-ink-soft">
                        {typeof r[c.key] === "number" && c.fmt ? c.fmt(r[c.key] as number) : String(r[c.key] ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TipBox({ active, payload, label, valueFmt, labelFmt }: TooltipProps<number, string> & { valueFmt: (v: number) => string; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-semibold text-ink">{labelFmt ? labelFmt(String(label)) : label}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums text-ink">{valueFmt(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

const axisProps = { tick: { fill: AXIS, fontSize: 11 }, axisLine: false, tickLine: false } as const;
const legendProps = { iconType: "circle" as const, iconSize: 8, wrapperStyle: { fontSize: 12, color: "#334155", paddingTop: 4 } };

export interface Series { key: string; name: string; color: string }

export function StackedBars({ data, xKey, series, valueFmt }: { data: object[]; xKey: string; series: Series[]; valueFmt: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={periodShort} />
        <YAxis {...axisProps} tickFormatter={compact} width={48} />
        <Tooltip cursor={{ fill: "rgba(37,99,235,0.06)" }} content={<TipBox valueFmt={valueFmt} labelFmt={periodShort} />} />
        {series.length > 1 && <Legend {...legendProps} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} stroke="#fff" strokeWidth={1}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupedBars({ data, xKey, series, valueFmt }: { data: object[]; xKey: string; series: Series[]; valueFmt: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={periodShort} />
        <YAxis {...axisProps} tickFormatter={compact} width={48} />
        <Tooltip cursor={{ fill: "rgba(37,99,235,0.06)" }} content={<TipBox valueFmt={valueFmt} labelFmt={periodShort} />} />
        {series.length > 1 && <Legend {...legendProps} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendArea({ data, xKey, dataKey, name, color = SERIES.s1, valueFmt }: { data: object[]; xKey: string; dataKey: string; name: string; color?: string; valueFmt: (v: number) => string }) {
  const id = `grad-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={periodShort} />
        <YAxis {...axisProps} tickFormatter={compact} width={48} />
        <Tooltip cursor={{ stroke: "#94A3B8", strokeDasharray: "3 3" }} content={<TipBox valueFmt={valueFmt} labelFmt={periodShort} />} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={`url(#${id})`}
          dot={{ r: 3, fill: color, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TrendLines({ data, xKey, series, valueFmt }: { data: object[]; xKey: string; series: Series[]; valueFmt: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={periodShort} />
        <YAxis {...axisProps} tickFormatter={compact} width={48} allowDecimals={false} />
        <Tooltip cursor={{ stroke: "#94A3B8", strokeDasharray: "3 3" }} content={<TipBox valueFmt={valueFmt} labelFmt={periodShort} />} />
        {series.length > 1 && <Legend {...legendProps} />}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2}
            dot={{ r: 3, fill: s.color, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, valueFmt, centerLabel, centerValue }: {
  data: { name: string; value: number; color: string }[]; valueFmt: (v: number) => string; centerLabel?: string; centerValue?: string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex h-full flex-col items-center gap-3 sm:flex-row">
      <div className="relative h-full min-h-[170px] w-full sm:w-1/2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={1.5} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip content={<TipBox valueFmt={valueFmt} />} />
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums text-ink">{centerValue}</span>
            <span className="text-[11px] text-ink-muted">{centerLabel}</span>
          </div>
        )}
      </div>
      <ul className="w-full space-y-2 sm:w-1/2">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-ink-soft">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
              {d.name}
            </span>
            <span className="tabular-nums text-ink">
              {valueFmt(d.value)} <span className="text-ink-faint">({total ? Math.round((d.value / total) * 100) : 0}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBars({ data, valueFmt, color = SERIES.s1 }: { data: { name: string; value: number }[]; valueFmt: (v: number) => string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" {...axisProps} tickFormatter={compact} />
        <YAxis type="category" dataKey="name" {...axisProps} width={72} />
        <Tooltip cursor={{ fill: "rgba(37,99,235,0.06)" }} content={<TipBox valueFmt={valueFmt} />} />
        <Bar dataKey="value" name="Readings" fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}
