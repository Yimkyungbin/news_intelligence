import Link from "next/link";
import type { CategoryShare } from "@/lib/trends/overview";
import { cn } from "@/lib/utils";

/** 카테고리 비중 막대: 위 = 현재 기간, 아래 = 직전 기간. 조각을 누르면 해당 카테고리 모아보기 */
export function CategoryShareBars({ shares, period, compareLabel }: { shares: CategoryShare[]; period: string; compareLabel: string }) {
  const visible = shares.filter((s) => s.count > 0 || s.prevCount > 0);
  const total = shares.reduce((n, s) => n + s.count, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">이 기간 콘텐츠가 없습니다.</p>;
  const href = (slug: string) => `/trending?view=category&cat=${slug}&period=${period}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1" role="img" aria-label={`카테고리 비중: ${visible.map((s) => `${s.label} ${s.share}%`).join(", ")}`}>
        <div className="flex h-7 overflow-hidden rounded-md">
          {visible
            .filter((s) => s.share > 0)
            .map((s) => (
              <Link
                key={s.slug}
                href={href(s.slug)}
                className="flex min-w-0 items-center justify-center text-[11px] font-medium text-white transition-opacity hover:opacity-85"
                style={{ width: `${s.share}%`, backgroundColor: s.color }}
                title={`${s.label} ${s.count}건 (${s.share}%)`}
              >
                <span className="truncate px-1">{s.share >= 9 ? `${s.label} ${Math.round(s.share)}%` : ""}</span>
              </Link>
            ))}
        </div>
        <div className="flex h-2 overflow-hidden rounded-sm opacity-45" title={`${compareLabel} 비중`}>
          {visible
            .filter((s) => s.prevShare > 0)
            .map((s) => (
              <span key={s.slug} style={{ width: `${s.prevShare}%`, backgroundColor: s.color }} />
            ))}
        </div>
        <p className="text-[10px] text-muted-foreground">위: 현재 기간 · 아래: {compareLabel} 같은 기간</p>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4" aria-label="카테고리별 건수">
        {shares.map((s) => (
          <li key={s.slug}>
            <Link href={href(s.slug)} className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span className="truncate">{s.label}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">{s.count}</span>
              {Math.round(s.deltaPp) !== 0 ? (
                <span className={cn("tabular-nums text-[10px]", s.deltaPp > 0 ? "text-success" : "text-destructive")} title={`비중 ${compareLabel} 대비 ${s.deltaPp > 0 ? "+" : ""}${s.deltaPp}%p`}>
                  {s.deltaPp > 0 ? "▲" : "▼"}
                  {Math.abs(Math.round(s.deltaPp))}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 7일 추이 스파크라인 (SVG) */
function Sparkline({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return null;
  const max = Math.max(1, ...series);
  const w = 72;
  const h = 24;
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** 급상승 키워드 카드 */
export function RisingKeywords({
  items,
  period,
  compareLabel,
}: {
  items: { keyword: string; count: number; delta: number; isNew: boolean; series: number[] }[];
  period: string;
  compareLabel: string;
}) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">{compareLabel} 대비 늘어난 키워드가 없습니다.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="급상승 키워드">
      {items.map((k) => {
        const prev = k.count - k.delta;
        const rate = prev > 0 ? Math.round((k.delta / prev) * 100) : null;
        return (
          <li key={k.keyword}>
            <Link href={`/trending?period=${period}&limit=50&kw=${encodeURIComponent(k.keyword)}`} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 hover:border-primary/40">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">#{k.keyword}</span>
                <span className={cn("text-[11px] tabular-nums", k.isNew ? "text-primary" : "text-success")}>
                  {k.isNew || rate === null ? "NEW" : `▲ ${rate}%`} · {k.count}건
                </span>
              </span>
              <Sparkline series={k.series} color={k.isNew ? "#3B7BF0" : "#16A34A"} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 카테고리별 가로 막대 표 (대시보드 확대 보기)
 * 굵은 막대 = 현재 기간 건수, 아래 얇은 막대 = 직전 같은 기간 건수. 행을 누르면 카테고리 모아보기
 */
export function CategoryBarTable({ shares, period, compareLabel }: { shares: CategoryShare[]; period: string; compareLabel: string }) {
  const max = Math.max(1, ...shares.map((s) => Math.max(s.count, s.prevCount)));
  const total = shares.reduce((n, s) => n + s.count, 0);
  const sorted = [...shares].sort((a, b) => b.count - a.count || b.prevCount - a.prevCount);
  return (
    <div className="flex flex-col gap-3">
      {total > 0 ? (
        <div className="flex h-10 overflow-hidden rounded-lg" role="img" aria-label={`카테고리 비중: ${sorted.filter((s) => s.count).map((s) => `${s.label} ${s.share}%`).join(", ")}`}>
          {sorted
            .filter((s) => s.share > 0)
            .map((s) => (
              <Link
                key={s.slug}
                href={`/trending?view=category&cat=${s.slug}&period=${period}`}
                className="flex min-w-0 items-center justify-center text-xs font-semibold text-white hover:opacity-85"
                style={{ width: `${s.share}%`, backgroundColor: s.color }}
                title={`${s.label} ${s.count}건 (${s.share}%)`}
              >
                <span className="truncate px-1">{s.share >= 7 ? `${s.label} ${Math.round(s.share)}%` : ""}</span>
              </Link>
            ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">이 기간 콘텐츠가 없습니다.</p>
      )}
      <table className="w-full text-sm" aria-label="카테고리별 건수">
        <thead className="sr-only">
          <tr>
            <th>카테고리</th>
            <th>건수 막대</th>
            <th>건수</th>
            <th>비중</th>
            <th>{compareLabel} 대비</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const d = Math.round(s.deltaPp);
            return (
              <tr key={s.slug} className="group">
                <td className="w-32 py-1 pr-2 align-middle">
                  <Link href={`/trending?view=category&cat=${s.slug}&period=${period}`} className="flex items-center gap-1.5 font-medium group-hover:text-primary">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                    <span className="truncate">{s.label}</span>
                  </Link>
                </td>
                <td className="py-1 pr-3 align-middle">
                  <div className="flex flex-col gap-0.5">
                    <div className="h-4 rounded-sm bg-muted">
                      <div className="h-4 rounded-sm transition-all" style={{ width: `${(s.count / max) * 100}%`, backgroundColor: s.color }} />
                    </div>
                    <div className="h-1.5 rounded-sm">
                      <div className="h-1.5 rounded-sm opacity-40" style={{ width: `${(s.prevCount / max) * 100}%`, backgroundColor: s.color }} title={`${compareLabel} ${s.prevCount}건`} />
                    </div>
                  </div>
                </td>
                <td className="w-12 py-1 text-right align-middle font-semibold tabular-nums">{s.count}</td>
                <td className="w-14 py-1 text-right align-middle text-xs tabular-nums text-muted-foreground">{s.share}%</td>
                <td className={cn("w-14 py-1 text-right align-middle text-xs tabular-nums", d > 0 ? "text-success" : d < 0 ? "text-destructive" : "text-muted-foreground")}>
                  {d === 0 ? "–" : `${d > 0 ? "▲" : "▼"}${Math.abs(d)}%p`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-muted-foreground">굵은 막대: 현재 기간 · 옅은 막대: {compareLabel} 같은 기간 · 행을 누르면 카테고리 모아보기</p>
    </div>
  );
}

/** 급상승 키워드 행 목록 (대시보드 오른쪽) */
export function RisingKeywordRows({
  items,
  period,
  compareLabel,
}: {
  items: { keyword: string; count: number; delta: number; isNew: boolean; series: number[] }[];
  period: string;
  compareLabel: string;
}) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">{compareLabel} 대비 늘어난 키워드가 없습니다.</p>;
  return (
    <ol className="flex flex-col divide-y" aria-label="급상승 키워드">
      {items.map((k, i) => {
        const prev = k.count - k.delta;
        const rate = prev > 0 ? Math.round((k.delta / prev) * 100) : null;
        return (
          <li key={k.keyword}>
            <Link href={`/trending?period=${period}&limit=50&kw=${encodeURIComponent(k.keyword)}`} className="flex items-center gap-3 py-2.5 hover:bg-accent/50">
              <span className="w-5 text-right text-sm font-bold tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">#{k.keyword}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {k.count}건 · {compareLabel} {prev}건
                </span>
              </span>
              <Sparkline series={k.series} color={k.isNew ? "#3B7BF0" : "#16A34A"} />
              <span className={cn("w-14 text-right text-xs font-semibold tabular-nums", k.isNew || rate === null ? "text-primary" : "text-success")}>
                {k.isNew || rate === null ? "NEW" : `▲${rate}%`}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
