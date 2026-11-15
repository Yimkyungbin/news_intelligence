// 번역 2단계 계획 (순수 모듈: 단위 테스트를 위해 상대 경로 사용)
// 1단계 title: 외국어 콘텐츠의 제목만 빠르게 번역 → 화면에 바로 한국어 제목
// 2단계 full : 요약 번역 + 한 줄 시사점 (한국어 콘텐츠는 시사점만)

export type Stage = "title" | "full";
export type StageRow = { original_url: string; language: string };
export type CacheState = { title_ko: string | null; stage: string; source_language: string };

/** 화면 순서(urls)가 주어지면 그 순서대로, 없으면 입력 순서 유지 */
export function orderByUrls<T extends { original_url: string }>(rows: T[], urls?: string[]): T[] {
  if (!urls?.length) return rows;
  const idx = new Map(urls.map((u, i) => [u, i]));
  return [...rows].sort((a, b) => (idx.get(a.original_url) ?? 1e9) - (idx.get(b.original_url) ?? 1e9));
}

/**
 * 단계별 처리 대상
 * - title: 외국어이면서 번역 제목이 없는 것
 * - full : 캐시가 없거나 2단계(full)가 끝나지 않은 것. 외국어인데 번역 제목이 비어 있는 full 행도 다시 처리
 */
export function planStages<T extends StageRow>(rows: T[], cache: Map<string, CacheState>, urls?: string[]): Record<Stage, T[]> {
  const ordered = orderByUrls(rows, urls);
  const foreign = (r: T) => r.language !== "ko";
  return {
    title: ordered.filter((r) => foreign(r) && !cache.get(r.original_url)?.title_ko),
    full: ordered.filter((r) => {
      const c = cache.get(r.original_url);
      if (!c) return true;
      if (c.stage !== "full") return true;
      return foreign(r) && !c.title_ko;
    }),
  };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 단계별 배치 크기·동시 실행 수 */
export const STAGE_CONFIG: Record<Stage, { batch: number; concurrency: number }> = {
  title: { batch: 5, concurrency: 3 },
  full: { batch: 10, concurrency: 2 },
};
