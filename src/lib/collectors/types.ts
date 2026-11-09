// 수집기 공통 타입 (순수 모듈: 단위 테스트를 위해 '@/' 별칭 대신 상대 경로 사용)

export type ContentType = "article" | "post" | "paper" | "repository" | "model" | "discussion" | "video" | "other";

/** 소스에서 가져와 정규화한 항목 */
export type CollectedItem = {
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  publishedAt: string | null; // ISO
  contentType: ContentType;
  /** 출처가 실제 제공한 지표만 (points, comments, stars, likes, downloads) */
  popularity: Record<string, number>;
  tags: string[];
  /** 소스가 언어를 제공한 경우만 */
  language: "ko" | "en" | null;
};

export type TopicForClassify = {
  id: string;
  keywords: string[];
  language: "all" | "ko" | "en";
};

export type TopicMatch = { topicId: string; relevance: number; matched: string[] };
