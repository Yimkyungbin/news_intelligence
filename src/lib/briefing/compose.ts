// Daily Briefing 구성 (순수 모듈)
// 섹션 1~4, 6 은 AI 없이 집계한다. 섹션 5(AI 핵심 인사이트)만 AI 처리 허용 콘텐츠로 별도 생성.
import { rankContent, topKeywords } from "../content.ts";

export type BriefingItem = {
  id: string;
  title: string;
  summary: string | null;
  original_url: string;
  source_name: string;
  source_type: string;
  content_type: string;
  provenance: string;
  published_at: string | null;
  collected_at: string;
  keywords: string[];
  popularity: Record<string, number>;
  ai_processing_allowed: boolean;
  external_llm_allowed: boolean;
  topic_ids: string[];
  source: { slug?: string | null } | null;
};

export type BriefingTopic = { id: string; name: string };
export type BriefingLink = { influencer: string; company: string | null; title: string | null; url: string; date: string };

export type AIInsightSection =
  | { status: "generated"; headline: string; items: { title: string; detail: string; content_ids: string[] }[]; model: string; is_demo: boolean }
  | { status: "no_allowed_content" | "disabled" | "failed" | "limit"; reason: string };

export type BriefingContent = {
  version: 1;
  date: string; // KST YYYY-MM-DD
  window: { from: string; to: string };
  stats: { today: number; previous: number; delta: number; demo: number };
  trends: { keyword: string; count: number; previous: number; delta: number; is_new: boolean }[];
  new_content: { id: string; title: string; source_name: string; original_url: string; provenance: string; note: string | null }[];
  topic_updates: { id: string; name: string; count: number; previous: number; delta: number; top: { id: string; title: string } | null }[];
  influencer_content: BriefingLink[];
  ai_insights: AIInsightSection;
  changes: {
    total_delta: number;
    new_keywords: string[];
    rising: { keyword: string; delta: number }[];
    falling: { keyword: string; delta: number }[];
    topics_up: { name: string; delta: number }[];
  };
};

const at = (i: Pick<BriefingItem, "published_at" | "collected_at">) => i.published_at ?? i.collected_at;

/** KST 기준 날짜 문자열 (YYYY-MM-DD) */
export function kstDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * @param items 최근 48시간 콘텐츠 (현재·직전 24시간 비교용)
 * @param now 기준 시각
 */
export function composeBriefing(input: {
  now: Date;
  items: BriefingItem[];
  topics: BriefingTopic[];
  influencerLinks: BriefingLink[];
  aiInsights: AIInsightSection;
}): BriefingContent {
  const to = input.now.getTime();
  const from = to - 24 * 3600_000;
  const prevFrom = from - 24 * 3600_000;
  const inRange = (i: BriefingItem, a: number, b: number) => {
    const t = Date.parse(at(i));
    return t >= a && t < b;
  };
  const today = input.items.filter((i) => inRange(i, from, to + 1));
  const previous = input.items.filter((i) => inRange(i, prevFrom, from));

  // 1) 트렌드 TOP 5 (키워드 빈도, 전일 대비)
  const prevCounts = new Map(topKeywords(previous, 100).map((k) => [k.keyword, k.count]));
  const todayKw = topKeywords(today, 100);
  const trends = todayKw.slice(0, 5).map((k) => {
    const p = prevCounts.get(k.keyword) ?? 0;
    return { keyword: k.keyword, count: k.count, previous: p, delta: k.count - p, is_new: p === 0 };
  });

  // 2) 신규 콘텐츠 TOP 10 (출처 정규화 순위)
  const ranked = rankContent(today, 10);
  const new_content = ranked.items.map((i) => ({
    id: i.id,
    title: i.title,
    source_name: i.source_name,
    original_url: i.original_url,
    provenance: i.provenance,
    note: ranked.notes[i.id] ?? null,
  }));

  // 3) 관심 주제별 업데이트
  const topic_updates = input.topics
    .map((t) => {
      const cur = today.filter((i) => i.topic_ids.includes(t.id)).sort((a, b) => at(b).localeCompare(at(a)));
      const prev = previous.filter((i) => i.topic_ids.includes(t.id)).length;
      return { id: t.id, name: t.name, count: cur.length, previous: prev, delta: cur.length - prev, top: cur[0] ? { id: cur[0].id, title: cur[0].title } : null };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // 4) 주요 인플루언서 콘텐츠 (최근 24시간 등록·게시 링크)
  const influencer_content = input.influencerLinks
    .filter((l) => {
      const t = Date.parse(l.date);
      return t >= from && t <= to;
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  // 6) 전일 대비 변화
  const todayAll = new Map(todayKw.map((k) => [k.keyword, k.count]));
  const deltas = [...new Set([...todayAll.keys(), ...prevCounts.keys()])].map((k) => ({ keyword: k, delta: (todayAll.get(k) ?? 0) - (prevCounts.get(k) ?? 0) }));
  const changes = {
    total_delta: today.length - previous.length,
    new_keywords: todayKw.filter((k) => !prevCounts.has(k.keyword) && k.count >= 2).slice(0, 5).map((k) => k.keyword),
    rising: deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta || a.keyword.localeCompare(b.keyword)).slice(0, 5),
    falling: deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta || a.keyword.localeCompare(b.keyword)).slice(0, 5),
    topics_up: topic_updates.filter((t) => t.delta > 0).slice(0, 5).map((t) => ({ name: t.name, delta: t.delta })),
  };

  return {
    version: 1,
    date: kstDate(input.now),
    window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    stats: { today: today.length, previous: previous.length, delta: today.length - previous.length, demo: today.filter((i) => i.provenance === "demo").length },
    trends,
    new_content,
    topic_updates,
    influencer_content,
    ai_insights: input.aiInsights,
    changes,
  };
}

/** AI 인사이트 입력 후보: 최근 24시간 중 처리 허용 콘텐츠 (최신순) */
export function briefingAICandidates(items: BriefingItem[], now: Date): BriefingItem[] {
  const from = now.getTime() - 24 * 3600_000;
  return items.filter((i) => Date.parse(at(i)) >= from).sort((a, b) => at(b).localeCompare(at(a)));
}
