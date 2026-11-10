import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listContent } from "@/lib/queries";
import { normalizeKeywords } from "@/lib/keywords";
import { rankContent, topKeywords } from "@/lib/content";
import { filterAIAllowed } from "@/lib/ai/gate";
import { AIError } from "@/lib/ai/openai";
import { getProvider } from "@/lib/ai/provider";
import { aiUsageToday, DAILY_AI_LIMIT } from "@/lib/ai/service";
import { daysAgoIso } from "@/lib/utils";
import type { ContentItem } from "@/lib/types";
import { splitPeriods } from "./compute";
import { describeTrendScope, PERIODS, trendCacheKey, type TrendParams } from "./params";

/** 현재 기간 + 직전 동일 기간 콘텐츠 (조건 적용) */
export async function loadTrendItems(userId: string, p: TrendParams) {
  const days = PERIODS[p.period].days;
  const all = await listContent(userId, {
    sinceIso: daysAgoIso(days * 2),
    limit: 1000,
    topicId: p.topic || undefined,
    contentType: p.type || undefined,
    language: p.lang || undefined,
  });
  const filtered = p.kw ? all.filter((i) => normalizeKeywords(i.keywords, 20).includes(p.kw)) : all;
  return splitPeriods(filtered, days);
}

export type TrendInsightContent = {
  headline: string;
  items: { title: string; detail: string; content_ids: string[] }[];
  scope: string;
  analyzed: number;
  excluded: number;
};

/** AI 트렌드 시사점 생성 (AI 허용 콘텐츠만, 사용자 일일 한도 공유) */
export async function generateTrendInsight(userId: string, p: TrendParams, topicName?: string): Promise<{ ok: boolean; message: string }> {
  const db = createAdminClient();
  if (!db) return { ok: false, message: "서버 설정이 완료되지 않았습니다." };
  const { data: prof } = await db.from("profiles").select("ai_model").eq("id", userId).maybeSingle();
  const provider = getProvider(prof?.ai_model as string | undefined);
  if (!provider) return { ok: false, message: "AI 기능이 비활성화되어 있습니다 (OpenAI 키 미설정)." };

  const { current } = await loadTrendItems(userId, p);
  // 인기 순 상위 콘텐츠를 우선 분석
  const ranked = rankContent(current, current.length).items as ContentItem[];
  const allowed = filterAIAllowed(ranked, provider.external).slice(0, 30);
  if (allowed.length === 0) {
    return { ok: false, message: `이 조건의 콘텐츠 ${current.length}건 중 AI 처리가 허용된 콘텐츠가 없습니다. 운영자가 Settings에서 출처의 AI 번역·요약을 허용하면 생성할 수 있습니다.` };
  }
  if ((await aiUsageToday(db, userId)) >= DAILY_AI_LIMIT) return { ok: false, message: `오늘 AI 사용 한도(${DAILY_AI_LIMIT}회)에 도달했습니다.` };

  const scope = describeTrendScope(p, topicName);
  const base = { ai_call: true, task: "trend_insight", provider: provider.name, model: provider.model, items: allowed.length };
  const { data: log } = await db.from("collection_logs").insert({ user_id: userId, job_type: "trend_ai", status: "running", details: base }).select("id").single();
  try {
    const { output, usage } = await provider.trendInsight(scope, allowed, topKeywords(current, 15).map((k) => k.keyword));
    const content: TrendInsightContent = {
      headline: output.headline,
      items: output.insights.map((i) => ({
        title: i.title,
        detail: i.detail,
        content_ids: [...new Set(i.content_refs.filter((n) => n >= 1 && n <= allowed.length).map((n) => allowed[n - 1].id))],
      })),
      scope,
      analyzed: allowed.length,
      excluded: current.length - allowed.length,
    };
    const { error } = await db
      .from("trend_insights")
      .insert({ user_id: userId, cache_key: trendCacheKey(p), content, model_name: provider.model, provider: provider.name, is_demo: provider.isDemo });
    if (error) throw new Error("시사점을 저장하지 못했습니다.");
    if (log?.id) await db.from("collection_logs").update({ status: "success", completed_at: new Date().toISOString(), collected_count: 1, details: { ...base, usage } }).eq("id", log.id);
    return { ok: true, message: `${provider.isDemo ? "DEMO " : ""}트렌드 시사점을 생성했습니다 (콘텐츠 ${allowed.length}건 분석).` };
  } catch (e) {
    const msg = e instanceof AIError ? e.message : "AI 처리 중 오류가 발생했습니다.";
    if (log?.id) await db.from("collection_logs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: msg }).eq("id", log.id);
    return { ok: false, message: msg };
  }
}
