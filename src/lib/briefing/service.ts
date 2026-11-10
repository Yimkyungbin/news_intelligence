import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { filterAIAllowed } from "@/lib/ai/gate";
import { AIError } from "@/lib/ai/openai";
import { getProvider, providerStatus } from "@/lib/ai/provider";
import { aiUsageToday, DAILY_AI_LIMIT, processPending } from "@/lib/ai/service";
import { briefingAICandidates, composeBriefing, kstDate, type AIInsightSection, type BriefingItem, type BriefingLink } from "./compose";

/**
 * Daily Briefing 생성 (요구사항 4.4)
 * - 매일 07:00 KST Cron, 사용자별 독립 실행
 * - 실패 시 최대 3회 재시도(1s, 3s 백오프), 실행 이력은 collection_logs(job_type=briefing)
 * - 같은 날짜는 덮어쓰기(upsert)
 */

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function buildAISection(db: Admin, userId: string, items: BriefingItem[], now: Date, keywords: string[]): Promise<AIInsightSection> {
  const status = providerStatus();
  const { data: prof } = await db.from("profiles").select("ai_model").eq("id", userId).maybeSingle();
  const p = getProvider(prof?.ai_model as string | undefined);
  if (!p) return { status: "disabled", reason: status.reason };

  const allowed = filterAIAllowed(briefingAICandidates(items, now), p.external).slice(0, 30);
  if (allowed.length === 0) {
    return { status: "no_allowed_content", reason: "최근 24시간 콘텐츠 중 AI 처리가 허용된 콘텐츠가 없어 AI 인사이트를 생성하지 않았습니다." };
  }
  if ((await aiUsageToday(db, userId)) >= DAILY_AI_LIMIT) return { status: "limit", reason: `오늘 AI 사용 한도(${DAILY_AI_LIMIT}회)에 도달했습니다.` };

  const { output } = await p.briefingInsight(kstDate(now), allowed, keywords);
  return {
    status: "generated",
    headline: output.headline,
    items: output.insights.map((i) => ({
      title: i.title,
      detail: i.detail,
      // 모델이 준 번호는 입력 범위 안의 것만 실제 콘텐츠 id 로 변환
      content_ids: [...new Set(i.content_refs.filter((n) => n >= 1 && n <= allowed.length).map((n) => allowed[n - 1].id))],
    })),
    model: p.model,
    is_demo: p.isDemo,
  };
}

async function loadInputs(db: Admin, userId: string, now: Date) {
  const since = new Date(now.getTime() - 48 * 3600_000).toISOString();
  const [{ data: items }, { data: topics }, { data: links }] = await Promise.all([
    db
      .from("content_items")
      .select(
        "id,title,summary,original_url,source_name,source_type,content_type,provenance,published_at,collected_at,keywords,popularity,ai_processing_allowed,external_llm_allowed,source:data_sources(slug),content_topics(topic_id)",
      )
      .eq("user_id", userId)
      .eq("display_allowed", true)
      .or(`published_at.gte.${since},and(published_at.is.null,collected_at.gte.${since})`)
      .limit(1000),
    db.from("topics").select("id,name").eq("user_id", userId).eq("is_active", true),
    db
      .from("influencer_links")
      .select("url,title,posted_at,created_at,influencer:influencers!inner(name,company,is_following,is_active)")
      .eq("user_id", userId)
      .eq("influencer.is_following", true)
      .eq("influencer.is_active", true)
      .gte("created_at", since)
      .limit(50),
  ]);
  type Row = Omit<BriefingItem, "topic_ids"> & { content_topics: { topic_id: string }[] };
  const briefingItems: BriefingItem[] = ((items ?? []) as unknown as Row[]).map(({ content_topics, ...r }) => ({
    ...r,
    topic_ids: content_topics.map((t) => t.topic_id),
  }));
  type LinkRow = { url: string; title: string | null; posted_at: string | null; created_at: string; influencer: { name: string; company: string | null } };
  const influencerLinks: BriefingLink[] = ((links ?? []) as unknown as LinkRow[]).map((l) => ({
    influencer: l.influencer.name,
    company: l.influencer.company,
    title: l.title,
    url: l.url,
    date: l.created_at,
  }));
  return { briefingItems, topics: (topics ?? []) as { id: string; name: string }[], influencerLinks };
}

export type BriefingRun = { ok: boolean; message: string; date?: string };

export async function generateBriefing(userId: string, opts: { trigger: "cron" | "manual"; now?: Date } = { trigger: "manual" }): Promise<BriefingRun> {
  const db = createAdminClient();
  if (!db) return { ok: false, message: "SUPABASE_SECRET_KEY 가 설정되지 않아 브리핑을 생성할 수 없습니다." };
  const now = opts.now ?? new Date();
  const date = kstDate(now);

  const { data: log } = await db
    .from("collection_logs")
    .insert({ user_id: userId, job_type: "briefing", status: "running", details: { trigger: opts.trigger, date } })
    .select("id")
    .single();

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // AI 처리 허용 후 대기 중인 콘텐츠 요약 먼저 처리 (Cron)
      if (opts.trigger === "cron") await processPending(userId, 10);

      const { briefingItems, topics, influencerLinks } = await loadInputs(db, userId, now);
      const draft = composeBriefing({ now, items: briefingItems, topics, influencerLinks, aiInsights: { status: "disabled", reason: "" } });

      let ai: AIInsightSection;
      try {
        ai = await buildAISection(db, userId, briefingItems, now, draft.trends.map((t) => t.keyword));
      } catch (e) {
        // AI 섹션 실패는 브리핑 전체 실패로 보지 않음 (집계 섹션은 유지)
        ai = { status: "failed", reason: e instanceof AIError ? e.message : "AI 인사이트 생성 중 오류가 발생했습니다." };
      }
      const content = { ...draft, ai_insights: ai };
      const isDemo = (ai.status === "generated" && ai.is_demo) || (content.stats.today > 0 && content.stats.demo === content.stats.today);

      const { error } = await db.from("daily_briefings").upsert(
        {
          user_id: userId,
          briefing_date: date,
          content,
          model_name: ai.status === "generated" ? ai.model : null,
          is_demo: isDemo,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,briefing_date" },
      );
      if (error) throw new Error("브리핑을 저장하지 못했습니다.");

      if (log?.id) {
        await db
          .from("collection_logs")
          .update({
            status: ai.status === "failed" ? "partial" : "success",
            completed_at: new Date().toISOString(),
            collected_count: content.stats.today,
            attempt,
            error_message: ai.status === "failed" ? ai.reason : null,
            details: { trigger: opts.trigger, date, ai: ai.status, ai_call: ai.status === "generated" && !ai.is_demo },
          })
          .eq("id", log.id);
      }
      return { ok: true, message: ai.status === "failed" ? `브리핑을 생성했습니다 (AI 인사이트 실패: ${ai.reason})` : "브리핑을 생성했습니다.", date };
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 300) : "알 수 없는 오류";
      if (attempt < MAX_ATTEMPTS) await sleep(attempt === 1 ? 1000 : 3000);
    }
  }
  if (log?.id) {
    await db
      .from("collection_logs")
      .update({ status: "failed", completed_at: new Date().toISOString(), attempt: MAX_ATTEMPTS, error_message: lastError, details: { trigger: opts.trigger, date } })
      .eq("id", log.id);
  }
  return { ok: false, message: `브리핑 생성에 실패했습니다: ${lastError}` };
}

/** Cron: 전체 사용자 브리핑 (사용자 단위 격리) */
export async function runBriefingCron(now = new Date()) {
  const db = createAdminClient();
  if (!db) throw new Error("SUPABASE_SECRET_KEY 미설정");
  const { data: users } = await db.from("profiles").select("id");
  const results: { ok: boolean }[] = [];
  for (const u of users ?? []) {
    results.push(await generateBriefing(u.id as string, { trigger: "cron", now }));
  }
  return { users: results.length, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}
