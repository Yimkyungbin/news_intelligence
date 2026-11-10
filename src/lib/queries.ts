import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_SELECT, type ContentAIMeta, type ContentItem } from "@/lib/types";
import { getDisabledSourceIds, hiddenSourceFilter } from "@/lib/source-settings";

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
  // 사용자가 끈 소스 숨김 (여러 or 조건은 AND 로 결합됨)
  const hidden = hiddenSourceFilter(await getDisabledSourceIds(userId));
  if (hidden) q = q.or(hidden);
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
  const hidden = hiddenSourceFilter(await getDisabledSourceIds(userId));
  if (hidden) q = q.or(hidden);
  const { count } = await q;
  return count ?? 0;
}

/** 번역·한 줄 시사점 일괄 조회 (URL 기준 공유 캐시) */
export async function getAIMeta(urls: string[]): Promise<Map<string, ContentAIMeta>> {
  const out = new Map<string, ContentAIMeta>();
  const uniq = [...new Set(urls)];
  if (uniq.length === 0) return out;
  const supabase = await createClient();
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await supabase
      .from("content_ai_cache")
      .select("original_url,title_ko,summary_ko,implication_ko,is_demo")
      .in("original_url", uniq.slice(i, i + 200));
    for (const r of data ?? []) {
      out.set(r.original_url as string, { title_ko: r.title_ko, summary_ko: r.summary_ko, implication_ko: r.implication_ko, is_demo: r.is_demo });
    }
  }
  return out;
}

/** 사용자 "한국어로 보기" 설정 (기본 켜짐) */
export async function getTranslatePref(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("translate_ko").eq("id", userId).maybeSingle();
  return data?.translate_ko ?? true;
}
