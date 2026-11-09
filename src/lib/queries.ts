import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_SELECT, type ContentItem } from "@/lib/types";

/**
 * 모든 쿼리는 사용자 세션 클라이언트로 실행되며 RLS가 user_id 범위를 강제한다.
 * (명시적 user_id 필터는 인덱스 활용 + 이중 방어 목적)
 */

export async function getSavedContentIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("saved_posts").select("content_id").eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.content_id as string));
}

export async function listContent(
  userId: string,
  opts: { sinceIso?: string; limit?: number; topicId?: string; contentType?: string; language?: string } = {},
): Promise<ContentItem[]> {
  const supabase = await createClient();
  const select = opts.topicId ? `${CONTENT_SELECT},content_topics!inner(topic_id)` : CONTENT_SELECT;
  let q = supabase
    .from("content_items")
    .select(select)
    .eq("user_id", userId)
    .eq("display_allowed", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 50);
  if (opts.sinceIso) {
    // 게시일이 없는 콘텐츠(직접 등록 등)는 수집일 기준으로 기간 판단
    // sinceIso 는 서버에서 생성한 ISO 문자열이므로 필터 구문 주입 위험 없음
    const since = new Date(opts.sinceIso).toISOString();
    q = q.or(`published_at.gte.${since},and(published_at.is.null,collected_at.gte.${since})`);
  }
  if (opts.topicId) q = q.eq("content_topics.topic_id", opts.topicId);
  if (opts.contentType) q = q.eq("content_type", opts.contentType);
  if (opts.language) q = q.eq("language", opts.language);
  const { data, error } = await q;
  if (error) throw new Error(`콘텐츠 조회 실패: ${error.message}`);
  return (data ?? []) as unknown as ContentItem[];
}

export async function countContent(userId: string, sinceIso?: string) {
  const supabase = await createClient();
  let q = supabase.from("content_items").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (sinceIso) q = q.gte("collected_at", sinceIso);
  const { count } = await q;
  return count ?? 0;
}
