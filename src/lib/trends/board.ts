import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAIMeta, listContent } from "@/lib/queries";
import { rankContent, topKeywords } from "@/lib/content";
import { itemCategory, type CategorySlug } from "@/lib/categories";
import { kstDate, metricGrowth, primaryMetric, primaryScore, type Snapshot } from "@/lib/metrics";
import { daysAgoIso } from "@/lib/utils";
import type { ContentAIMeta, ContentItem } from "@/lib/types";
import { splitPeriods, trendDelta } from "./compute";
import { categoryBreakdown, keywordDailySeries, rankChanges, relatedCounts, type CategoryShare } from "./overview";

export type BoardPeriod = "daily" | "weekly";
export const BOARD_PERIODS: Record<BoardPeriod, { label: string; days: number; compare: string }> = {
  daily: { label: "Daily", days: 1, compare: "어제" },
  weekly: { label: "Weekly", days: 7, compare: "지난주" },
};

export type RankedEntry = {
  item: ContentItem;
  rank: number;
  change: number | "new" | null;
  position: { rank: number; total: number } | null;
  growth: { delta: number; since: string } | null;
  related: { count: number; keywords: string[] };
};

export type TrendBoard = {
  period: BoardPeriod;
  cat: CategorySlug | "";
  total: number;
  previousTotal: number;
  categories: CategoryShare[];
  rising: { keyword: string; count: number; delta: number; isNew: boolean; series: number[] }[];
  top: RankedEntry[];
  topRanked: boolean;
  meta: Map<string, ContentAIMeta>;
};

const isPaper = (i: Pick<ContentItem, "content_type">) => i.content_type === "paper";

/** 콘텐츠별 반응 지표 일별 기록 (최근 days+2일) */
async function loadSnapshots(ids: string[], days: number, now: number): Promise<Map<string, Snapshot[]>> {
  const out = new Map<string, Snapshot[]>();
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return out;
  const supabase = await createClient();
  for (let i = 0; i < wanted.length; i += 200) {
    const { data } = await supabase
      .from("content_metric_snapshots")
      .select("content_id,captured_on,score")
      .in("content_id", wanted.slice(i, i + 200))
      .gte("captured_on", kstDate(new Date(now), -(days + 2)));
    for (const s of (data ?? []) as Snapshot[]) out.set(s.content_id, [...(out.get(s.content_id) ?? []), s]);
  }
  return out;
}

type Ranked = ReturnType<typeof rankContent<ContentItem>>;

function toEntries(
  list: Ranked,
  opts: { changes?: Record<string, number | "new">; snaps: Map<string, Snapshot[]>; days: number; today: string; related: Record<string, { count: number; keywords: string[] }> },
): RankedEntry[] {
  return list.items.map((item, idx) => ({
    item,
    rank: idx + 1,
    change: opts.changes ? (opts.changes[item.id] ?? null) : null,
    position: list.positions[item.id] ?? null,
    growth: metricGrowth(primaryScore(item.popularity), opts.snaps.get(item.id) ?? [], opts.days, opts.today),
    related: opts.related[item.id] ?? { count: 0, keywords: [] },
  }));
}

/**
 * 메인 트렌드 보드
 * - 순위: 출처 내 순위 정규화(rankContent). 논문은 Papers 메뉴로 분리
 * - 순위 변동: 하루 전 시점의 같은 길이 기간 순위와 비교 (그 시점 지표 기록이 있으면 그 값 사용)
 * - 증가량: content_metric_snapshots 일별 기록 기준
 */
export async function loadTrendBoard(userId: string, period: BoardPeriod, cat: CategorySlug | ""): Promise<TrendBoard> {
  const days = BOARD_PERIODS[period].days;
  const now = Date.now();
  // 현재 + 직전 기간 + 하루 이동 기간 + 키워드 7일 추이
  const loadDays = Math.max(days * 2 + 1, 8);
  const all = await listContent(userId, { sinceIso: daysAgoIso(loadDays), limit: 1500 });
  const { current, previous } = splitPeriods(all, days, now);
  const inCat = (i: ContentItem) => !cat || itemCategory(i) === cat;

  // 하루 전 시점 기간 (순위 변동 기준)
  const t = (i: ContentItem) => Date.parse(i.published_at ?? i.collected_at);
  const shifted = all.filter((i) => t(i) >= now - (days + 1) * 86400000 && t(i) < now - 86400000 && !isPaper(i) && inCat(i));

  const top = rankContent(current.filter((i) => !isPaper(i) && inCat(i)), 10);
  const today = kstDate(new Date(now));
  const snaps = await loadSnapshots([...top.items, ...shifted].map((i) => i.id), days, now);

  // 하루 전 순위: 어제까지의 기록이 있으면 그 점수로 대체
  const yesterday = kstDate(new Date(now), -1);
  const shiftedScored = shifted.map((i) => {
    const past = (snaps.get(i.id) ?? []).filter((s) => s.captured_on <= yesterday).sort((a, b) => b.captured_on.localeCompare(a.captured_on))[0];
    return past && primaryScore(i.popularity) !== null ? { ...i, popularity: { ...i.popularity, ...scoreOverride(i.popularity, past.score) } } : i;
  });
  const prevTop = rankContent(shiftedScored, 50).items.map((i) => i.id);
  const changes = top.ranked ? rankChanges(top.items.map((i) => i.id), prevTop) : {};

  // 급상승 키워드 + 7일 추이
  const delta = trendDelta(current, previous);
  const newSet = new Set(delta.new_keywords.map((k) => k.keyword));
  const risingBase = [
    ...delta.rising.map((k) => ({ ...k, isNew: newSet.has(k.keyword) })),
    ...delta.new_keywords.filter((k) => !delta.rising.some((r) => r.keyword === k.keyword)).map((k) => ({ ...k, delta: k.count, isNew: true })),
  ].slice(0, 8);
  const series = keywordDailySeries(all, risingBase.map((k) => k.keyword), 7, now);

  return {
    period,
    cat,
    total: current.length,
    previousTotal: previous.length,
    categories: categoryBreakdown(current, previous),
    rising: risingBase.map((k) => ({ ...k, series: series.get(k.keyword) ?? [] })),
    top: toEntries(top, { changes, snaps, days, today, related: relatedCounts(top.items, current) }),
    topRanked: top.ranked,
    meta: await getAIMeta(top.items.map((i) => i.original_url)),
  };
}

/* ---------- Papers 메뉴 ---------- */

/** 논문 출처 (Settings 의 data_sources.slug) */
export const PAPER_SOURCES = [
  { slug: "hf-papers", label: "HF Daily Papers", metric: "추천 수" },
  { slug: "openalex-ai", label: "OpenAlex", metric: "인용 수" },
  { slug: "arxiv", label: "arXiv AI·NLP·ML", metric: null },
  { slug: "arxiv-systems", label: "arXiv 시스템·보안·SE", metric: null },
  { slug: "arxiv-vision", label: "arXiv 비전·로보틱스", metric: null },
] as const;
export type PaperSourceSlug = (typeof PAPER_SOURCES)[number]["slug"];
export const PAPER_PERIODS = { daily: { label: "Daily", days: 1 }, weekly: { label: "Weekly", days: 7 }, monthly: { label: "Monthly", days: 30 } } as const;
export type PaperPeriod = keyof typeof PAPER_PERIODS;

export type PaperBoard = {
  total: number;
  bySource: { slug: string; label: string; count: number }[];
  keywords: { keyword: string; count: number }[];
  entries: RankedEntry[];
  ranked: boolean;
  meta: Map<string, ContentAIMeta>;
};

/** 논문 목록: 추천(HF)·인용(OpenAlex)은 출처 안 순위로 비교, 지표 없는 arXiv 는 최신순으로 뒤에 */
export async function loadPaperBoard(
  userId: string,
  opts: { period: PaperPeriod; source: PaperSourceSlug | ""; sort: "popular" | "latest"; limit: number },
): Promise<PaperBoard> {
  const days = PAPER_PERIODS[opts.period].days;
  const now = Date.now();
  const all = (await listContent(userId, { sinceIso: daysAgoIso(days), limit: 1000, contentType: "paper" })).filter(isPaper);
  const slugOf = (i: ContentItem) => i.source?.slug ?? "";
  const pool = opts.source ? all.filter((i) => slugOf(i) === opts.source) : all;
  const list: Ranked =
    opts.sort === "popular"
      ? rankContent(pool, opts.limit)
      : { items: pool.slice(0, opts.limit), ranked: false, notes: {}, positions: {} };
  const snaps = await loadSnapshots(list.items.map((i) => i.id), days, now);
  const counts = new Map<string, number>();
  for (const i of all) counts.set(slugOf(i), (counts.get(slugOf(i)) ?? 0) + 1);
  return {
    total: all.length,
    bySource: PAPER_SOURCES.map((s) => ({ slug: s.slug, label: s.label, count: counts.get(s.slug) ?? 0 })),
    keywords: topKeywords(pool, 15),
    entries: toEntries(list, { snaps, days, today: kstDate(new Date(now)), related: relatedCounts(list.items, pool) }),
    ranked: list.ranked,
    meta: await getAIMeta(list.items.map((i) => i.original_url)),
  };
}

/** 대표 지표 키에만 과거 점수를 덮어씀 */
function scoreOverride(p: Record<string, number>, score: number): Record<string, number> {
  const key = primaryMetric(p)?.key;
  return key ? { [key]: score } : {};
}
