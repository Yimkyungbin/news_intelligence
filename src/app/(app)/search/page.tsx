import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSavedContentIds } from "@/lib/queries";
import { CONTENT_SELECT, type ContentItem } from "@/lib/types";
import { ContentCard } from "@/components/content/content-card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "검색" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const raw = typeof sp.q === "string" ? sp.q : "";
  // PostgREST 필터 구문 문자를 제거해 주입 방지
  const term = raw.replace(/[,()*%\\]/g, " ").trim().slice(0, 100);
  const user = await requireUser();

  if (!term) {
    return (
      <>
        <PageHeader title="검색" />
        <EmptyState title="검색어를 입력하세요" />
      </>
    );
  }

  const supabase = await createClient();
  const like = `%${term}%`;
  const [contents, topics, people, saved] = await Promise.all([
    supabase.from("content_items").select(CONTENT_SELECT).eq("user_id", user.id).or(`title.ilike.${like},summary.ilike.${like},author.ilike.${like}`).limit(30),
    supabase.from("topics").select("id,name,description").eq("user_id", user.id).ilike("name", like).limit(10),
    supabase.from("influencers").select("id,name,company,is_following").eq("user_id", user.id).or(`name.ilike.${like},company.ilike.${like}`).limit(10),
    getSavedContentIds(user.id),
  ]);
  const items = (contents.data ?? []) as unknown as ContentItem[];

  return (
    <>
      <PageHeader title={`'${term}' 검색 결과`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">콘텐츠 ({items.length})</h2>
          {items.length ? items.map((it) => <ContentCard key={it.id} item={it} saved={saved.has(it.id)} />) : <EmptyState title="일치하는 콘텐츠가 없습니다" />}
        </section>
        <aside className="flex flex-col gap-4">
          <div>
            <h2 className="mb-1.5 text-sm font-semibold">주제</h2>
            {(topics.data ?? []).length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {(topics.data ?? []).map((t) => (
                  <li key={t.id}>
                    <Link href={`/topics/${t.id}`} className="hover:text-primary">
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">없음</p>
            )}
          </div>
          <div>
            <h2 className="mb-1.5 text-sm font-semibold">인물</h2>
            {(people.data ?? []).length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {(people.data ?? []).map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Link href={p.is_following ? "/following" : `/influencers?q=${encodeURIComponent(p.name)}`} className="hover:text-primary">
                      {p.name}
                    </Link>
                    {p.company ? <span className="text-xs text-muted-foreground">{p.company}</span> : null}
                    {p.is_following ? <Badge>Following</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">없음</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
