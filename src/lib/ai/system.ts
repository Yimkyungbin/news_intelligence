import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { startOfTodayKstIso } from "@/lib/utils";
import { filterAIAllowed } from "./gate";
import { AIError } from "./openai";
import { getProvider } from "./provider";
import { chunk, planStages, STAGE_CONFIG, type CacheState, type Stage } from "./stages";
import { mapLimit } from "@/lib/collectors/http";

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

/**
 * 시스템 번역 2단계 처리
 * - 1단계(title): 외국어 제목만 번역. 배치 5건 × 동시 3개 → 화면 제목이 수 초 내 한국어로
 * - 2단계(full) : 요약 번역 + 한 줄 시사점. 배치 10건 × 동시 2개 (1단계 이후 같은 작업 안에서 이어서)
 * - URL·단계별 처리 중 표시(claim_ai_urls)로 동시에 여러 요청이 와도 한 번만 처리
 * - 모델이 빠뜨린 항목은 단계별로 1회 재시도
 */
export async function processSystemAI(
  opts: { maxItems?: number; sourceId?: string; sourceIds?: string[]; urls?: string[]; skipMock?: boolean; stages?: Stage[] } = {},
): Promise<{ processed: number; titles: number; calls: number; message: string }> {
  const empty = (message: string) => ({ processed: 0, titles: 0, calls: 0, message });
  const db = createAdminClient();
  if (!db) return empty("SUPABASE_SECRET_KEY 미설정");
  const p = getProvider(null);
  if (!p) return empty("AI 기능이 비활성화되어 있습니다.");
  // 수집 후 자동 처리에서는 모의 AI 결과(DEMO)를 공유 캐시에 남기지 않음
  if (opts.skipMock && p.isDemo) return empty("모의 AI 모드에서는 자동 번역을 건너뜁니다.");

  const { count: usedToday } = await db
    .from("collection_logs")
    .select("id", { count: "exact", head: true })
    .eq("job_type", "system_ai")
    .is("user_id", null)
    .gte("started_at", startOfTodayKstIso())
    .contains("details", { ai_call: true });
  let budget = SYSTEM_AI_DAILY_LIMIT - (usedToday ?? 0);
  if (budget <= 0) return empty(`오늘 시스템 AI 한도(${SYSTEM_AI_DAILY_LIMIT}회)에 도달했습니다.`);

  // 허용된 시스템 소스의 최근 콘텐츠
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
  // 화면에 보인 콘텐츠만 (조회 시 자동 번역)
  if (opts.urls?.length) q = q.in("original_url", opts.urls.slice(0, 200));
  const { data } = await q;

  const uniq = new Map<string, Row>();
  for (const r of (data ?? []) as unknown as Row[]) if (!uniq.has(r.original_url)) uniq.set(r.original_url, r);
  const allowed = filterAIAllowed([...uniq.values()], p.external);
  const urls = allowed.map((r) => r.original_url);
  const cache = new Map<string, CacheState>();
  for (let i = 0; i < urls.length; i += 200) {
    const { data: c } = await db.from("content_ai_cache").select("original_url,title_ko,stage,source_language").in("original_url", urls.slice(i, i + 200));
    for (const r of (c ?? []) as (CacheState & { original_url: string })[]) cache.set(r.original_url, r);
  }
  const plan = planStages(allowed, cache, opts.urls);
  const limit = opts.maxItems ?? 100;
  // 1단계 결과 제목을 2단계 저장 때 보존 (2단계 응답에 제목이 비어도 덮어쓰지 않음)
  const titleByUrl = new Map<string, string>();
  for (const [u, c] of cache) if (c.title_ko) titleByUrl.set(u, c.title_ko);

  let processed = 0;
  let titles = 0;
  let calls = 0;
  let lastError = "";
  let stop = false;

  const runStage = async (stage: Stage, rows: Row[]) => {
    if (rows.length === 0 || stop) return;
    // 처리 중 표시: 다른 요청이 이미 가져간 URL 은 제외
    const { data: claimed, error: claimError } = await db.rpc("claim_ai_urls", { p_urls: rows.map((r) => r.original_url), p_stage: stage });
    // 표시 기능 자체가 실패하면 번역을 멈추지 않고 그대로 진행 (중복 방지보다 번역이 우선)
    if (claimError) console.warn("[system-ai] 처리 중 표시 실패, 중복 방지 없이 진행:", claimError.message);
    const mine = claimError
      ? new Set(rows.map((r) => r.original_url))
      : new Set(((claimed ?? []) as unknown[]).map((v) => (typeof v === "string" ? v : String((v as Record<string, unknown>).claim_ai_urls ?? ""))));
    const todo = rows.filter((r) => mine.has(r.original_url));
    if (todo.length === 0) return;
    const { batch: size, concurrency } = STAGE_CONFIG[stage];

    const runBatch = async (batch: Row[]): Promise<Row[]> => {
      if (stop || budget <= 0) return [];
      budget--;
      calls++;
      const base = { ai_call: true, task: stage === "title" ? "title_batch" : "batch_meta", stage, provider: p.name, model: p.model, items: batch.length };
      const { data: log } = await db.from("collection_logs").insert({ job_type: "system_ai", status: "running", details: base }).select("id").single();
      try {
        let saved: { original_url: string; source_language: string; title_ko: string | null }[] = [];
        let usage: unknown;
        if (stage === "title") {
          const res = await p.titleBatch(batch);
          usage = res.usage;
          saved = res.output.items
            .filter((o) => o.n >= 1 && o.n <= batch.length && o.title_ko)
            .map((o) => {
              const src = batch[o.n - 1];
              return { original_url: src.original_url, source_id: src.source_id, source_language: src.language, title_ko: o.title_ko, model_name: p.model, provider: p.name, is_demo: p.isDemo, stage: "title" };
            });
        } else {
          const res = await p.batchMeta(batch);
          usage = res.usage;
          saved = res.output.items
            .filter((o) => o.n >= 1 && o.n <= batch.length)
            .map((o) => {
              const src = batch[o.n - 1];
              const foreign = src.language !== "ko";
              return {
                original_url: src.original_url,
                source_id: src.source_id,
                source_language: src.language,
                title_ko: foreign ? o.title_ko || titleByUrl.get(src.original_url) || null : null,
                summary_ko: foreign && o.summary_ko ? o.summary_ko : null,
                implication_ko: o.implication_ko || null,
                model_name: p.model,
                provider: p.name,
                is_demo: p.isDemo,
                stage: "full",
              };
            });
        }
        if (saved.length) {
          const { error } = await db.from("content_ai_cache").upsert(saved, { onConflict: "original_url" });
          if (error) throw new Error("번역 결과를 저장하지 못했습니다.");
        }
        for (const s of saved) if (s.title_ko) titleByUrl.set(s.original_url, s.title_ko);
        if (stage === "title") titles += saved.length;
        else processed += saved.length;
        // 빠진 항목: 응답에 없거나, 외국어인데 번역 제목이 비어 있는 것
        const done = new Set(saved.filter((s) => s.title_ko || s.source_language === "ko").map((s) => s.original_url));
        const missed = batch.filter((b) => !done.has(b.original_url));
        if (log?.id) await db.from("collection_logs").update({ status: "success", completed_at: new Date().toISOString(), collected_count: saved.length, details: { ...base, usage, missed: missed.length } }).eq("id", log.id);
        return missed;
      } catch (e) {
        lastError = e instanceof AIError ? e.message : "AI 처리 중 오류가 발생했습니다.";
        if (log?.id) await db.from("collection_logs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: lastError }).eq("id", log.id);
        if (e instanceof AIError && !e.retryable) stop = true;
        return [];
      }
    };

    try {
      const missed = (await mapLimit(chunk(todo, size), concurrency, runBatch)).flat();
      // 빠진 항목 1회 재시도
      if (missed.length && !stop) await mapLimit(chunk(missed, size), concurrency, runBatch);
    } finally {
      await db.rpc("release_ai_urls", { p_urls: todo.map((r) => r.original_url), p_stage: stage });
    }
  };

  const stages = opts.stages ?? ["title", "full"];
  if (stages.includes("title")) await runStage("title", plan.title.slice(0, limit));
  if (stages.includes("full")) await runStage("full", plan.full.slice(0, limit));

  const nothing = plan.title.length === 0 && plan.full.length === 0;
  const message = nothing
    ? "처리할 콘텐츠가 없습니다."
    : `제목 번역 ${titles}건, 요약·시사점 ${processed}건 생성${lastError ? ` (일부 실패: ${lastError})` : ""}`;
  return { processed: processed + titles, titles, calls, message };
}

/** 조회 시 자동 번역: 화면 1회당 최대 처리 건수 (중복 실행은 claim_ai_urls 로 방지) */
const FILL_MAX_ITEMS = 30;

/**
 * 화면에 보인 콘텐츠 중 번역·시사점이 없는 것을 응답 후 백그라운드로 처리 (요구사항 5: 한국어로 보기)
 * 화면 순서대로 제목부터 번역하고, 이어서 요약·시사점을 채운다.
 * 운영자가 허용한 출처만 (processSystemAI 의 필터 그대로), 시스템 하루 한도 공유, 모의 AI 결과는 캐시에 남기지 않음
 */
export async function fillMissingTranslations(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const res = await processSystemAI({ urls, maxItems: FILL_MAX_ITEMS, skipMock: true });
  if (res.calls) console.info("[system-ai] 조회 시 자동 번역:", res.message);
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
