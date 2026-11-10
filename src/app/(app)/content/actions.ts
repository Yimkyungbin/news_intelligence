"use server";

import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { normalizeKeywords } from "@/lib/keywords";
import type { PermissionStatus } from "@/lib/types";

export type ContentDetail = {
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
  keywords: string[];
  popularity: Record<string, number>;
  provenance: "demo" | "collected" | "user_provided" | "linkedin_api";
  permission_status: PermissionStatus;
  storage_allowed: boolean;
  display_allowed: boolean;
  ai_processing_allowed: boolean;
  external_llm_allowed: boolean;
  ai_processing_status: string;
  retention_policy: string | null;
  retention_until: string | null;
  source: {
    slug: string;
    name: string;
    logo_key: string | null;
    homepage_url: string | null;
    brand_color: string | null;
    policy_note: string | null;
    terms_url: string | null;
  } | null;
  topics: { id: string; name: string; relevance: number }[];
  saved: { notes: string | null; tags: string[] } | null;
  insight: {
    summary: string | null;
    key_points: string[];
    keywords: string[];
    insights: Partial<Record<"core" | "technical_meaning" | "business_impact" | "practical_use" | "related_tech", string>> & { technologies?: string[] };
    model_name: string;
    provider: string;
    is_demo: boolean;
    processed_at: string;
  } | null;
};

const SELECT =
  "id,title,summary,original_url,author,author_title,author_company,source_name,source_type,published_at,collected_at,language,content_type,keywords,popularity,provenance,permission_status,storage_allowed,display_allowed,ai_processing_allowed,external_llm_allowed,ai_processing_status,retention_policy,retention_until," +
  "source:data_sources(slug,name,logo_key,homepage_url,brand_color,policy_note,terms_url)," +
  "content_topics(relevance_score,topic:topics(id,name))," +
  "saved_posts(notes,tags)," +
  "ai_insights(summary,key_points,keywords,insights,model_name,provider,is_demo,processed_at)";

type Row = Omit<ContentDetail, "topics" | "saved" | "insight"> & {
  content_topics: { relevance_score: number; topic: { id: string; name: string } | null }[];
  saved_posts: { notes: string | null; tags: string[] }[];
  ai_insights: NonNullable<ContentDetail["insight"]>[];
};

/** 콘텐츠 상세 조회 (상세 보기 패널). RLS 로 본인 콘텐츠만 조회됨 */
export async function getContentDetail(contentId: string): Promise<{ ok: true; detail: ContentDetail } | { ok: false; message: string }> {
  const id = z.uuid().safeParse(contentId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();

  const { data, error } = await supabase.from("content_items").select(SELECT).eq("id", id.data).eq("user_id", userId).maybeSingle();
  if (error) return { ok: false, message: "콘텐츠를 불러오지 못했습니다." };
  if (!data) return { ok: false, message: "콘텐츠를 찾을 수 없습니다." };

  const row = data as unknown as Row;
  const { content_topics, saved_posts, ai_insights, ...rest } = row;
  // AI 요약은 처리 권한이 허용된 경우에만 노출
  const insight = rest.ai_processing_allowed ? (ai_insights.sort((a, b) => b.processed_at.localeCompare(a.processed_at))[0] ?? null) : null;

  return {
    ok: true,
    detail: {
      ...rest,
      keywords: normalizeKeywords(rest.keywords, 15),
      topics: content_topics
        .filter((ct) => ct.topic)
        .map((ct) => ({ id: ct.topic!.id, name: ct.topic!.name, relevance: ct.relevance_score }))
        .sort((a, b) => b.relevance - a.relevance),
      saved: saved_posts[0] ?? null,
      insight,
    },
  };
}
