import Link from "next/link";
import Form from "next/form";
import { Folder as FolderIcon, X } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_SELECT, type Folder, type SavedPost } from "@/lib/types";
import { ContentCard } from "@/components/content/content-card";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { AddManualContent, NewFolderForm, SavedPostEditor } from "./saved-forms";
import { deleteFolder } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Saved Posts" };

export default async function SavedPage({ searchParams }: PageProps<"/saved">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100).toLowerCase() : "";
  const tag = typeof sp.tag === "string" ? sp.tag.slice(0, 40) : "";
  const folder = typeof sp.folder === "string" && z.uuid().safeParse(sp.folder).success ? sp.folder : "";

  const user = await requireUser();
  const supabase = await createClient();

  let query = supabase
    .from("saved_posts")
    .select(`id,notes,tags,folder_id,in_knowledge_base,created_at,content:content_items!inner(${CONTENT_SELECT})`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (folder) query = query.eq("folder_id", folder);
  if (tag) query = query.contains("tags", [tag]);

  const [{ data, error }, { data: folderRows }] = await Promise.all([
    query,
    supabase.from("saved_folders").select("id,name").eq("user_id", user.id).order("name"),
  ]);
  if (error) throw new Error("저장한 게시글을 불러오지 못했습니다.");

  const folders = (folderRows ?? []) as Folder[];
  let posts = (data ?? []) as unknown as SavedPost[];
  // 제목·요약·메모·태그·출처 텍스트 검색 (서버 측, 사용자 데이터 범위 내)
  if (q) {
    posts = posts.filter((p) =>
      [p.content.title, p.content.summary, p.notes, p.content.source_name, p.content.author, ...p.tags]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(q)),
    );
  }
  const allTags = [...new Set(((data ?? []) as unknown as SavedPost[]).flatMap((p) => p.tags))].sort();

  const linkFor = (params: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q && { q }), ...(tag && { tag }), ...(folder && { folder }), ...params });
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    const s = u.toString();
    return s ? `/saved?${s}` : "/saved";
  };

  return (
    <>
      <PageHeader title="Saved Posts" description="북마크한 콘텐츠를 폴더·태그·메모로 관리합니다." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-4" aria-label="폴더 및 태그">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">폴더</p>
            <ul className="flex flex-col gap-0.5 text-sm">
              <li>
                <Link href={linkFor({ folder: "" })} className={cn("block rounded-md px-2 py-1 hover:bg-accent", !folder && "bg-accent font-medium")}>
                  전체
                </Link>
              </li>
              {folders.map((f) => (
                <li key={f.id} className="group flex items-center">
                  <Link
                    href={linkFor({ folder: f.id })}
                    className={cn("flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-accent", folder === f.id && "bg-accent font-medium")}
                  >
                    <FolderIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{f.name}</span>
                  </Link>
                  <ConfirmButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${f.name} 폴더 삭제`}
                    confirmText={`'${f.name}' 폴더를 삭제할까요? 게시글은 삭제되지 않습니다.`}
                    action={deleteFolder.bind(null, f.id)}
                  >
                    <X />
                  </ConfirmButton>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <NewFolderForm />
            </div>
          </div>
          {allTags.length ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">태그</p>
              <div className="flex flex-wrap gap-1">
                {allTags.map((t) => (
                  <Link key={t} href={linkFor({ tag: tag === t ? "" : t })}>
                    <Badge variant={tag === t ? "default" : "secondary"}>{t}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Form action="/saved" className="flex gap-2" role="search">
              {folder ? <input type="hidden" name="folder" value={folder} /> : null}
              {tag ? <input type="hidden" name="tag" value={tag} /> : null}
              <label htmlFor="saved-q" className="sr-only">
                저장 콘텐츠 검색
              </label>
              <Input id="saved-q" name="q" defaultValue={q} placeholder="제목, 메모, 태그 검색" className="w-64" maxLength={100} />
              <Button type="submit" variant="secondary">
                검색
              </Button>
            </Form>
            <AddManualContent folders={folders} />
          </div>

          {posts.length === 0 ? (
            <EmptyState
              title={q || tag || folder ? "조건에 맞는 저장 콘텐츠가 없습니다" : "저장한 콘텐츠가 없습니다"}
              description="콘텐츠 카드의 북마크 버튼을 누르거나 URL을 직접 등록하세요."
            />
          ) : (
            posts.map((p) => (
              <ContentCard
                key={p.id}
                item={p.content}
                saved
                footer={
                  <SavedPostEditor
                    savedId={p.id}
                    notes={p.notes}
                    tags={p.tags}
                    folderId={p.folder_id}
                    inKnowledgeBase={p.in_knowledge_base}
                    folders={folders}
                  />
                }
              />
            ))
          )}
        </section>
      </div>
    </>
  );
}
