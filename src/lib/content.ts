import type { ContentItem } from "@/lib/types";

/** 출처가 실제로 제공한 지표만 표시용 라벨로 변환 */
const METRIC_LABELS: Record<string, string> = {
  points: "points",
  comments: "댓글",
  stars: "stars",
  upvotes: "upvotes",
  likes: "likes",
  downloads: "downloads",
};

export function popularityEntries(p: Record<string, unknown> | null | undefined) {
  if (!p) return [];
  return Object.entries(p)
    .filter(([k, v]) => k in METRIC_LABELS && typeof v === "number" && v > 0)
    .map(([k, v]) => ({ key: k, label: METRIC_LABELS[k], value: v as number }));
}

/** 근거 있는 단일 인기 점수: 출처 제공 지표의 대표값 (없으면 null) */
export function popularityScore(item: Pick<ContentItem, "popularity">): number | null {
  const p = item.popularity ?? {};
  for (const k of ["points", "upvotes", "stars", "likes", "downloads"]) {
    const v = p[k];
    if (typeof v === "number" && v > 0) return v;
  }
  return null;
}

/**
 * 인기 지표가 있는 항목을 우선(지표 내림차순), 없는 항목은 게시일 최신순.
 * 반환값의 ranked 플래그로 "인기순" 표기 여부를 판단한다.
 */
export function rankContent(items: ContentItem[], limit: number) {
  const scored = items.map((i) => ({ i, s: popularityScore(i) }));
  scored.sort((a, b) => {
    if (a.s !== null && b.s !== null) return b.s - a.s;
    if (a.s !== null) return -1;
    if (b.s !== null) return 1;
    return (b.i.published_at ?? b.i.collected_at).localeCompare(a.i.published_at ?? a.i.collected_at);
  });
  const ranked = scored.some((x) => x.s !== null);
  return { items: scored.slice(0, limit).map((x) => x.i), ranked };
}

/** 키워드 빈도 집계 (Today's Intelligence) */
export function topKeywords(items: Pick<ContentItem, "keywords">[], limit = 8) {
  const counts = new Map<string, number>();
  for (const it of items) for (const k of it.keywords ?? []) counts.set(k.toLowerCase(), (counts.get(k.toLowerCase()) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([keyword, count]) => ({ keyword, count }));
}

/** 최근 N일 KST 일자별 수집 건수 */
export function dailyBuckets(items: Pick<ContentItem, "collected_at">[], days: number) {
  const fmt = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
  const now = Date.now();
  const buckets = Array.from({ length: days }, (_, i) => ({ day: fmt.format(new Date(now - (days - 1 - i) * 86400000)), count: 0 }));
  for (const it of items) {
    const slot = buckets.find((b) => b.day === fmt.format(new Date(it.collected_at)));
    if (slot) slot.count += 1;
  }
  return buckets;
}
