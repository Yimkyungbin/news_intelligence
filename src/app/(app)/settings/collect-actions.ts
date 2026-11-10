"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { runCollection } from "@/lib/collectors/pipeline";
import { refreshDailyStats } from "@/lib/stats/service";
import { processSystemAI } from "@/lib/ai/system";
import { FetchError, fetchJson, safeFetch } from "@/lib/collectors/http";
import { blueskyHandleFromUrl, parseBlueskyFeed } from "@/lib/collectors/sources";
import { parseFeed } from "@/lib/collectors/rss";
import { failure, httpUrl, text } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

const MANUAL_INTERVAL_MS = 10 * 60 * 1000;
const MAX_USER_FEEDS = 20;
const uuid = z.uuid();

/** 수동 수집 (요구사항 3.3, 3.4): 본인 대상, 10분에 1회 */
export async function collectNow(): Promise<ActionState> {
  const { supabase, userId } = await authedClient();
  if (!uuid.safeParse(userId).success) return { ok: false, message: "잘못된 사용자입니다." };

  const since = new Date(Date.now() - MANUAL_INTERVAL_MS).toISOString();
  const { data: recent } = await supabase
    .from("collection_logs")
    .select("started_at")
    .eq("user_id", userId)
    .eq("job_type", "collect")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1);
  if (recent?.length) {
    const waitMs = new Date(recent[0].started_at).getTime() + MANUAL_INTERVAL_MS - Date.now();
    const minutes = Math.max(1, Math.ceil(waitMs / 60000));
    return { ok: false, message: `수동 수집은 10분에 한 번 실행할 수 있습니다. 약 ${minutes}분 후 다시 시도하세요.` };
  }

  try {
    const summary = await runCollection({ userId, trigger: "manual" });
    await refreshDailyStats(userId, 3);
    await processSystemAI({ maxItems: 30 });
    revalidatePath("/", "layout");
    const stored = summary.sources.reduce((n, s) => n + s.stored, 0);
    const failed = summary.sources.filter((s) => s.status === "failed").length;
    if (summary.sources.length === 0) return { ok: true, message: "활성화된 수집 소스가 없습니다." };
    return {
      ok: failed < summary.sources.length,
      message: `수집을 완료했습니다. 소스 ${summary.sources.length}개, 저장 ${stored}건${failed ? `, 실패 ${failed}개` : ""}.`,
    };
  } catch (e) {
    console.error("[collectNow] failed", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "수집 중 오류가 발생했습니다." };
  }
}

const feedSchema = z.object({
  name: text().min(1, "이름을 입력하세요.").max(100),
  url: httpUrl.refine((v) => v.startsWith("https://"), "https 로 시작하는 피드 URL만 등록할 수 있습니다."),
});

/** 사용자 RSS 추가 (요구사항 4.1~4.3): 등록 전 1회 안전 요청으로 피드 여부 확인 */
export async function addUserFeed(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = feedSchema.safeParse({ name: fd.get("name") ?? "", url: fd.get("url") ?? "" });
  if (!parsed.success) return failure("입력값을 확인하세요.", fd, parsed.error);
  const { supabase, userId } = await authedClient();

  const { count } = await supabase.from("data_sources").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= MAX_USER_FEEDS) return failure(`피드는 최대 ${MAX_USER_FEEDS}개까지 등록할 수 있습니다.`, fd);

  try {
    const handle = blueskyHandleFromUrl(parsed.data.url);
    if (handle) {
      // Bluesky 프로필: 공개 API(고정 호스트)로 확인
      parseBlueskyFeed(await fetchJson(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=5`));
    } else {
      const { text: body } = await safeFetch(parsed.data.url, { untrusted: true, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" });
      if (parseFeed(body).length === 0) return failure("피드에 항목이 없습니다.", fd);
    }
  } catch (e) {
    const reason = e instanceof FetchError ? e.message : "RSS 또는 Atom 피드를 읽을 수 없습니다.";
    return failure(`피드를 확인하지 못했습니다: ${reason}`, fd);
  }

  const host = new URL(parsed.data.url).hostname.replace(/^www\./, "");
  const { error } = await supabase.from("data_sources").insert({
    user_id: userId,
    slug: `user-rss-${randomUUID().slice(0, 8)}`,
    name: parsed.data.name,
    source_type: "rss",
    source_url: parsed.data.url,
    homepage_url: `https://${host}`,
    is_active: true,
  });
  if (error) return failure("피드를 등록하지 못했습니다.", fd);
  revalidatePath("/settings");
  return { ok: true, message: "피드를 등록했습니다. 다음 수집부터 반영됩니다." };
}

export async function setUserFeedActive(sourceId: string, active: boolean): Promise<ActionState> {
  const id = uuid.safeParse(sourceId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("data_sources").update({ is_active: active }).eq("id", id.data).eq("user_id", userId);
  if (error) return { ok: false, message: "변경하지 못했습니다." };
  revalidatePath("/settings");
  return { ok: true, message: active ? "피드를 활성화했습니다." : "피드를 비활성화했습니다." };
}

export async function deleteUserFeed(sourceId: string): Promise<ActionState> {
  const id = uuid.safeParse(sourceId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("data_sources").delete().eq("id", id.data).eq("user_id", userId);
  if (error) return { ok: false, message: "삭제하지 못했습니다." };
  revalidatePath("/settings");
  return { ok: true, message: "피드를 삭제했습니다. 이미 수집된 콘텐츠는 유지됩니다." };
}
