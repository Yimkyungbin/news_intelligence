import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSavedContentIds, listContent } from "@/lib/queries";
import { topKeywords } from "@/lib/content";
import { formatDate } from "@/lib/utils";
import { ContentCard } from "@/components/content/content-card";
import { TopicInsightCard } from "@/components/briefing/topic-insight-card";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";

// AI 인사이트 생성(Server Action) 실행 시간 상한
export const maxDuration = 300;

export default async function TopicDetailPage({ params }: PageProps<"/topics/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const supabase = await createClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id,name,description,keywords,search_queries,priority,language,is_active,last_collected_at,created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!topic) notFound();

  const [items, saved, insightRes] = await Promise.all([
    listContent(user.id, { topicId: id, limit: 50 }),
    getSavedContentIds(user.id),
    supabase
      .from("topic_insights")
      .select("content,model_name,is_demo,generated_at,source_ids")
      .eq("topic_id", id)
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const kw = topKeywords(items, 10);

  return (
    <>
      <Link href="/topics" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> My Topics
      </Link>
      <PageHeader title={topic.name} description={topic.description ?? undefined} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-2 lg:col-span-2">
          <h2 className="text-sm font-semibold">최신 콘텐츠 ({items.length})</h2>
          {items.length === 0 ? (
            <EmptyState title="연결된 콘텐츠가 없습니다" description="Phase 2 수집이 활성화되면 키워드와 일치하는 콘텐츠가 자동 분류됩니다." />
          ) : (
            items.map((it) => <ContentCard key={it.id} item={it} saved={saved.has(it.id)} />)
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>주제 설정</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-xs">
              <p>
                우선순위 <b>P{topic.priority}</b> · 언어 <b>{topic.language}</b> ·{" "}
                <Badge variant={topic.is_active ? "success" : "outline"}>{topic.is_active ? "수집 중" : "중지"}</Badge>
              </p>
              <div className="flex flex-wrap gap-1">
                {topic.keywords.map((k: string) => (
                  <Badge key={k} variant="secondary">
                    {k}
                  </Badge>
                ))}
              </div>
              <ul className="list-disc pl-4 text-muted-foreground">
                {topic.search_queries.map((q: string) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                생성 {formatDate(topic.created_at)} · 마지막 수집 {topic.last_collected_at ? formatDate(topic.last_collected_at) : "없음"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>주제 트렌드</CardTitle>
              <CardDescription>연결 콘텐츠 키워드 빈도</CardDescription>
            </CardHeader>
            <CardContent>
              {kw.length === 0 ? (
                <p className="text-xs text-muted-foreground">데이터 없음</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {kw.map((k) => (
                    <li key={k.keyword} className="flex justify-between">
                      <span>#{k.keyword}</span>
                      <span className="text-xs text-muted-foreground">{k.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <TopicInsightCard topicId={topic.id} insight={insightRes.data} allowedCount={items.filter((i) => i.ai_processing_allowed).length} totalCount={items.length} />
        </div>
      </div>
    </>
  );
}
