import Link from "next/link";
import { ArrowRight, Brain, CalendarDays, FileText, Hash, Sparkles, UserCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countContent, getSavedContentIds, listContent } from "@/lib/queries";
import { dailyBuckets, rankContent, topKeywords } from "@/lib/content";
import { daysAgoIso, formatDate, formatDateTime, startOfTodayKstIso } from "@/lib/utils";
import { ContentCard } from "@/components/content/content-card";
import { CollectionChart } from "@/components/dashboard/collection-chart";
import { SourceBadge } from "@/components/sources/source-badge";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import type { ContentItem } from "@/lib/types";

export const metadata = { title: "Dashboard" };

function Stat({ icon: Icon, label, value, hint }: { icon: typeof FileText; label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
          {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionLink({ href, label = "전체 보기" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

function TopList({ title, items, ranked, saved, scope }: { title: string; items: ContentItem[]; ranked: boolean; saved: Set<string>; scope: string }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {ranked ? "출처 제공 인기 지표순" : "인기 지표 없음 · 게시일 최신순"} · 집계 범위: {scope}
          </CardDescription>
        </div>
        <SectionLink href="/trending" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.length === 0 ? (
          <EmptyState title="해당 기간 콘텐츠가 없습니다" description="Phase 2에서 RSS·공개 API 수집이 활성화되면 표시됩니다." />
        ) : (
          items.map((it, idx) => <ContentCard key={it.id} item={it} saved={saved.has(it.id)} rank={idx + 1} compact />)
        )}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const todayIso = startOfTodayKstIso();
  const weekIso = daysAgoIso(7);

  const [total, newToday, weekItems, saved, topicsRes, followingRes, briefingRes, influencersRes] = await Promise.all([
    countContent(user.id),
    countContent(user.id, todayIso),
    listContent(user.id, { sinceIso: weekIso, limit: 200 }),
    getSavedContentIds(user.id),
    supabase
      .from("topics")
      .select("id,name,priority,content_topics(content:content_items!inner(id,title,original_url,published_at,collected_at))")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(10),
    supabase
      .from("influencer_links")
      .select("id,url,title,posted_at,created_at,influencer:influencers!inner(id,name,company,is_following,is_active)")
      .eq("user_id", user.id)
      .eq("influencer.is_following", true)
      .eq("influencer.is_active", true)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("daily_briefings")
      .select("briefing_date,content,generated_at,is_demo")
      .eq("user_id", user.id)
      .order("briefing_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("influencers")
      .select("id,name,company,job_title,category")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("is_following", false)
      .limit(4),
  ]);

  const dayIso = daysAgoIso(1);
  const daily = rankContent(weekItems.filter((i) => (i.published_at ?? i.collected_at) >= dayIso), 10);
  const weekly = rankContent(weekItems, 10);
  const keywords = topKeywords(weekItems);

  // 주제별 최근 7일 업데이트
  type TopicRow = { id: string; name: string; priority: number; content_topics: { content: { id: string; title: string; original_url: string; published_at: string | null; collected_at: string } }[] };
  const topics = ((topicsRes.data ?? []) as unknown as TopicRow[]).map((t) => {
    const recent = t.content_topics
      .map((ct) => ct.content)
      .filter((c) => (c.published_at ?? c.collected_at) >= weekIso)
      .sort((a, b) => (b.published_at ?? b.collected_at).localeCompare(a.published_at ?? a.collected_at));
    return { ...t, recent };
  });
  const topicUpdates = topics.reduce((n, t) => n + t.recent.length, 0);

  const chart = dailyBuckets(weekItems, 7);

  const sourceCounts = new Map<string, { item: ContentItem; count: number }>();
  for (const it of weekItems) {
    const k = it.source?.slug ?? it.source_name;
    const cur = sourceCounts.get(k);
    if (cur) cur.count += 1;
    else sourceCounts.set(k, { item: it, count: 1 });
  }

  type FollowRow = { id: string; url: string; title: string | null; posted_at: string | null; created_at: string; influencer: { name: string; company: string | null } };
  const following = (followingRes.data ?? []) as unknown as FollowRow[];
  const hasDemo = weekItems.some((i) => i.provenance === "demo");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDate(new Date())} (KST)
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">안녕하세요, {user.name}님</h1>
        </div>
        {hasDemo ? (
          <Badge variant="demo" className="text-xs">
            일부 콘텐츠는 DEMO DATA입니다 · 실제 수집 데이터 아님
          </Badge>
        ) : null}
      </div>

      <section aria-label="요약 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={FileText} label="전체 콘텐츠" value={total.toLocaleString("ko-KR")} />
        <Stat icon={Sparkles} label="오늘 신규 콘텐츠" value={newToday.toLocaleString("ko-KR")} hint="KST 00:00 이후 수집" />
        <Stat icon={Hash} label="관심 주제 업데이트" value={topicUpdates} hint="최근 7일" />
        <Stat icon={UserCheck} label="팔로잉 업데이트" value={following.length} hint="최근 등록 링크" />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-primary" aria-hidden="true" /> Today&apos;s Intelligence
            </CardTitle>
            <CardDescription>최근 7일 수집 콘텐츠 기준 키워드 빈도 · AI 분석 아님</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              {keywords.length === 0 ? (
                <p className="text-xs text-muted-foreground">집계할 키워드가 없습니다.</p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {keywords.map((k, i) => (
                    <li key={k.keyword} className="flex items-center justify-between text-sm">
                      <span>
                        <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}</span>#{k.keyword}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">{k.count}건</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">최근 7일 신규 콘텐츠</p>
              <CollectionChart data={chart} />
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                {[...sourceCounts.values()].map(({ item, count }) => (
                  <span key={item.source?.slug ?? item.source_name} className="inline-flex items-center gap-1">
                    <SourceBadge
                      name={item.source_name}
                      sourceType={item.source_type}
                      logoKey={item.source?.logo_key}
                      url={item.original_url}
                      provenance={item.provenance}
                      size="xs"
                      showType={false}
                    />
                    <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> AI Daily Briefing
            </CardTitle>
            <CardDescription>매일 07:00 KST 생성 예정</CardDescription>
          </CardHeader>
          <CardContent>
            {briefingRes.data ? (
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">
                  {formatDate(briefingRes.data.briefing_date)} · 생성 {formatDateTime(briefingRes.data.generated_at)}
                </p>
                {briefingRes.data.is_demo ? <Badge variant="demo">DEMO DATA</Badge> : null}
              </div>
            ) : (
              <EmptyState
                title="아직 생성된 브리핑이 없습니다"
                description="AI 브리핑은 Phase 3에서 활성화됩니다. AI 처리가 허용된 콘텐츠만 사용합니다."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopList title="Daily Top 10" items={daily.items} ranked={daily.ranked} saved={saved} scope="내 수집 콘텐츠 · 최근 24시간" />
        <TopList title="Weekly Top 10" items={weekly.items} ranked={weekly.ranked} saved={saved} scope="내 수집 콘텐츠 · 최근 7일" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>My Topics Update</CardTitle>
              <CardDescription>주제별 최근 7일 콘텐츠</CardDescription>
            </div>
            <SectionLink href="/topics" />
          </CardHeader>
          <CardContent>
            {topics.length === 0 ? (
              <EmptyState title="활성 주제가 없습니다" action={<SectionLink href="/topics" label="주제 추가" />} />
            ) : (
              <ul className="flex flex-col divide-y">
                {topics.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/topics/${t.id}`} className="min-w-0">
                      <p className="truncate text-sm font-medium hover:text-primary">{t.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{t.recent[0]?.title ?? "새 콘텐츠 없음"}</p>
                    </Link>
                    <Badge variant={t.recent.length ? "default" : "outline"}>{t.recent.length}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>My Following Update</CardTitle>
              <CardDescription>직접 등록한 인물의 최신 콘텐츠 링크</CardDescription>
            </div>
            <SectionLink href="/following" />
          </CardHeader>
          <CardContent>
            {following.length === 0 ? (
              <EmptyState title="등록된 콘텐츠 링크가 없습니다" description="My Following에서 인물과 게시글 링크를 추가하세요." />
            ) : (
              <ul className="flex flex-col divide-y">
                {following.map((f) => (
                  <li key={f.id} className="py-2">
                    <SourceBadge name={f.influencer.name} sourceType="user_provided" url={f.url} size="xs" showType={false} />
                    <a href={f.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 line-clamp-1 block text-sm hover:text-primary">
                      {f.title ?? f.url}
                    </a>
                    <p className="text-[11px] text-muted-foreground">
                      {f.influencer.name}
                      {f.influencer.company ? ` · ${f.influencer.company}` : ""} · {formatDate(f.posted_at ?? f.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Recommended Influencers</CardTitle>
              <CardDescription>등록했지만 아직 팔로우하지 않은 인물</CardDescription>
            </div>
            <SectionLink href="/influencers" />
          </CardHeader>
          <CardContent>
            {(influencersRes.data ?? []).length === 0 ? (
              <EmptyState
                title="추천할 인물이 없습니다"
                description="검증 가능한 데이터가 없어 자동 추천은 제공하지 않습니다. Influencers 메뉴에서 인물을 등록하세요."
              />
            ) : (
              <ul className="flex flex-col divide-y">
                {(influencersRes.data ?? []).map((p) => (
                  <li key={p.id} className="py-2">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">{[p.job_title, p.company].filter(Boolean).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
