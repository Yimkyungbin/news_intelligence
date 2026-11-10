"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedClient, requireUser } from "@/lib/auth";
import { refreshDailyStats } from "@/lib/stats/service";
import { isAdminEmail } from "@/lib/admin";
import { setSystemSourceAIPermission } from "@/lib/ai/system";
import type { ActionState } from "@/lib/types";

/** 사용자별 데이터 소스 켜기/끄기 (요구사항 1). 권한 확인은 RLS 정책(uss_insert)에서도 수행 */
export async function setSourceEnabled(sourceId: string, enabled: boolean): Promise<ActionState> {
  const id = z.uuid().safeParse(sourceId);
  if (!id.success || typeof enabled !== "boolean") return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();

  const { data: source } = await supabase.from("data_sources").select("id,name,source_type").eq("id", id.data).maybeSingle();
  if (!source) return { ok: false, message: "소스를 찾을 수 없습니다." };
  if (source.source_type === "user_provided" || source.source_type === "linkedin_api") {
    return { ok: false, message: "이 소스는 켜고 끌 수 없습니다." };
  }

  const { error } = await supabase
    .from("user_source_settings")
    .upsert({ user_id: userId, source_id: id.data, enabled, updated_at: new Date().toISOString() }, { onConflict: "user_id,source_id" });
  if (error) return { ok: false, message: "설정을 저장하지 못했습니다." };
  // 통계에서도 숨김 반영 (최근 90일 재계산)
  await refreshDailyStats(userId, 90);
  revalidatePath("/", "layout");
  return { ok: true, message: enabled ? `'${source.name}'을(를) 켰습니다.` : `'${source.name}'을(를) 껐습니다. 수집을 멈추고 피드에서 숨깁니다.` };
}

/** 운영자 전용: 시스템 소스의 AI 번역·요약 허용 (정책 B, 요구사항 5.1·5.2) */
export async function setSourceAIAllowed(sourceId: string, allowed: boolean): Promise<ActionState> {
  const id = z.uuid().safeParse(sourceId);
  if (!id.success || typeof allowed !== "boolean") return { ok: false, message: "잘못된 요청입니다." };
  const user = await requireUser();
  if (!isAdminEmail(user.email)) return { ok: false, message: "운영자만 변경할 수 있습니다." };
  const res = await setSystemSourceAIPermission(id.data, allowed);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
