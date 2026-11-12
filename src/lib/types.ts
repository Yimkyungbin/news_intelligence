export type PermissionStatus = "AVAILABLE" | "CONDITIONAL" | "UNAVAILABLE" | "NOT_VERIFIED";

export type DataSource = {
  id: string;
  user_id: string | null;
  slug: string;
  name: string;
  source_type: string;
  source_url: string | null;
  homepage_url: string | null;
  logo_key: string | null;
  logo_url: string | null;
  brand_color: string | null;
  connection_status: string;
  permission_status: PermissionStatus;
  storage_allowed: boolean;
  display_allowed: boolean;
  ai_processing_allowed: boolean;
  external_llm_allowed: boolean;
  retention_days: number | null;
  terms_url: string | null;
  policy_note: string | null;
  is_active: boolean;
  last_collected_at: string | null;
  error_message: string | null;
};

export type Topic = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  search_queries: string[];
  priority: number;
  language: "all" | "ko" | "en";
  is_active: boolean;
  last_collected_at: string | null;
  created_at: string;
};

export type Influencer = {
  id: string;
  name: string;
  company: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  category: string[];
  notes: string | null;
  is_following: boolean;
  is_active: boolean;
  created_at: string;
};

export type InfluencerLink = {
  id: string;
  influencer_id: string;
  url: string;
  title: string | null;
  note: string | null;
  posted_at: string | null;
  created_at: string;
};

/** 화면 표시용 콘텐츠 (출처 조인 포함) */
export type ContentItem = {
  id: string;
  title: string;
  summary: string | null;
  original_url: string;
  author: string | null;
  author_title: string | null;
  author_company: string | null;
  source_name: string;
  source_type: string;
  published_at: string | null;
  collected_at: string;
  language: string;
  content_type: string;
  /** 고정 8종 카테고리 (src/lib/categories.ts). 기존 콘텐츠는 null → 화면에서 계산 */
  category: string | null;
  keywords: string[];
  popularity: Record<string, number>;
  provenance: "demo" | "collected" | "user_provided" | "linkedin_api";
  permission_status: PermissionStatus;
  ai_processing_allowed: boolean;
  external_llm_allowed: boolean;
  ai_processing_status: string;
  source: Pick<DataSource, "slug" | "logo_key" | "homepage_url" | "brand_color"> | null;
  /** 연결된 관심 주제 (별칭 조인, 주제 필터용 content_topics!inner 와 구분) */
  topic_links?: { relevance_score: number; topic: { id: string; name: string } | null }[];
};

/** 번역·한 줄 시사점 (content_ai_cache) */
export type ContentAIMeta = { title_ko: string | null; summary_ko: string | null; implication_ko: string | null; is_demo: boolean };

export const CONTENT_SELECT =
  "id,title,summary,original_url,author,author_title,author_company,source_name,source_type,published_at,collected_at,language,content_type,category,keywords,popularity,provenance,permission_status,ai_processing_allowed,external_llm_allowed,ai_processing_status,source:data_sources(slug,logo_key,homepage_url,brand_color),topic_links:content_topics(relevance_score,topic:topics(id,name))";

export type SavedPost = {
  id: string;
  notes: string | null;
  tags: string[];
  folder_id: string | null;
  in_knowledge_base: boolean;
  created_at: string;
  content: ContentItem;
};

export type Folder = { id: string; name: string };

/** Server Action 공통 반환 형태 */
export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  /** 실패 시 사용자가 입력한 값 (폼 복원용) */
  values?: Record<string, string | string[]>;
} | null;

export const INFLUENCER_CATEGORIES = [
  "AI / Generative AI",
  "Agentic AI",
  "LLM / Foundation Model",
  "Cloud / Infrastructure",
  "Data Engineering",
  "Enterprise Architecture",
  "Technology Leadership",
  "Product Management",
  "Business Strategy",
] as const;

/**
 * Settings에서 선택 가능한 AI 모델 (OpenAI 공식 모델 안내, 2026-11 확인)
 * 첫 번째가 기본값. DB CHECK 제약(profiles_ai_model_check)과 일치해야 한다.
 */
export const AI_MODELS = ["gpt-6-luna", "gpt-6.1-terra", "gpt-6.1-sol"] as const;
export const AI_MODEL_LABELS: Record<(typeof AI_MODELS)[number], string> = {
  "gpt-6-luna": "GPT-6 Luna (저비용·대량 처리, 기본)",
  "gpt-6.1-terra": "GPT-6.1 Terra (균형)",
  "gpt-6.1-sol": "GPT-6.1 Sol (고품질)",
};
