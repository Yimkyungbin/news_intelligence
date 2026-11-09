// 주제 분류: 사용자 주제 키워드와 콘텐츠 텍스트 매칭
import { detectLanguage } from "../language.ts";
import type { CollectedItem, TopicForClassify, TopicMatch } from "./types.ts";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 키워드 일치 여부
 * - 영문/숫자 키워드: 단어 경계 기준 (예: "rag" 가 "storage" 에 일치하지 않음), 복수형 s 허용
 * - 그 외(한국어 등): 부분 문자열 일치
 */
export function matchesKeyword(haystack: string, keyword: string): boolean {
  const k = keyword.normalize("NFC").toLowerCase().trim();
  if (!k) return false;
  if (/^[a-z0-9][a-z0-9 .+#/-]*$/.test(k)) {
    const pattern = escapeRegExp(k).replace(/\\?[ -]/g, "[\\s-]");
    return new RegExp(`(^|[^a-z0-9])${pattern}s?([^a-z0-9]|$)`).test(haystack);
  }
  return haystack.includes(k);
}

export function itemLanguage(item: CollectedItem): "ko" | "en" {
  return item.language ?? detectLanguage(item.title, item.summary);
}

/** 콘텐츠와 일치하는 활성 주제 목록. 일치 없음 → 빈 배열(저장하지 않음) */
export function classify(item: CollectedItem, topics: TopicForClassify[]): TopicMatch[] {
  const lang = itemLanguage(item);
  const haystack = [item.title, item.summary ?? "", ...item.tags].join(" ").normalize("NFC").toLowerCase();

  return topics.flatMap((t) => {
    if (t.language !== "all" && t.language !== lang) return [];
    const matched = [...new Set(t.keywords.map((k) => k.trim()).filter((k) => k && matchesKeyword(haystack, k)))];
    if (matched.length === 0) return [];
    const denominator = Math.max(1, Math.min(t.keywords.length, 3));
    const relevance = Math.min(1, Math.round((matched.length / denominator) * 100) / 100);
    return [{ topicId: t.id, relevance, matched }];
  });
}
