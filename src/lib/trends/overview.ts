// 메인 트렌드 한눈에 보기 계산 (순수 모듈): 카테고리 비중, 순위 변동, 관련 기사 수, 키워드 추이
import { CATEGORIES, itemCategory, type CategorizeInput, type CategorySlug } from "../categories.ts";
import { normalizeKeywords } from "../keywords.ts";

type Item = CategorizeInput & {
  id: string;
  category?: string | null;
  source?: { slug?: string | null } | null;
  keywords: string[];
  published_at: string | null;
  collected_at: string;
};

export type CategoryShare = {
  slug: CategorySlug;
  label: string;
  color: string;
  count: number;
  share: number;
  prevCount: number;
  prevShare: number;
  /** 비중 변화 (%p) */
  deltaPp: number;
};

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

/** 현재·직전 기간 카테고리 비중 (CATEGORIES 순서, 0건 카테고리 포함) */
export function categoryBreakdown(current: Item[], previous: Item[]): CategoryShare[] {
  const count = (items: Item[]) => {
    const m = new Map<CategorySlug, number>();
    for (const i of items) {
      const c = itemCategory(i);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  };
  const cur = count(current);
  const prev = count(previous);
  return CATEGORIES.map((c) => {
    const n = cur.get(c.slug) ?? 0;
    const p = prev.get(c.slug) ?? 0;
    const share = pct(n, current.length);
    const prevShare = pct(p, previous.length);
    return { slug: c.slug, label: c.label, color: c.color, count: n, share, prevCount: p, prevShare, deltaPp: Math.round((share - prevShare) * 10) / 10 };
  });
}

/** 순위 변동: 양수 = 상승. 직전 순위에 없으면 "new" */
export function rankChanges(currentIds: string[], previousIds: string[]): Record<string, number | "new"> {
  const prev = new Map(previousIds.map((id, i) => [id, i + 1]));
  const out: Record<string, number | "new"> = {};
  currentIds.forEach((id, i) => {
    const p = prev.get(id);
    out[id] = p === undefined ? "new" : p - (i + 1);
  });
  return out;
}

/** 관련 기사 판단에서 제외하는 범용 키워드 (거의 모든 콘텐츠에 붙음) */
const GENERIC = new Set(["ai", "llm", "llms", "machine learning", "machinelearning", "artificial intelligence", "generative ai", "genai", "deep learning", "ml", "news", "tech"]);

const specificKeywords = (i: Pick<Item, "keywords">) => normalizeKeywords(i.keywords, 20).filter((k) => !GENERIC.has(k));

/** 같은 기간에서 구체 키워드가 겹치는 다른 콘텐츠 수 (1개 이상 겹치고 같은 카테고리, 또는 2개 이상 겹침) */
export function relatedCounts(targets: Item[], pool: Item[]): Record<string, { count: number; keywords: string[] }> {
  const poolKw = pool.map((p) => ({ id: p.id, cat: itemCategory(p), kw: new Set(specificKeywords(p)) }));
  const out: Record<string, { count: number; keywords: string[] }> = {};
  for (const t of targets) {
    const kws = specificKeywords(t);
    const cat = itemCategory(t);
    const shared = new Map<string, number>();
    let n = 0;
    for (const p of poolKw) {
      if (p.id === t.id) continue;
      const overlap = kws.filter((k) => p.kw.has(k));
      if (overlap.length >= 2 || (overlap.length === 1 && p.cat === cat)) {
        n++;
        for (const k of overlap) shared.set(k, (shared.get(k) ?? 0) + 1);
      }
    }
    out[t.id] = { count: n, keywords: [...shared.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([k]) => k) };
  }
  return out;
}

const KST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

/** 키워드별 최근 N일(KST) 일별 등장 수 (오래된 날 → 오늘) */
export function keywordDailySeries(items: Pick<Item, "keywords" | "published_at" | "collected_at">[], keywords: string[], days: number, now = Date.now()) {
  const dates = Array.from({ length: days }, (_, i) => KST_DAY.format(new Date(now - (days - 1 - i) * 86400000)));
  const index = new Map(dates.map((d, i) => [d, i]));
  const out = new Map(keywords.map((k) => [k, new Array<number>(days).fill(0)]));
  for (const it of items) {
    const slot = index.get(KST_DAY.format(new Date(it.published_at ?? it.collected_at)));
    if (slot === undefined) continue;
    for (const k of new Set(normalizeKeywords(it.keywords, 20))) {
      const series = out.get(k);
      if (series) series[slot] += 1;
    }
  }
  return out;
}

/** 함께 등장한 키워드: 조건 콘텐츠에서 자주 같이 나온 구체 키워드 (선택 키워드·범용 키워드 제외) */
export function coKeywords(items: Pick<Item, "keywords">[], exclude: string[], limit = 10) {
  const skip = new Set(exclude);
  const counts = new Map<string, number>();
  for (const i of items) for (const k of new Set(specificKeywords(i))) if (!skip.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

/** 출처 분포 (상위 N개 + 나머지 '기타') */
export function sourceShares(items: { source_name: string }[], limit = 5) {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.source_name, (counts.get(i.source_name) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, limit).map(([name, count]) => ({ name, count, share: pct(count, items.length) }));
  const rest = sorted.slice(limit).reduce((n, [, c]) => n + c, 0);
  return rest ? [...top, { name: "기타", count: rest, share: pct(rest, items.length) }] : top;
}
