"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface MonthPoint { month: string; amount: number }

/**
 * Monthly income area chart (pink line over a pink-to-violet fade). Colours come from CSS variables
 * so the chart follows light/dark mode. A visually-hidden table carries the same data for screen readers.
 */
export function EarningsChart({ data, currency }: { data: MonthPoint[]; currency: string }) {
  const fmt = (n: number) => new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(n);
  return (
    <div>
      <div className="h-64 w-full sm:h-72" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--violet)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--brand-600)" />
                <stop offset="100%" stopColor="var(--violet)" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 13 }} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmt(v)} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <Tooltip
              cursor={{ stroke: "var(--brand-300)", strokeDasharray: "4 4" }}
              formatter={(v) => [fmt(Number(v)), "Income"]}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, color: "var(--foreground)" }}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="url(#line)"
              strokeWidth={3}
              fill="url(#area)"
              dot={{ r: 4, strokeWidth: 2, stroke: "var(--brand-600)", fill: "var(--card)" }}
              activeDot={{ r: 6, fill: "var(--brand-500)" }}
              isAnimationActive
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Income per month</caption>
        <thead><tr><th>Month</th><th>Income</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.month}><td>{d.month}</td><td>{fmt(d.amount)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
