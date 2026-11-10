// 일자별 통계 집계 (순수 모듈) — 요구사항 3
// 원문은 저장하지 않고 건수·키워드·인기 콘텐츠(제목·링크·출처)만 남긴다.
import { rankContent, topKeywords } from "../content.ts";
import { kstDate } from "../briefing/compose.ts";

export type StatItem = {
  id: string;
  title: string;
  original_url: string;
  source_name: string;
  source_id: string | null;
  published_at: string | null;
  collected_at: string;
  language: string;
  content_type: string;
  keywords: string[];
  popularity: Record<string, number>;
  provenance: string;
  topic_ids: string[];
  source: { slug?: string | null } | null;
};

export type DailyStatsData = {
  version: 1;
  total: number;
  demo: number;
  by_source: { key: string; name: string; count: number }[];
  by_topic: { id: string; name: string; count: number }[];
  by_language: Record<string, number>;
  by_type: Record<string, number>;
  keywords: { keyword: string; count: number }[];
  top_items: { title: string; url: string; source_name: string; note: string | null }[];
};

/** 통계 기준 날짜: 게시일(없으면 수집일)의 KST 날짜 */
export function statDate(i: Pick<StatItem, "published_at" | "collected_at">): string {
  return kstDate(new Date(i.published_at ?? i.collected_at));
}

function countBy<T>(items: T[], key: (i: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

export function computeDailyStats(items: StatItem[], topics: { id: string; name: string }[]): DailyStatsData {
  const sourceMap = new Map<string, { key: string; name: string; count: number }>();
  for (const i of items) {
    const key = i.source?.slug ?? i.source_name;
    const cur = sourceMap.get(key) ?? { key, name: i.source_name, count: 0 };
    cur.count++;
    sourceMap.set(key, cur);
  }
  const ranked = rankContent(items, 10);
  return {
    version: 1,
    total: items.length,
    demo: items.filter((i) => i.provenance === "demo").length,
    by_source: [...sourceMap.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    by_topic: topics
      .map((t) => ({ id: t.id, name: t.name, count: items.filter((i) => i.topic_ids.includes(t.id)).length }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    by_language: countBy(items, (i) => i.language),
    by_type: countBy(items, (i) => i.content_type),
    keywords: topKeywords(items, 30),
    top_items: ranked.items.map((i) => ({ title: i.title, url: i.original_url, source_name: i.source_name, note: ranked.notes[i.id] ?? null })),
  };
}

/** 항목을 KST 날짜별로 묶음 (대상 날짜 목록에 포함된 것만) */
export function groupByStatDate(items: StatItem[], dates: string[]): Map<string, StatItem[]> {
  const set = new Set(dates);
  const out = new Map<string, StatItem[]>(dates.map((d) => [d, []]));
  for (const i of items) {
    const d = statDate(i);
    if (set.has(d)) out.get(d)!.push(i);
  }
  return out;
}

/** 오늘(KST) 포함 최근 n일 날짜 목록 (오래된 순) */
export function recentKstDates(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => kstDate(new Date(now.getTime() - (n - 1 - i) * 86400000)));
}

/* ---------- 기간 통계 (화면용) ---------- */
export type StatRow = { stat_date: string; data: DailyStatsData };

/** 기간 합계: 출처·주제·키워드 */
export function summarizeRange(rows: StatRow[]) {
  const sources = new Map<string, { key: string; name: string; count: number }>();
  const topics = new Map<string, { id: string; name: string; count: number }>();
  const keywords = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    total += r.data.total;
    for (const s of r.data.by_source) {
      const cur = sources.get(s.key) ?? { ...s, count: 0 };
      cur.count += s.count;
      sources.set(s.key, cur);
    }
    for (const t of r.data.by_topic) {
      const cur = topics.get(t.id) ?? { ...t, count: 0 };
      cur.count += t.count;
      topics.set(t.id, cur);
    }
    for (const k of r.data.keywords) keywords.set(k.keyword, (keywords.get(k.keyword) ?? 0) + k.count);
  }
  const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
  return {
    total,
    days: rows.length,
    sources: [...sources.values()].sort(byCount),
    topics: [...topics.values()].sort(byCount),
    keywords: [...keywords.entries()].map(([keyword, count]) => ({ keyword, count })).sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword)),
  };
}

/** 키워드별 일별 추이 (차트용). 날짜 목록 기준으로 빈 날은 0 */
export function keywordSeries(rows: StatRow[], dates: string[], keywords: string[]) {
  const byDate = new Map(rows.map((r) => [r.stat_date, r.data]));
  return dates.map((d) => {
    const data = byDate.get(d);
    const point: Record<string, string | number> = { date: d };
    for (const k of keywords) point[k] = data?.keywords.find((x) => x.keyword === k)?.count ?? 0;
    return point;
  });
}
