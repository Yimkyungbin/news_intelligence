import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * 사용자별 소스 on/off (요구사항 1)
 * - user_source_settings 에 enabled=false 인 소스만 "꺼짐". 행이 없으면 켜짐.
 * - 피드 화면(Dashboard·Trending·Topics·검색·브리핑·통계)에서 숨김. Saved·Knowledge 는 유지.
 */
export const getDisabledSourceIds = cache(async (userId: string): Promise<string[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("user_source_settings").select("source_id").eq("user_id", userId).eq("enabled", false);
  return (data ?? []).map((r) => r.source_id as string);
});

/** UUID 만 통과시켜 PostgREST 필터 구문 주입 방지 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 꺼진 소스의 콘텐츠를 제외하는 or 필터 (최상위 content_items 쿼리용, source_id 가 없는 콘텐츠는 유지) */
export function hiddenSourceFilter(ids: string[]): string | null {
  const safe = ids.filter((id) => UUID.test(id));
  if (safe.length === 0) return null;
  return `source_id.is.null,source_id.not.in.(${safe.join(",")})`;
}

/** service role 클라이언트용 (Cron·서버 작업). RLS 가 없으므로 user_id 를 명시해 조회 */
export async function disabledSourceIdsFor(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await db.from("user_source_settings").select("source_id").eq("user_id", userId).eq("enabled", false);
  return ((data ?? []) as { source_id: string }[]).map((r) => r.source_id);
}
