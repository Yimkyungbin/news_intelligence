import type { ContentItem } from "@/lib/types";
import { mergePluralCounts, normalizeKeywords } from "./keywords.ts";
import { primaryScore } from "./metrics.ts";
import { cleanPostSummary, cleanPostTitle, isLinkOnly } from "./collectors/text.ts";

/** 화면 표시용 제목: SNS 게시글은 URL·멘션을 제거 (기존에 저장된 콘텐츠 포함) */
export function displayTitle(item: Pick<ContentItem, "title" | "summary" | "content_type">): string {
  return item.content_type === "post" ? cleanPostTitle(item.title, item.summary) : item.title;
}

/** 화면 표시용 요약: SNS 게시글은 URL·멘션 제거 + 제목과 겹치는 앞부분 제거 */
export function displaySummary(item: Pick<ContentItem, "title" | "summary" | "content_type">): string | null {
  if (item.content_type === "post") return cleanPostSummary(item.summary, displayTitle(item));
  // 링크만 나열된 요약(HN 본문 등)은 의미가 없어 숨김
  return isLinkOnly(item.summary) ? null : item.summary;
}

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  article: "기사",
  post: "SNS",
  paper: "논문",
  repository: "저장소",
  model: "모델",
  discussion: "토론",
  video: "영상",
  other: "기타",
};

/** 출처가 실제로 제공한 지표만 표시용 라벨로 변환 */
const METRIC_LABELS: Record<string, string> = {
  points: "points",
  comments: "댓글",
  stars: "stars",
  upvotes: "추천",
  likes: "likes",
  citations: "인용",
  downloads: "downloads",
};

/** 상세 보기용 지표 설명 */
export const METRIC_HELP: Record<string, string> = {
  points: "Hacker News 이용자 추천 점수",
  comments: "출처에 달린 댓글 수",
  stars: "GitHub 저장소 Star 수 (관심 표시)",
  upvotes: "커뮤니티 추천 수 (Hugging Face Daily Papers 등)",
  likes: "좋아요 수",
  citations: "OpenAlex 집계 피인용 수",
  downloads: "Hugging Face 최근 다운로드 수",
};

export function popularityEntries(p: Record<string, unknown> | null | undefined) {
  if (!p) return [];
  return Object.entries(p)
    .filter(([k, v]) => k in METRIC_LABELS && typeof v === "number" && v > 0)
    .map(([k, v]) => ({ key: k, label: METRIC_LABELS[k], value: v as number }));
}

/** 근거 있는 단일 인기 점수: 출처 제공 지표의 대표값 (없으면 null) */
export function popularityScore(item: Pick<ContentItem, "popularity">): number | null {
  return primaryScore(item.popularity);
}

type Rankable = Pick<ContentItem, "id" | "popularity" | "published_at" | "collected_at" | "source_name"> & {
  source?: { slug?: string | null } | null;
};

/** 같은 출처를 연속으로 고를 때마다 곱하는 감쇠 계수 */
export const SOURCE_DECAY = 0.7;

const recency = (i: Rankable) => i.published_at ?? i.collected_at;
const sourceKey = (i: Rankable) => i.source?.slug ?? i.source_name;

/**
 * 출처 간 공정한 인기 순위
 * 1) 출처마다 지표 규모가 달라(GitHub stars 수천 vs HN points 수백) 원래 숫자를 직접 비교하지 않는다.
 *    출처 안에서의 순위를 (n - 순위 + 1) / (n + 1) 로 정규화한다 (표본이 적은 출처의 1위는 낮게 보정).
 * 2) 같은 출처가 이미 k번 뽑혔으면 점수에 0.7^k 를 곱해 한 출처의 독점을 막는다.
 * 3) 지표가 없는 항목(블로그·논문)은 게시일 최신순으로 뒤에 붙인다.
 * notes: 항목별 "GitHub 내 1위/53" 같은 근거 문구
 */
export function rankContent<T extends Rankable>(items: T[], limit: number) {
  const groups = new Map<string, T[]>();
  const unranked: T[] = [];
  for (const it of items) {
    if (popularityScore(it) === null) {
      unranked.push(it);
      continue;
    }
    const k = sourceKey(it);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }

  type Candidate = { item: T; base: number; key: string; rank: number; total: number };
  const pool: Candidate[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => (popularityScore(b) ?? 0) - (popularityScore(a) ?? 0) || recency(b).localeCompare(recency(a)));
    const n = list.length;
    list.forEach((item, idx) => {
      // 출처 내 순위 정규화: 1위 = n/(n+1), 꼴찌 = 1/(n+1). 표본이 적을수록 1위 점수가 낮아짐
      pool.push({ item, base: (n - idx) / (n + 1), key, rank: idx + 1, total: n });
    });
  }

  const picked: Candidate[] = [];
  const pickedPerSource = new Map<string, number>();
  while (picked.length < limit && pool.length > 0) {
    let best = 0;
    let bestScore = -1;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const score = c.base * SOURCE_DECAY ** (pickedPerSource.get(c.key) ?? 0);
      const better =
        score > bestScore + 1e-9 ||
        (Math.abs(score - bestScore) <= 1e-9 &&
          (recency(c.item) > recency(pool[best].item) || (recency(c.item) === recency(pool[best].item) && c.item.id < pool[best].item.id)));
      if (better) {
        best = i;
        bestScore = score;
      }
    }
    const [chosen] = pool.splice(best, 1);
    picked.push(chosen);
    pickedPerSource.set(chosen.key, (pickedPerSource.get(chosen.key) ?? 0) + 1);
  }

  unranked.sort((a, b) => recency(b).localeCompare(recency(a)) || a.id.localeCompare(b.id));
  const result = [...picked.map((c) => c.item), ...unranked].slice(0, limit);
  const notes: Record<string, string> = {};
  const positions: Record<string, { rank: number; total: number }> = {};
  for (const c of picked) {
    notes[c.item.id] = `${c.item.source_name} 내 ${c.rank}위/${c.total}`;
    positions[c.item.id] = { rank: c.rank, total: c.total };
  }
  return { items: result, ranked: picked.length > 0, notes, positions };
}

/** 키워드 빈도 집계 (Today's Intelligence). 콘텐츠당 1회, 정리된 키워드 기준 */
export function topKeywords(items: Pick<ContentItem, "keywords">[], limit = 8) {
  const counts = new Map<string, number>();
  for (const it of items) for (const k of normalizeKeywords(it.keywords, 20)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...mergePluralCounts(counts).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

/** 최근 N일 KST 일자별 콘텐츠 수. 게시일 기준, 게시일이 없으면 수집일 */
export function dailyBuckets(items: Pick<ContentItem, "published_at" | "collected_at">[], days: number, now = Date.now()) {
  const fmt = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
  const buckets = Array.from({ length: days }, (_, i) => ({ day: fmt.format(new Date(now - (days - 1 - i) * 86400000)), count: 0 }));
  for (const it of items) {
    const slot = buckets.find((b) => b.day === fmt.format(new Date(it.published_at ?? it.collected_at)));
    if (slot) slot.count += 1;
  }
  return buckets;
}
