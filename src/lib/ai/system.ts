import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { startOfTodayKstIso } from "@/lib/utils";
import { filterAIAllowed } from "./gate";
import { AIError } from "./openai";
import { BATCH_SIZE } from "./prompts";
import { getProvider } from "./provider";

/**
 * 시스템 AI 일괄 처리: 운영자가 허용한 출처 콘텐츠의 한국어 번역 + 한 줄 시사점 (요구사항 4.2, 5.3)
 * - URL 기준 캐시(content_ai_cache)로 사용자 간 재사용
 * - 하루 100회 호출 제한, 실행 이력 collection_logs(job_type=system_ai, user_id 없음)
 */
export const SYSTEM_AI_DAILY_LIMIT = 300;
/** AI 허용을 바꿀 수 없는 소스 유형 */
const LOCKED_TYPES = ["linkedin_api", "user_provided", "demo"];
const WINDOW_DAYS = 7;

type Row = {
  original_url: string;
  title: string;
  summary: string | null;
  source_name: string;
  content_type: string;
  published_at: string | null;
  language: string;
  provenance: string;
  source_id: string | null;
  ai_processing_allowed: boolean;
  external_llm_allowed: boolean;
};

export async function processSystemAI(
  opts: { maxItems?: number; sourceId?: string; sourceIds?: string[]; skipMock?: boolean } = {},
): Promise<{ processed: number; calls: number; message: string }> {
  const db = createAdminClient();
  if (!db) return { processed: 0, calls: 0, message: "SUPABASE_SECRET_KEY 미설정" };
  const p = getProvider(null);
  if (!p) return { processed: 0, calls: 0, message: "AI 기능이 비활성화되어 있습니다." };
  // 수집 후 자동 처리에서는 모의 AI 결과(DEMO)를 공유 캐시에 남기지 않음
  if (opts.skipMock && p.isDemo) return { processed: 0, calls: 0, message: "모의 AI 모드에서는 자동 번역을 건너뜁니다." };

  const { count: usedToday } = await db
    .from("collection_logs")
    .select("id", { count: "exact", head: true })
    .eq("job_type", "system_ai")
    .is("user_id", null)
    .gte("started_at", startOfTodayKstIso())
    .contains("details", { ai_call: true });
  let budget = SYSTEM_AI_DAILY_LIMIT - (usedToday ?? 0);
  if (budget <= 0) return { processed: 0, calls: 0, message: `오늘 시스템 AI 한도(${SYSTEM_AI_DAILY_LIMIT}회)에 도달했습니다.` };

  // 허용된 시스템 소스의 최근 콘텐츠 중 캐시가 없는 URL
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  let q = db
    .from("content_items")
    .select("original_url,title,summary,source_name,content_type,published_at,language,provenance,source_id,ai_processing_allowed,external_llm_allowed,source:data_sources!inner(user_id)")
    .eq("provenance", "collected")
    .eq("ai_processing_allowed", true)
    .is("source.user_id", null)
    .gte("collected_at", since)
    .order("collected_at", { ascending: false })
    .limit(1000);
  if (opts.sourceId) q = q.eq("source_id", opts.sourceId);
  if (opts.sourceIds?.length) q = q.in("source_id", opts.sourceIds);
  const { data } = await q;

  const uniq = new Map<string, Row>();
  for (const r of (data ?? []) as unknown as Row[]) if (!uniq.has(r.original_url)) uniq.set(r.original_url, r);
  const urls = [...uniq.keys()];
  const cached = new Set<string>();
  for (let i = 0; i < urls.length; i += 200) {
    const { data: c } = await db.from("content_ai_cache").select("original_url").in("original_url", urls.slice(i, i + 200));
    for (const r of c ?? []) cached.add(r.original_url as string);
  }
  const todo = filterAIAllowed([...uniq.values()].filter((r) => !cached.has(r.original_url)), p.external).slice(0, opts.maxItems ?? 100);

  let processed = 0;
  let calls = 0;
  let lastError = "";
  for (let i = 0; i < todo.length && budget > 0; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const base = { ai_call: true, task: "batch_meta", provider: p.name, model: p.model, items: batch.length };
    const { data: log } = await db.from("collection_logs").insert({ job_type: "system_ai", status: "running", details: base }).select("id").single();
    budget--;
    calls++;
    try {
      const { output, usage } = await p.batchMeta(batch);
      const rows = output.items
        .filter((o) => o.n >= 1 && o.n <= batch.length)
        .map((o) => {
          const src = batch[o.n - 1];
          const foreign = src.language !== "ko";
          return {
            original_url: src.original_url,
            source_id: src.source_id,
            source_language: src.language,
            title_ko: foreign && o.title_ko ? o.title_ko : null,
            summary_ko: foreign && o.summary_ko ? o.summary_ko : null,
            implication_ko: o.implication_ko || null,
            model_name: p.model,
            provider: p.name,
            is_demo: p.isDemo,
          };
        });
      if (rows.length) {
        const { error } = await db.from("content_ai_cache").upsert(rows, { onConflict: "original_url" });
        if (error) throw new Error("번역 결과를 저장하지 못했습니다.");
      }
      processed += rows.length;
      if (log?.id) await db.from("collection_logs").update({ status: "success", completed_at: new Date().toISOString(), collected_count: rows.length, details: { ...base, usage } }).eq("id", log.id);
    } catch (e) {
      lastError = e instanceof AIError ? e.message : "AI 처리 중 오류가 발생했습니다.";
      if (log?.id) await db.from("collection_logs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: lastError }).eq("id", log.id);
      if (e instanceof AIError && !e.retryable) break;
    }
  }
  const message = todo.length === 0 ? "처리할 콘텐츠가 없습니다." : `번역·시사점 ${processed}건 생성${lastError ? ` (일부 실패: ${lastError})` : ""}`;
  return { processed, calls, message };
}

/** AI 허용을 바꿀 수 있는 시스템 소스 id 목록 */
export async function aiEligibleSourceIds(): Promise<string[]> {
  const db = createAdminClient();
  if (!db) return [];
  const { data } = await db.from("data_sources").select("id,source_type").is("user_id", null);
  return (data ?? []).filter((s) => !LOCKED_TYPES.includes(s.source_type as string)).map((s) => s.id as string);
}

/**
 * 운영자: 시스템 소스 AI 번역·요약 허용/차단 (단일 DB 함수 호출로 즉시 처리)
 * 허용 시 번역·시사점 생성은 호출 측에서 응답 후 백그라운드로 실행한다 (processSystemAI).
 */
export async function setSourcesAIPermission(sourceIds: string[], allowed: boolean): Promise<{ ok: boolean; changed: number; message: string }> {
  const db = createAdminClient();
  if (!db) return { ok: false, changed: 0, message: "SUPABASE_SECRET_KEY 미설정" };
  if (sourceIds.length === 0) return { ok: false, changed: 0, message: "변경할 소스가 없습니다." };
  const { data, error } = await db.rpc("set_sources_ai_permission", { p_source_ids: sourceIds, p_allowed: allowed });
  if (error) return { ok: false, changed: 0, message: "변경하지 못했습니다." };
  const changed = typeof data === "number" ? data : 0;
  if (changed === 0) return { ok: false, changed: 0, message: "이 소스는 AI 허용을 변경할 수 없습니다." };
  return { ok: true, changed, message: "" };
}
