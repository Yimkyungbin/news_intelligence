import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { startOfTodayKstIso } from "@/lib/utils";
import { checkAIPermission, filterAIAllowed } from "./gate";
import { AIError } from "./openai";
import { getProvider, type AIProvider } from "./provider";
import { disabledSourceIdsFor } from "@/lib/source-settings";

/**
 * AI 작업 서비스 (서버 전용, service role)
 * - 모든 호출 전에 권한 게이트 통과 확인 (요구사항 3.4)
 * - 사용자별 일일 호출 한도 (비용·남용 방지)
 * - 작업 이력: collection_logs(job_type=ai/topic_ai), 비밀값·원문 미기록
 */

export const DAILY_AI_LIMIT = 200;
const TOPIC_WINDOW_DAYS = 14;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export type AIResult = { ok: true; message: string } | { ok: false; message: string };

function admin(): Admin {
  const a = createAdminClient();
  if (!a) throw new Error("SUPABASE_SECRET_KEY 가 설정되지 않아 AI 작업을 실행할 수 없습니다.");
  return a;
}

function safeMessage(e: unknown): string {
  if (e instanceof AIError) return e.message;
  return "AI 처리 중 오류가 발생했습니다.";
}

async function userModel(db: Admin, userId: string) {
  const { data } = await db.from("profiles").select("ai_model").eq("id", userId).maybeSingle();
  return (data?.ai_model as string | undefined) ?? null;
}

/** 오늘(KST) 사용한 AI 호출 수 */
export async function aiUsageToday(db: Admin, userId: string): Promise<number> {
  const since = startOfTodayKstIso();
  const { count } = await db
    .from("collection_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("job_type", ["ai", "topic_ai", "briefing"])
    .neq("status", "failed")
    .gte("started_at", since)
    .contains("details", { ai_call: true });
  return count ?? 0;
}

async function startLog(db: Admin, userId: string, jobType: "ai" | "topic_ai" | "briefing", details: Record<string, unknown>) {
  const { data } = await db.from("collection_logs").insert({ user_id: userId, job_type: jobType, status: "running", details }).select("id").single();
  return data?.id as string | undefined;
}

async function endLog(db: Admin, id: string | undefined, status: "success" | "failed", details: Record<string, unknown>, error?: string, attempt = 1) {
  if (!id) return;
  await db
    .from("collection_logs")
    .update({ status, completed_at: new Date().toISOString(), collected_count: status === "success" ? 1 : 0, error_message: error ?? null, attempt, details })
    .eq("id", id);
}

/* ---------- 콘텐츠 요약·인사이트 ---------- */
export async function summarizeContent(userId: string, contentId: string, provider?: AIProvider | null): Promise<AIResult> {
  const db = admin();
  const { data: c } = await db
    .from("content_items")
    .select("id,user_id,title,summary,source_name,content_type,published_at,provenance,ai_processing_allowed,external_llm_allowed")
    .eq("id", contentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!c) return { ok: false, message: "콘텐츠를 찾을 수 없습니다." };

  const p = provider === undefined ? getProvider(await userModel(db, userId)) : provider;
  if (!p) return { ok: false, message: "AI 기능이 비활성화되어 있습니다 (OpenAI 키 미설정)." };

  const gate = checkAIPermission(c, p.external);
  if (!gate.ok) return { ok: false, message: gate.reason };
  if ((await aiUsageToday(db, userId)) >= DAILY_AI_LIMIT) return { ok: false, message: `오늘 AI 사용 한도(${DAILY_AI_LIMIT}회)에 도달했습니다.` };

  const base = { ai_call: true, task: "content_insight", provider: p.name, model: p.model, content_id: contentId };
  const logId = await startLog(db, userId, "ai", base);
  await db.from("content_items").update({ ai_processing_status: "processing" }).eq("id", contentId);
  try {
    const { output, usage } = await p.contentInsight(c);
    const { error } = await db.from("ai_insights").insert({
      content_id: contentId,
      summary: output.summary_ko,
      key_points: output.key_claims,
      keywords: output.keywords,
      insights: { ...output.insight, technologies: output.technologies },
      model_name: p.model,
      provider: p.name,
      is_demo: p.isDemo,
    });
    if (error) throw new Error("AI 결과를 저장하지 못했습니다.");
    await db.from("content_items").update({ ai_processing_status: "completed" }).eq("id", contentId);
    await endLog(db, logId, "success", { ...base, usage });
    return { ok: true, message: p.isDemo ? "DEMO 모의 AI 요약을 생성했습니다." : "AI 요약을 생성했습니다." };
  } catch (e) {
    const msg = safeMessage(e);
    await db.from("content_items").update({ ai_processing_status: "failed" }).eq("id", contentId);
    await endLog(db, logId, "failed", base, msg);
    return { ok: false, message: msg };
  }
}

/** AI 처리 허용 후 아직 요약되지 않은 콘텐츠 일괄 처리 (Cron) */
export async function processPending(userId: string, limit = 10): Promise<number> {
  const db = admin();
  const p = getProvider(await userModel(db, userId));
  if (!p) return 0;
  const { data } = await db
    .from("content_items")
    .select("id")
    .eq("user_id", userId)
    .eq("ai_processing_allowed", true)
    .eq("ai_processing_status", "pending")
    .eq("provenance", "user_provided")
    .order("collected_at", { ascending: false })
    .limit(limit);
  let done = 0;
  for (const r of data ?? []) {
    const res = await summarizeContent(userId, r.id as string, p);
    if (res.ok) done++;
  }
  return done;
}

/* ---------- 사용자 직접 등록 콘텐츠 AI 처리 동의 ---------- */
export async function setUserContentAIConsent(userId: string, contentId: string, allowed: boolean): Promise<AIResult> {
  const db = admin();
  const { data: c } = await db.from("content_items").select("id,provenance").eq("id", contentId).eq("user_id", userId).maybeSingle();
  if (!c) return { ok: false, message: "콘텐츠를 찾을 수 없습니다." };
  if (c.provenance !== "user_provided") return { ok: false, message: "직접 등록한 콘텐츠만 AI 처리 허용을 변경할 수 있습니다." };

  if (allowed) {
    const { error } = await db
      .from("content_items")
      .update({ ai_processing_allowed: true, external_llm_allowed: true, ai_processing_status: "pending" })
      .eq("id", contentId)
      .eq("user_id", userId);
    if (error) return { ok: false, message: "변경하지 못했습니다." };
    return { ok: true, message: "AI 처리를 허용했습니다." };
  }
  // 철회: 기존 AI 결과 삭제 후 차단
  await db.from("ai_insights").delete().eq("content_id", contentId);
  const { error } = await db
    .from("content_items")
    .update({ ai_processing_allowed: false, external_llm_allowed: false, ai_processing_status: "blocked" })
    .eq("id", contentId)
    .eq("user_id", userId);
  if (error) return { ok: false, message: "변경하지 못했습니다." };
  return { ok: true, message: "AI 처리 허용을 철회하고 AI 결과를 삭제했습니다." };
}

/* ---------- 주제 인텔리전스 ---------- */
export async function generateTopicInsight(userId: string, topicId: string, provider?: AIProvider | null): Promise<AIResult> {
  const db = admin();
  const { data: topic } = await db.from("topics").select("id,name,description,keywords").eq("id", topicId).eq("user_id", userId).maybeSingle();
  if (!topic) return { ok: false, message: "주제를 찾을 수 없습니다." };

  const p = provider === undefined ? getProvider(await userModel(db, userId)) : provider;
  if (!p) return { ok: false, message: "AI 기능이 비활성화되어 있습니다 (OpenAI 키 미설정)." };

  const since = new Date(Date.now() - TOPIC_WINDOW_DAYS * 86400000).toISOString();
  const { data: rows } = await db
    .from("content_topics")
    .select("content:content_items!inner(id,user_id,source_id,title,summary,source_name,content_type,published_at,collected_at,provenance,ai_processing_allowed,external_llm_allowed)")
    .eq("topic_id", topicId)
    .eq("content.user_id", userId)
    .gte("content.collected_at", since)
    .limit(200);
  type C = {
    id: string;
    source_id: string | null;
    title: string;
    summary: string | null;
    source_name: string;
    content_type: string;
    published_at: string | null;
    collected_at: string;
    provenance: string;
    ai_processing_allowed: boolean;
    external_llm_allowed: boolean;
  };
  const disabled = new Set(await disabledSourceIdsFor(db, userId));
  const all = ((rows ?? []) as unknown as { content: C }[]).map((r) => r.content).filter((c) => !(c.source_id && disabled.has(c.source_id)));
  const allowed = filterAIAllowed(all, p.external)
    .sort((a, b) => (b.published_at ?? b.collected_at).localeCompare(a.published_at ?? a.collected_at))
    .slice(0, 30);
  if (allowed.length === 0) {
    return { ok: false, message: `최근 ${TOPIC_WINDOW_DAYS}일 이 주제의 콘텐츠 ${all.length}건 중 AI 처리가 허용된 콘텐츠가 없습니다.` };
  }
  if ((await aiUsageToday(db, userId)) >= DAILY_AI_LIMIT) return { ok: false, message: `오늘 AI 사용 한도(${DAILY_AI_LIMIT}회)에 도달했습니다.` };

  const base = { ai_call: true, task: "topic_insight", provider: p.name, model: p.model, topic_id: topicId, items: allowed.length };
  const logId = await startLog(db, userId, "topic_ai", base);
  try {
    const { output, usage } = await p.topicInsight(topic, allowed);
    const { error } = await db.from("topic_insights").insert({
      user_id: userId,
      topic_id: topicId,
      content: { ...output, refs: allowed.map((c) => ({ id: c.id, title: c.title })), excluded: all.length - allowed.length },
      source_ids: allowed.map((c) => c.id),
      model_name: p.model,
      provider: p.name,
      is_demo: p.isDemo,
    });
    if (error) throw new Error("AI 결과를 저장하지 못했습니다.");
    await endLog(db, logId, "success", { ...base, usage });
    return { ok: true, message: `${p.isDemo ? "DEMO " : ""}주제 인사이트를 생성했습니다 (콘텐츠 ${allowed.length}건 분석).` };
  } catch (e) {
    const msg = safeMessage(e);
    await endLog(db, logId, "failed", base, msg);
    return { ok: false, message: msg };
  }
}
