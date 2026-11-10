"use server";

import { revalidatePath } from "next/cache";
import { authedClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshDailyStats } from "@/lib/stats/service";
import type { ActionState } from "@/lib/types";

const INTERVAL_MS = 10 * 60 * 1000;

/** 현재 DB 콘텐츠로 최근 90일 통계 다시 계산 (10분에 1회) */
export async function rebuildStats(): Promise<ActionState> {
  const { supabase, userId } = await authedClient();
  const since = new Date(Date.now() - INTERVAL_MS).toISOString();
  const { data: recent } = await supabase
    .from("collection_logs")
    .select("started_at")
    .eq("user_id", userId)
    .eq("job_type", "stats")
    .gte("started_at", since)
    .limit(1);
  if (recent?.length) return { ok: false, message: "통계 갱신은 10분에 한 번 실행할 수 있습니다." };

  const db = createAdminClient();
  if (!db) return { ok: false, message: "서버 설정이 완료되지 않았습니다." };
  const { data: log } = await db.from("collection_logs").insert({ user_id: userId, job_type: "stats", status: "running", details: { days: 90 } }).select("id").single();
  const res = await refreshDailyStats(userId, 90);
  if (log?.id) {
    await db
      .from("collection_logs")
      .update({ status: res.ok ? "success" : "failed", completed_at: new Date().toISOString(), collected_count: res.days, error_message: res.message ?? null })
      .eq("id", log.id);
  }
  if (!res.ok) return { ok: false, message: res.message ?? "통계를 갱신하지 못했습니다." };
  revalidatePath("/statistics");
  return { ok: true, message: `통계를 갱신했습니다 (데이터가 있는 날 ${res.days}일).` };
}
