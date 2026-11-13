// 반응 지표 (순수 모듈): 대표 점수, 일별 기록 기반 증가량
// 출처가 실제로 제공한 지표만 사용한다 (추정·가공 지표 없음)

/** 대표 지표 우선순위: 출처마다 하나의 지표만 제공하므로 처음 나오는 양수 값을 사용 */
export const SCORE_KEYS = ["points", "upvotes", "stars", "likes", "citations", "downloads"] as const;

export const SCORE_LABELS: Record<string, string> = {
  points: "points",
  upvotes: "추천",
  stars: "stars",
  likes: "likes",
  citations: "인용",
  downloads: "downloads",
};

export function primaryMetric(p: Record<string, unknown> | null | undefined): { key: string; value: number } | null {
  if (!p) return null;
  for (const k of SCORE_KEYS) {
    const v = p[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return { key: k, value: Math.floor(v) };
  }
  return null;
}

export function primaryScore(p: Record<string, unknown> | null | undefined): number | null {
  return primaryMetric(p)?.value ?? null;
}

/** KST 기준 날짜 (YYYY-MM-DD) */
export function kstDate(d: Date = new Date(), offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(d.getTime() + offsetDays * 86400000),
  );
}

export type Snapshot = { content_id: string; captured_on: string; score: number };

/**
 * 기간 증가량: 현재 점수 - 기준일 점수
 * 기준일 = (오늘 - days) 이전 기록 중 가장 최근 값. 없으면 오늘보다 이전의 가장 오래된 기록.
 * 오늘 이전 기록이 없으면(처음 수집) null → 화면에 증가량을 표시하지 않음.
 */
export function metricGrowth(current: number | null, snaps: Snapshot[], days: number, today: string): { delta: number; since: string } | null {
  if (current === null) return null;
  const past = snaps.filter((s) => s.captured_on < today).sort((a, b) => a.captured_on.localeCompare(b.captured_on));
  if (past.length === 0) return null;
  const target = kstDate(new Date(`${today}T12:00:00+09:00`), -days);
  const before = past.filter((s) => s.captured_on <= target);
  const base = before.length ? before[before.length - 1] : past[0];
  return { delta: Math.max(0, current - base.score), since: base.captured_on };
}

/** 출처 내 상위 비율 (1위/50건 → 2%). 표본이 3건 미만이면 비율이 무의미해 null */
export function topPercent(rank: number, total: number): number | null {
  if (total < 3 || rank < 1 || rank > total) return null;
  return Math.max(1, Math.ceil((rank / total) * 100));
}
