import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/primitives";
import { TopicList } from "./topic-list";
import type { Topic } from "@/lib/types";

export const metadata = { title: "My Topics" };

export default async function TopicsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("topics")
    .select("id,name,description,keywords,search_queries,priority,language,is_active,last_collected_at,created_at,content_topics(count)")
    .eq("user_id", user.id)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error("주제를 불러오지 못했습니다.");

  type Row = Topic & { content_topics: { count: number }[] };
  const rows = (data ?? []) as unknown as Row[];
  const counts = Object.fromEntries(rows.map((r) => [r.id, r.content_topics?.[0]?.count ?? 0]));
  const topics: Topic[] = rows.map((r) => {
    const t: Partial<Row> = { ...r };
    delete t.content_topics;
    return t as Topic;
  });

  return (
    <>
      <PageHeader title="My Topics" description="관심 주제를 등록하면 키워드·검색 쿼리로 관련 콘텐츠를 수집·분류합니다. (자동 수집은 Phase 2)" />
      <TopicList topics={topics} counts={counts} />
    </>
  );
}
