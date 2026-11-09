/**
 * 콘텐츠 언어 판별 (요구사항 4)
 * 한글 음절 수 / (한글 + 라틴 문자 수) ≥ 0.3 이면 'ko', 그 외 'en'.
 * 영문 기술 용어가 섞인 한국어 문장(예: "RAG 파이프라인 구축")도 ko 로 판별되도록 임계값을 낮게 둔다.
 */
export type ContentLanguage = "ko" | "en";

const HANGUL = /[\uAC00-\uD7A3]/g;
const LATIN = /[A-Za-z]/g;
export const KO_RATIO_THRESHOLD = 0.3;

export function detectLanguage(...parts: Array<string | null | undefined>): ContentLanguage {
  const text = parts.filter(Boolean).join(" ").normalize("NFC");
  const hangul = text.match(HANGUL)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  if (hangul + latin === 0) return "en";
  return hangul / (hangul + latin) >= KO_RATIO_THRESHOLD ? "ko" : "en";
}
