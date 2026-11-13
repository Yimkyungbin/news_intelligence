// Trending 조건 파싱 (순수 모듈): 페이지와 AI 시사점 생성이 같은 조건을 쓰도록 공유
import { normalizeKeyword } from "../keywords.ts";
import { categoryDef, isCategorySlug, type CategorySlug } from "../categories.ts";

export const PERIODS = { daily: { label: "Daily", days: 1 }, weekly: { label: "Weekly", days: 7 }, monthly: { label: "Monthly", days: 30 } } as const;
export const LIMITS = [10, 20, 50] as const;
export const TYPES = { "": "전체 유형", article: "아티클", post: "게시글", paper: "논문", repository: "저장소", model: "모델", discussion: "토론" } as const;
export const LANGS = { "": "전체 언어", ko: "한국어", en: "영어" } as const;
export const SORTS = { popular: "인기순", latest: "게시일순" } as const;

export type TrendParams = {
  period: keyof typeof PERIODS;
  limit: number;
  type: keyof typeof TYPES;
  lang: keyof typeof LANGS;
  sort: keyof typeof SORTS;
  topic: string;
  kw: string;
  /** 카테고리 (빈 문자열 = 전체) */
  cat: CategorySlug | "";
};

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 신뢰할 수 없는 입력(searchParams, Server Action 인자)을 허용 값으로 정규화 */
export function parseTrendParams(raw: Record<string, unknown>, topicIds?: string[]): TrendParams {
  const topicRaw = typeof raw.topic === "string" && UUID.test(raw.topic) ? raw.topic : "";
  return {
    period: pick(raw.period, Object.keys(PERIODS) as (keyof typeof PERIODS)[], "weekly"),
    limit: Number(pick(String(raw.limit ?? ""), LIMITS.map(String), "10")),
    type: pick(raw.type, Object.keys(TYPES) as (keyof typeof TYPES)[], ""),
    lang: pick(raw.lang, Object.keys(LANGS) as (keyof typeof LANGS)[], ""),
    sort: pick(raw.sort, Object.keys(SORTS) as (keyof typeof SORTS)[], "popular"),
    topic: topicIds ? (topicIds.includes(topicRaw) ? topicRaw : "") : topicRaw,
    kw: typeof raw.kw === "string" ? (normalizeKeyword(raw.kw.slice(0, 60)) ?? "") : "",
    cat: isCategorySlug(raw.cat) ? raw.cat : "",
  };
}

/**
 * 조건이 걸린 분석인지 (키워드·주제·카테고리·유형·언어 중 하나라도 지정)
 * 조건이 없으면 전체 흐름 = Dashboard·Daily Briefing 과 같은 범위이므로 Trending 은 요약을 반복하지 않고 AI 도 새로 호출하지 않는다.
 */
export function isFocused(p: TrendParams): boolean {
  return Boolean(p.kw || p.topic || p.cat || p.type || p.lang);
}

/** AI 시사점 캐시 키: 결과에 영향을 주는 조건만 (정렬·개수 제외). 카테고리 미지정 시 기존 키와 동일 */
export function trendCacheKey(p: TrendParams): string {
  const base = { period: p.period, type: p.type, lang: p.lang, topic: p.topic, kw: p.kw };
  return JSON.stringify(p.cat ? { ...base, cat: p.cat } : base);
}

export function describeTrendScope(p: TrendParams, topicName?: string): string {
  return [
    PERIODS[p.period].label,
    p.type ? TYPES[p.type] : "",
    p.lang ? LANGS[p.lang] : "",
    p.cat ? `카테고리: ${categoryDef(p.cat)?.label}` : "",
    topicName ? `주제: ${topicName}` : "",
    p.kw ? `키워드: #${p.kw}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
