import Form from "next/form";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_SELECT, type SavedPost } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { ContentCard } from "@/components/content/content-card";
import { TranslateToggle } from "@/components/content/translate-toggle";
import { getAIMeta, getTranslatePref } from "@/lib/queries";
import { Badge, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Knowledge Base" };

export default async function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100).toLowerCase() : "";
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("saved_posts")
    .select(`id,notes,tags,folder_id,in_knowledge_base,created_at,content:content_items!inner(${CONTENT_SELECT})`)
    .eq("user_id", user.id)
    .eq("in_knowledge_base", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Knowledge Base를 불러오지 못했습니다.");

  let items = (data ?? []) as unknown as SavedPost[];
  // 한국어로 보기: 번역(공유 캐시)과 사용자 설정
  const [meta, translate] = await Promise.all([getAIMeta(items.map((p) => p.content.original_url)), getTranslatePref(user.id)]);
  if (q) {
    items = items.filter((p) =>
      [p.content.title, p.content.summary, meta.get(p.content.original_url)?.title_ko, meta.get(p.content.original_url)?.summary_ko, p.notes, ...p.tags, ...p.content.keywords].filter(Boolean).some((s) => (s as string).toLowerCase().includes(q)),
    );
  }

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description="Saved Posts에서 'Knowledge Base에 추가'한 콘텐츠를 개인 지식으로 관리합니다. RAG 기반 의미 검색은 Phase 4에서 추가됩니다."
        actions={<TranslateToggle on={translate} />}
      />
      <Form action="/knowledge" className="mb-4 flex gap-2" role="search">
        <label htmlFor="kb-q" className="sr-only">
          지식 검색
        </label>
        <Input id="kb-q" name="q" defaultValue={q} placeholder="제목, 메모, 태그, 키워드 검색" className="max-w-sm" maxLength={100} />
        <Button type="submit" variant="secondary">
          검색
        </Button>
      </Form>
      {items.length === 0 ? (
        <EmptyState title="Knowledge Base가 비어 있습니다" description="Saved Posts에서 편집 버튼을 눌러 'Knowledge Base에 추가'를 켜세요." />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((p) => (
            <ContentCard
              key={p.id}
              item={p.content}
              saved
              ai={meta.get(p.content.original_url)}
              translate={translate}
              footer={
                <div className="mt-2 flex flex-col gap-1.5 text-xs">
                  {p.notes ? <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-2">{p.notes}</p> : null}
                  <div className="flex flex-wrap items-center gap-1">
                    {p.tags.map((t) => (
                      <Badge key={t} variant="default">
                        {t}
                      </Badge>
                    ))}
                    <span className="text-[11px] text-muted-foreground">저장 {formatDate(p.created_at)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      · AI 요약/인사이트: {p.content.ai_processing_allowed ? "Phase 3에서 생성" : "권한 미확인으로 실행 안 함"}
                    </span>
                  </div>
                </div>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
