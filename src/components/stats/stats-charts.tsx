"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#2563EB", "#DB2777", "#059669", "#D97706", "#7C3AED", "#0891B2", "#DC2626", "#4F46E5"];
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};
const short = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

/** 일별 콘텐츠 수. 막대를 누르면 그날 상세로 이동 */
export function DailyTotalChart({ data, range }: { data: { date: string; total: number }[]; range: string }) {
  const router = useRouter();
  return (
    <div className="h-56 w-full" role="img" aria-label={`일별 콘텐츠 수: ${data.filter((d) => d.total).map((d) => `${d.date} ${d.total}건`).join(", ") || "데이터 없음"}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
          onClick={(e) => {
            const date = (e as { activeLabel?: string } | null)?.activeLabel;
            if (date) router.push(`/statistics?range=${range}&date=${date}`, { scroll: false });
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={short} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" minTickGap={12} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
          <Tooltip cursor={{ fill: "var(--accent)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v}건`, "콘텐츠"]} />
          <Bar dataKey="total" fill="var(--primary)" radius={[3, 3, 0, 0]} className="cursor-pointer" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 키워드별 일별 추이 */
export function KeywordTrendChart({ data, keywords }: { data: Record<string, string | number>[]; keywords: string[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label={`키워드 추이: ${keywords.join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={(d) => short(String(d))} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" minTickGap={12} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {keywords.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} name={`#${k}`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
