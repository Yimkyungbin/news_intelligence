"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedClient, requireUser } from "@/lib/auth";
import { refreshDailyStats } from "@/lib/stats/service";
import { isAdminEmail } from "@/lib/admin";
import { aiEligibleSourceIds, processSystemAI, setSourcesAIPermission } from "@/lib/ai/system";
import type { ActionState } from "@/lib/types";

/** 켜고 끌 수 없는 소스 유형 */
const LOCKED = ["user_provided", "linkedin_api"];

/** 사용자별 데이터 소스 켜기/끄기 (요구사항 1). 권한 확인은 RLS 정책(uss_insert)에서도 수행 */
export async function setSourceEnabled(sourceId: string, enabled: boolean): Promise<ActionState> {
  const id = z.uuid().safeParse(sourceId);
  if (!id.success || typeof enabled !== "boolean") return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();

  const { data: source } = await supabase.from("data_sources").select("id,name,source_type").eq("id", id.data).maybeSingle();
  if (!source) return { ok: false, message: "소스를 찾을 수 없습니다." };
  if (LOCKED.includes(source.source_type as string)) {
    return { ok: false, message: "이 소스는 켜고 끌 수 없습니다." };
  }

  const { error } = await supabase
    .from("user_source_settings")
    .upsert({ user_id: userId, source_id: id.data, enabled, updated_at: new Date().toISOString() }, { onConflict: "user_id,source_id" });
  if (error) return { ok: false, message: "설정을 저장하지 못했습니다." };
  // 통계 숨김 반영(최근 90일 재계산)은 응답 후 백그라운드에서
  after(() => refreshDailyStats(userId, 90));
  revalidatePath("/", "layout");
  return { ok: true, message: enabled ? `'${source.name}'을(를) 켰습니다.` : `'${source.name}'을(를) 껐습니다. 수집을 멈추고 피드에서 숨깁니다.` };
}

/** 사용 전체 켜기/끄기 (내 계정 기준, 요구사항 1) */
export async function setAllSourcesEnabled(enabled: boolean): Promise<ActionState> {
  if (typeof enabled !== "boolean") return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  // 화면의 데이터 소스 표와 같은 범위(시스템 소스). 내 RSS 피드는 별도 활성화 버튼으로 관리
  const { data: sources } = await supabase.from("data_sources").select("id,source_type").is("user_id", null);
  const ids = (sources ?? []).filter((s) => !LOCKED.includes(s.source_type as string)).map((s) => s.id as string);
  if (ids.length === 0) return { ok: false, message: "변경할 소스가 없습니다." };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_source_settings")
    .upsert(ids.map((source_id) => ({ user_id: userId, source_id, enabled, updated_at: now })), { onConflict: "user_id,source_id" });
  if (error) return { ok: false, message: "설정을 저장하지 못했습니다." };
  after(() => refreshDailyStats(userId, 90));
  revalidatePath("/", "layout");
  return { ok: true, message: enabled ? `소스 ${ids.length}개를 모두 켰습니다.` : `소스 ${ids.length}개를 모두 껐습니다. 수집을 멈추고 피드에서 숨깁니다.` };
}

async function adminOnly() {
  const user = await requireUser();
  return isAdminEmail(user.email);
}

/** 운영자 전용: 시스템 소스 하나의 AI 번역·요약 허용 (정책 B) */
export async function setSourceAIAllowed(sourceId: string, allowed: boolean): Promise<ActionState> {
  const id = z.uuid().safeParse(sourceId);
  if (!id.success || typeof allowed !== "boolean") return { ok: false, message: "잘못된 요청입니다." };
  if (!(await adminOnly())) return { ok: false, message: "운영자만 변경할 수 있습니다." };
  const { supabase } = await authedClient();
  const { data: source } = await supabase.from("data_sources").select("name").eq("id", id.data).maybeSingle();
  const name = (source?.name as string | undefined) ?? "소스";
  const res = await setSourcesAIPermission([id.data], allowed);
  if (!res.ok) return { ok: false, message: res.message };
  // 번역·시사점 생성은 응답 후 백그라운드에서 (화면은 바로 반영)
  if (allowed) after(() => processSystemAI({ sourceId: id.data, maxItems: 30 }));
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: allowed
      ? `'${name}'의 AI 번역·요약을 허용했습니다. 번역·시사점은 백그라운드에서 생성됩니다.`
      : `'${name}'의 AI 처리를 차단하고 번역·시사점·AI 요약을 삭제했습니다.`,
  };
}

/** 운영자 전용: 모든 시스템 소스 AI 번역·요약 일괄 허용/차단 */
export async function setAllSourcesAIAllowed(allowed: boolean): Promise<ActionState> {
  if (typeof allowed !== "boolean") return { ok: false, message: "잘못된 요청입니다." };
  if (!(await adminOnly())) return { ok: false, message: "운영자만 변경할 수 있습니다." };
  const ids = await aiEligibleSourceIds();
  const res = await setSourcesAIPermission(ids, allowed);
  if (!res.ok) return { ok: false, message: res.message };
  if (allowed) after(() => processSystemAI({ sourceIds: ids, maxItems: 150 }));
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: allowed
      ? `소스 ${res.changed}개의 AI 번역·요약을 허용했습니다. 번역·시사점은 백그라운드에서 생성됩니다.`
      : `소스 ${res.changed}개의 AI 번역·요약을 차단하고 AI 결과를 삭제했습니다.`,
  };
}
