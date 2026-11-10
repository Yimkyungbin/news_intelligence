import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { adapterFor, type SourceRow } from "./adapters";
import { classify, itemLanguage } from "./classify";
import { FetchError, mapLimit, redactUrl, withRetry } from "./http";
import type { CollectedItem, TopicForClassify } from "./types";
import { normalizeKeywords } from "@/lib/keywords";

/**
 * 수집 파이프라인 (요구사항 1~3, 5)
 * - 소스 단위 격리: 한 소스 실패가 전체를 중단하지 않음
 * - 사용자 주제와 일치하는 콘텐츠만 해당 사용자에게 저장
 * - DB 쓰기는 service role (클라이언트는 collected 콘텐츠를 만들 수 없음)
 */

type Source = SourceRow & {
  storage_allowed: boolean;
  display_allowed: boolean;
  ai_processing_allowed: boolean;
  external_llm_allowed: boolean;
  permission_status: string;
  retention_days: number | null;
};

type TopicRow = TopicForClassify & { user_id: string; search_queries: string[] | null };

/** 소스 동시 처리 수 (외부 사이트 부하·실행 시간 균형) */
const SOURCE_CONCURRENCY = 4;
/** HN 검색에 쓰는 주제 검색 쿼리 최대 수 (전체 사용자 합산) */
const MAX_SEARCH_QUERIES = 30;

export type SourceResult = {
  sourceId: string;
  name: string;
  status: "success" | "partial" | "failed";
  fetched: number;
  stored: number;
  error?: string;
};

export type CollectionSummary = { startedAt: string; finishedAt: string; users: number; sources: SourceResult[]; purged: number };

const UPSERT_CHUNK = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 로그에 남길 오류 메시지: URL 쿼리·토큰 제거, 길이 제한 */
function safeError(e: unknown, source: Source): string {
  const base = e instanceof FetchError ? e.message : e instanceof Error ? e.message : "알 수 없는 오류";
  const where = source.source_url ? ` (${redactUrl(source.source_url)})` : "";
  return `${base}${where}`.replace(/(token|key|secret)=[^&\s]+/gi, "$1=***").slice(0, 500);
}

export async function runCollection(opts: { userId?: string; trigger: "cron" | "manual" }): Promise<CollectionSummary> {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY 가 설정되지 않아 수집을 실행할 수 없습니다.");
  const startedAt = new Date().toISOString();

  // 대상 사용자와 활성 주제
  let topicQuery = admin.from("topics").select("id,user_id,keywords,language,search_queries").eq("is_active", true);
  if (opts.userId) topicQuery = topicQuery.eq("user_id", opts.userId);
  const { data: topicRows, error: topicErr } = await topicQuery;
  if (topicErr) throw new Error(`주제 조회 실패: ${topicErr.message}`);
  const topicsByUser = new Map<string, TopicForClassify[]>();
  for (const t of (topicRows ?? []) as TopicRow[]) {
    const list = topicsByUser.get(t.user_id) ?? [];
    list.push({ id: t.id, keywords: t.keywords ?? [], language: t.language });
    topicsByUser.set(t.user_id, list);
  }
  const userIds = [...topicsByUser.keys()];
  const queriesByUser = new Map<string, string[]>();
  for (const t of (topicRows ?? []) as TopicRow[]) {
    queriesByUser.set(t.user_id, [...(queriesByUser.get(t.user_id) ?? []), ...(t.search_queries ?? [])]);
  }
  // 사용자별로 끈 소스 (요구사항 1.2)
  const disabledBySource = new Map<string, Set<string>>();
  if (userIds.length) {
    const { data: off } = await admin.from("user_source_settings").select("user_id,source_id").eq("enabled", false).in("user_id", userIds);
    for (const r of (off ?? []) as { user_id: string; source_id: string }[]) {
      disabledBySource.set(r.source_id, (disabledBySource.get(r.source_id) ?? new Set()).add(r.user_id));
    }
  }
  // 활성 주제가 있는 사용자가 없으면 저장할 대상이 없으므로 외부 요청을 하지 않음
  if (userIds.length === 0) {
    return { startedAt, finishedAt: new Date().toISOString(), users: 0, sources: [], purged: 0 };
  }

  // 활성 소스: 시스템 소스 + 대상 사용자의 소스
  let sourceQuery = admin
    .from("data_sources")
    .select("id,user_id,slug,name,source_type,source_url,storage_allowed,display_allowed,ai_processing_allowed,external_llm_allowed,permission_status,retention_days")
    .eq("is_active", true)
    .order("user_id", { ascending: true, nullsFirst: true });
  sourceQuery = opts.userId ? sourceQuery.or(`user_id.is.null,user_id.eq.${opts.userId}`) : sourceQuery;
  const { data: sourceRows, error: srcErr } = await sourceQuery;
  if (srcErr) throw new Error(`소스 조회 실패: ${srcErr.message}`);

  const processSource = async (source: Source): Promise<SourceResult | null> => {
    // 사용자 소스는 소유자에게만, 시스템 소스는 대상 사용자 전체에게. 소스를 끈 사용자는 제외
    const off = disabledBySource.get(source.id);
    const targets = (source.user_id ? userIds.filter((u) => u === source.user_id) : userIds).filter((u) => !off?.has(u));
    // 모든 대상 사용자가 끈 소스는 외부 요청을 하지 않음 (요구사항 1.6)
    if (targets.length === 0) return null;
    const queries = [...new Set(targets.flatMap((u) => queriesByUser.get(u) ?? []).map((q) => q.trim()).filter(Boolean))].slice(0, MAX_SEARCH_QUERIES);
    const adapter = adapterFor(source, { queries });
    if (!adapter) return null; // user-provided, demo, linkedin 등 수집 대상 아님

    const { data: log } = await admin
      .from("collection_logs")
      .insert({ user_id: opts.userId ?? null, source_id: source.id, job_type: "collect", status: "running" })
      .select("id")
      .single();

    const result: SourceResult = { sourceId: source.id, name: source.name, status: "success", fetched: 0, stored: 0 };
    let attempts = 1;
    try {
      if (!source.storage_allowed || !source.display_allowed) throw new Error("저장·표시 권한이 없는 소스입니다.");
      const run = await withRetry(adapter);
      attempts = run.attempts;
      const { items, skipped } = run.value;
      result.fetched = items.length;
      if (skipped > 0) result.status = "partial";

      for (const userId of targets) {
        result.stored += await storeForUser(admin, userId, source, items, topicsByUser.get(userId) ?? []);
      }
      await admin
        .from("data_sources")
        .update({ last_collected_at: new Date().toISOString(), connection_status: "connected", error_message: null })
        .eq("id", source.id);
    } catch (e) {
      attempts = (e as { attempts?: number }).attempts ?? attempts;
      result.status = "failed";
      result.error = safeError(e, source);
      await admin.from("data_sources").update({ connection_status: "error", error_message: result.error }).eq("id", source.id);
    }

    if (log?.id) {
      await admin
        .from("collection_logs")
        .update({
          status: result.status,
          completed_at: new Date().toISOString(),
          collected_count: result.stored,
          attempt: attempts,
          error_message: result.error ?? null,
        })
        .eq("id", log.id);
    }
    return result;
  };

  const results = (await mapLimit((sourceRows ?? []) as Source[], SOURCE_CONCURRENCY, processSource)).filter(
    (r): r is SourceResult => r !== null,
  );

  if (userIds.length) {
    await admin.from("topics").update({ last_collected_at: new Date().toISOString() }).eq("is_active", true).in("user_id", userIds);
  }

  let purged = 0;
  if (opts.trigger === "cron") {
    const { data } = await admin.rpc("purge_expired_content");
    purged = typeof data === "number" ? data : 0;
  }

  return { startedAt, finishedAt: new Date().toISOString(), users: userIds.length, sources: results, purged };
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function storeForUser(admin: Admin, userId: string, source: Source, items: CollectedItem[], topics: TopicForClassify[]): Promise<number> {
  const matched = items
    .map((item) => ({ item, matches: classify(item, topics) }))
    .filter((m) => m.matches.length > 0);
  if (matched.length === 0) return 0;

  // 사용자가 직접 등록한 같은 URL은 덮어쓰지 않음
  const urls = matched.map((m) => m.item.url);
  const existing = new Set<string>();
  for (const part of chunk(urls, UPSERT_CHUNK)) {
    const { data } = await admin
      .from("content_items")
      .select("original_url")
      .eq("user_id", userId)
      .neq("provenance", "collected")
      .in("original_url", part);
    for (const r of data ?? []) existing.add(r.original_url as string);
  }
  const rowsToStore = matched.filter((m) => !existing.has(m.item.url));

  const retentionUntil = source.retention_days ? new Date(Date.now() + source.retention_days * 86400000).toISOString() : null;
  let stored = 0;
  for (const part of chunk(rowsToStore, UPSERT_CHUNK)) {
    const rows = part.map(({ item, matches }) => ({
      user_id: userId,
      source_id: source.id,
      title: item.title,
      summary: item.summary,
      original_url: item.url,
      author: item.author,
      source_name: source.name,
      source_type: source.source_type,
      published_at: item.publishedAt,
      language: itemLanguage(item),
      content_type: item.contentType,
      // 일치한 주제 키워드 + 출처 태그를 화면과 같은 규칙으로 정리 (src/lib/keywords.ts)
      keywords: normalizeKeywords([...matches.flatMap((m) => m.matched), ...item.tags], 10),
      popularity: item.popularity,
      provenance: "collected",
      permission_status: source.permission_status,
      storage_allowed: source.storage_allowed,
      display_allowed: source.display_allowed,
      ai_processing_allowed: source.ai_processing_allowed,
      external_llm_allowed: source.external_llm_allowed,
      // 운영자가 출처 AI 처리를 허용했으면 요약 대기(pending), 아니면 차단
      ai_processing_status: source.ai_processing_allowed ? "pending" : "blocked",
      retention_policy: source.retention_days ? `${source.retention_days}d` : "source_default",
      retention_until: retentionUntil,
    }));
    const { data, error } = await admin.from("content_items").upsert(rows, { onConflict: "user_id,original_url" }).select("id,original_url");
    if (error) throw new Error(`콘텐츠 저장 실패: ${error.message}`);

    const idByUrl = new Map((data ?? []).map((r) => [r.original_url as string, r.id as string]));
    const links = part.flatMap(({ item, matches }) => {
      const contentId = idByUrl.get(item.url);
      return contentId ? matches.map((m) => ({ content_id: contentId, topic_id: m.topicId, relevance_score: m.relevance })) : [];
    });
    if (links.length) {
      const { error: linkErr } = await admin.from("content_topics").upsert(links, { onConflict: "content_id,topic_id" });
      if (linkErr) throw new Error(`주제 연결 실패: ${linkErr.message}`);
    }
    stored += data?.length ?? 0;
  }
  return stored;
}
