import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { disabledSourceIdsFor, hiddenSourceFilter } from "@/lib/source-settings";
import { computeDailyStats, groupByStatDate, recentKstDates, type StatItem } from "./compute";

/**
 * 일자별 통계 저장 (요구사항 3)
 * - 수집 후 최근 3일 재계산(늦게 들어온 콘텐츠 반영), 수동 갱신은 최근 90일
 * - 콘텐츠가 0건인 날은 저장하지 않음 (차트에서 0으로 표시)
 */
export async function refreshDailyStats(userId: string, days: number): Promise<{ ok: boolean; days: number; message?: string }> {
  const db = createAdminClient();
  if (!db) return { ok: false, days: 0, message: "SUPABASE_SECRET_KEY 미설정" };
  const dates = recentKstDates(days);
  // KST 첫날 00:00 이전부터 넉넉히 조회 (UTC 기준 하루 여유)
  const since = new Date(Date.parse(`${dates[0]}T00:00:00+09:00`) - 86400000).toISOString();
  const hidden = hiddenSourceFilter(await disabledSourceIdsFor(db, userId));

  const items: StatItem[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    let q = db
      .from("content_items")
      .select(
        "id,title,original_url,source_name,source_id,published_at,collected_at,language,content_type,keywords,popularity,provenance,source:data_sources(slug),content_topics(topic_id)",
      )
      .eq("user_id", userId)
      .eq("display_allowed", true)
      .or(`published_at.gte.${since},and(published_at.is.null,collected_at.gte.${since})`)
      .order("id")
      .range(from, from + PAGE - 1);
    if (hidden) q = q.or(hidden);
    const { data, error } = await q;
    if (error) return { ok: false, days: 0, message: "통계용 콘텐츠를 불러오지 못했습니다." };
    type Row = Omit<StatItem, "topic_ids"> & { content_topics: { topic_id: string }[] };
    for (const { content_topics, ...r } of (data ?? []) as unknown as Row[]) items.push({ ...r, topic_ids: content_topics.map((t) => t.topic_id) });
    if ((data ?? []).length < PAGE) break;
  }

  const { data: topics } = await db.from("topics").select("id,name").eq("user_id", userId);
  const grouped = groupByStatDate(items, dates);
  const rows = [...grouped.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([stat_date, list]) => ({ user_id: userId, stat_date, data: computeDailyStats(list, topics ?? []), updated_at: new Date().toISOString() }));
  // 이번 범위에서 0건이 된 날짜(소스를 끈 경우 등)는 삭제해 화면과 일치시킴
  const empty = [...grouped.entries()].filter(([, list]) => list.length === 0).map(([d]) => d);
  if (empty.length) await db.from("daily_stats").delete().eq("user_id", userId).in("stat_date", empty);
  if (rows.length) {
    const { error } = await db.from("daily_stats").upsert(rows, { onConflict: "user_id,stat_date" });
    if (error) return { ok: false, days: 0, message: "통계를 저장하지 못했습니다." };
  }
  return { ok: true, days: rows.length };
}

/** Cron: 전체 사용자 최근 3일 + 2년 지난 통계 삭제 */
export async function refreshAllStats() {
  const db = createAdminClient();
  if (!db) return { users: 0 };
  const { data: users } = await db.from("profiles").select("id");
  for (const u of users ?? []) await refreshDailyStats(u.id as string, 3);
  await db.rpc("purge_old_stats");
  return { users: (users ?? []).length };
}
