// Trending 트렌드 시사점: 직전 동일 기간 대비 변화 (순수 모듈) — 요구사항 4.3
import { topKeywords } from "../content.ts";

type Item = {
  keywords: string[];
  published_at: string | null;
  collected_at: string;
  topic_links?: { topic: { id: string; name: string } | null }[];
};

export type TrendDelta = {
  current: number;
  previous: number;
  rising: { keyword: string; count: number; delta: number }[];
  new_keywords: { keyword: string; count: number }[];
  topics: { id: string; name: string; count: number; delta: number }[];
};

/** items 를 기준 시각으로 현재 기간 / 직전 기간으로 나눔 */
export function splitPeriods<T extends Item>(items: T[], days: number, now = Date.now()) {
  const from = now - days * 86400000;
  const prevFrom = from - days * 86400000;
  const t = (i: Item) => Date.parse(i.published_at ?? i.collected_at);
  return {
    current: items.filter((i) => t(i) >= from),
    previous: items.filter((i) => t(i) >= prevFrom && t(i) < from),
  };
}

function topicCounts(items: Item[]) {
  const m = new Map<string, { id: string; name: string; count: number }>();
  for (const i of items)
    for (const l of i.topic_links ?? []) {
      if (!l.topic) continue;
      const cur = m.get(l.topic.id) ?? { ...l.topic, count: 0 };
      cur.count++;
      m.set(l.topic.id, cur);
    }
  return m;
}

export function trendDelta(current: Item[], previous: Item[]): TrendDelta {
  const prev = new Map(topKeywords(previous, 200).map((k) => [k.keyword, k.count]));
  const cur = topKeywords(current, 200);
  const rising = cur
    .map((k) => ({ ...k, delta: k.count - (prev.get(k.keyword) ?? 0) }))
    .filter((k) => k.delta > 0 && k.count >= 2)
    .sort((a, b) => b.delta - a.delta || b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, 8);
  const new_keywords = cur.filter((k) => !prev.has(k.keyword) && k.count >= 2).slice(0, 8);
  const pt = topicCounts(previous);
  const topics = [...topicCounts(current).values()]
    .map((t) => ({ ...t, delta: t.count - (pt.get(t.id)?.count ?? 0) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);
  return { current: current.length, previous: previous.length, rising, new_keywords, topics };
}
