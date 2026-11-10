"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { generateTopicInsight, setUserContentAIConsent, summarizeContent } from "@/lib/ai/service";
import { generateBriefing } from "@/lib/briefing/service";
import { generateTrendInsight } from "@/lib/trends/service";
import { parseTrendParams } from "@/lib/trends/params";
import type { ActionState } from "@/lib/types";

const uuid = z.uuid();
const MANUAL_BRIEFING_INTERVAL_MS = 10 * 60 * 1000;

/** 직접 등록 콘텐츠의 AI 처리 허용/철회 (사용자가 권리를 확인했다는 동의) */
export async function setAIConsent(contentId: string, allowed: boolean): Promise<ActionState> {
  const id = uuid.safeParse(contentId);
  if (!id.success || typeof allowed !== "boolean") return { ok: false, message: "잘못된 요청입니다." };
  const { userId } = await authedClient();
  const res = await setUserContentAIConsent(userId, id.data, allowed);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function generateContentSummary(contentId: string): Promise<ActionState> {
  const id = uuid.safeParse(contentId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { userId } = await authedClient();
  const res = await summarizeContent(userId, id.data);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function generateTopicIntelligence(topicId: string): Promise<ActionState> {
  const id = uuid.safeParse(topicId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { userId } = await authedClient();
  const res = await generateTopicInsight(userId, id.data);
  if (res.ok) revalidatePath(`/topics/${id.data}`);
  return res;
}

/** 브리핑 수동 생성 (10분에 1회) */
export async function generateBriefingNow(): Promise<ActionState> {
  const { supabase, userId } = await authedClient();
  const since = new Date(Date.now() - MANUAL_BRIEFING_INTERVAL_MS).toISOString();
  const { data: recent } = await supabase
    .from("collection_logs")
    .select("started_at")
    .eq("user_id", userId)
    .eq("job_type", "briefing")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1);
  if (recent?.length) {
    const minutes = Math.max(1, Math.ceil((new Date(recent[0].started_at).getTime() + MANUAL_BRIEFING_INTERVAL_MS - Date.now()) / 60000));
    return { ok: false, message: `브리핑은 10분에 한 번 생성할 수 있습니다. 약 ${minutes}분 후 다시 시도하세요.` };
  }
  const res = await generateBriefing(userId, { trigger: "manual" });
  if (res.ok) revalidatePath("/", "layout");
  return { ok: res.ok, message: res.message };
}

/** Trending 조건별 AI 트렌드 시사점 (요구사항 4.3·4.4). 인자는 서버에서 다시 정규화 */
export async function generateTrendIntelligence(raw: Record<string, unknown>): Promise<ActionState> {
  const { supabase, userId } = await authedClient();
  const { data: topics } = await supabase.from("topics").select("id,name").eq("user_id", userId);
  const params = parseTrendParams(raw ?? {}, (topics ?? []).map((t) => t.id as string));
  const topicName = (topics ?? []).find((t) => t.id === params.topic)?.name as string | undefined;
  const res = await generateTrendInsight(userId, params, topicName);
  if (res.ok) revalidatePath("/trending");
  return res;
}
