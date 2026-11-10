// 키워드 정리 (순수 모듈: 수집 저장 시와 화면 표시 시 동일 규칙 적용)

/** arXiv 분류 코드 → 읽기 쉬운 이름. 목록에 없는 코드는 제외 */
const ARXIV_CATEGORY: Record<string, string> = {
  "cs.ai": "ai",
  "cs.cl": "nlp",
  "cs.lg": "machine learning",
  "stat.ml": "machine learning",
  "cs.cv": "computer vision",
  "cs.ro": "robotics",
  "cs.ir": "information retrieval",
  "cs.ma": "multi agent",
  "cs.se": "software engineering",
  "cs.cr": "security",
  "cs.hc": "hci",
  "cs.ne": "neural networks",
  "cs.dc": "distributed computing",
};
const ARXIV_CODE = /^[a-z-]+\.[a-z]{2}$/;

/** 의미 없는 블로그 분류·패키지 메타데이터 태그 */
const STOP = new Set([
  "news",
  "blog",
  "blogs",
  "announcements",
  "announcement",
  "featured",
  "uncategorized",
  "general",
  "other",
  "misc",
  "safetensors",
  "endpoints compatible",
  "autotrain compatible",
  "text generation inference",
  "region",
]);

const MAX_LENGTH = 40;

/** 단일 키워드 정규화. 버려야 하면 null */
export function normalizeKeyword(raw: string): string | null {
  let k = raw.normalize("NFC").toLowerCase().trim();
  if (!k) return null;
  if (k in ARXIV_CATEGORY) return ARXIV_CATEGORY[k];
  if (ARXIV_CODE.test(k)) return null;
  k = k
    .replace(/^#+/, "")
    .replace(/_+/g, " ")
    // 영문 단어 사이 하이픈만 공백으로 (ai-agents → ai agents, gpt-4o 는 유지)
    .replace(/([a-z]{2})-(?=[a-z]{2})/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
  if (k.length < 2 || k.length > MAX_LENGTH) return null;
  if (!/[a-z\uAC00-\uD7A3]/.test(k)) return null; // 숫자·기호만
  if (STOP.has(k)) return null;
  return k;
}

/**
 * 키워드 목록 정리: 복합 분류 분리("agentic ai / generative ai" → 2개), 정규화, 중복·복수형 병합
 */
export function normalizeKeywords(raw: readonly string[] | null | undefined, max = 10): string[] {
  const out: string[] = [];
  for (const r of raw ?? []) {
    for (const part of r.split(/\s+\/\s+|[|;,]/)) {
      const k = normalizeKeyword(part);
      if (k && !out.includes(k)) out.push(k);
    }
  }
  // 같은 목록 안의 복수형은 단수형으로 병합 (ai agents + ai agent → ai agent)
  const merged = out.filter((k) => !(k.endsWith("s") && out.includes(k.slice(0, -1))));
  return merged.slice(0, max);
}

/** 집계용: 단수형이 함께 있으면 복수형 개수를 단수형으로 합산 */
export function mergePluralCounts(counts: Map<string, number>): Map<string, number> {
  const result = new Map(counts);
  for (const [k, n] of counts) {
    const singular = k.slice(0, -1);
    if (k.endsWith("s") && singular.length >= 2 && result.has(singular)) {
      result.set(singular, (result.get(singular) ?? 0) + n);
      result.delete(k);
    }
  }
  return result;
}
