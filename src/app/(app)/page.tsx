import Link from "next/link";
import { ArrowRight, Brain, CalendarDays, FileText, Hash, Sparkles, UserCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countContent, getSavedContentIds, listContent } from "@/lib/queries";
import { dailyBuckets, rankContent, topKeywords } from "@/lib/content";
import { resolveSourceLogo } from "@/lib/sources/registry";
import { daysAgoIso, formatDate, formatDateTime, startOfTodayKstIso } from "@/lib/utils";
import { ContentCard } from "@/components/content/content-card";
import { CollectionChart } from "@/components/dashboard/collection-chart";
import { TopicUpdateList, type TopicUpdate } from "@/components/dashboard/topic-update-list";
import { SourceBadge } from "@/components/sources/source-badge";
import { InfoTip } from "@/components/info-tip";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import type { ContentItem } from "@/lib/types";

export const metadata = { title: "Dashboard" };

/* ---------- 항목 설명 (InfoTip) ---------- */
const HELP = {
  total: ["내 계정에 저장된 모든 콘텐츠 수입니다.", "자동 수집, URL 직접 등록, DEMO 예시 콘텐츠를 모두 포함합니다."],
  today: ["오늘(KST 00:00 이후) 새로 수집되거나 등록된 콘텐츠 수입니다.", "게시일이 아니라 이 서비스에 들어온 시각 기준입니다."],
  topics: [
    "최근 7일 동안 활성 관심 주제에 연결된 콘텐츠 수의 합입니다.",
    "한 콘텐츠가 여러 주제와 일치하면 주제마다 셉니다. 비활성 주제는 제외합니다.",
  ],
  following: ["My Following에 등록한 인물의 콘텐츠 링크 중 최근 등록된 항목 수입니다 (최대 6건).", "LinkedIn에서 자동으로 가져오지 않습니다."],
  intelligence: [
    "최근 7일 콘텐츠에 가장 많이 등장한 키워드 순위입니다. 콘텐츠 하나당 한 번만 셉니다.",
    "키워드는 관심 주제와 일치한 단어와 출처가 붙인 태그를 정리한 것입니다. arXiv 분류 코드(cs.AI 등)는 읽기 쉬운 이름으로 바꾸고, 단수·복수형은 합칩니다.",
    "AI 분석 결과가 아닙니다. 키워드를 누르면 그 키워드가 포함된 콘텐츠만 Trending에서 볼 수 있습니다.",
  ],
  chart: [
    "콘텐츠가 실제로 게시된 날짜별 개수입니다. 출처가 게시일을 주지 않은 콘텐츠는 수집일로 셉니다.",
    "아래 로고는 최근 7일 출처별 건수입니다.",
  ],
  briefing: [
    "매일 07:00 KST에 AI가 오늘의 주요 트렌드·신규 콘텐츠·주제별 변화를 정리합니다 (Phase 3에서 제공).",
    "AI 처리 권한이 확인된 콘텐츠만 사용하며, 권한이 없는 콘텐츠는 외부 AI로 보내지 않습니다.",
  ],
  top: [
    "출처가 직접 제공한 인기 지표로 순위를 매깁니다 (Hacker News points, GitHub stars, Hugging Face likes).",
    "출처마다 숫자 규모가 달라 원래 숫자를 직접 비교하지 않고, 각 출처 안에서의 순위로 바꿔 비교합니다. 같은 출처가 연달아 뽑힐수록 점수를 낮춰 한 출처가 상위를 독점하지 않게 합니다.",
    "지표가 없는 블로그·논문은 게시일 최신순으로 뒤에 붙습니다. 내가 수집한 콘텐츠 안의 순위이며 LinkedIn 전체 순위가 아닙니다.",
  ],
  topicUpdate: ["활성 관심 주제별로 최근 7일 연결된 콘텐츠 수입니다.", "행을 누르면 최신 콘텐츠 5건이 펼쳐지고, 제목을 누르면 상세 내용을 볼 수 있습니다."],
  followingUpdate: ["My Following에서 직접 등록한 인물의 게시글·블로그 링크입니다.", "제목을 누르면 원문이 새 탭에서 열립니다."],
  recommended: [
    "Influencers 메뉴에 등록했지만 아직 팔로우하지 않은 인물입니다.",
    "팔로워 수·영향력 같은 검증 가능한 데이터가 없어 자동 추천은 하지 않습니다.",
  ],
} as const;

function Help({ label, lines, align }: { label: string; lines: readonly string[]; align?: "left" | "right" }) {
  return (
    <InfoTip label={label} align={align}>
      {lines.map((l) => (
        <span key={l} className="block">
          {l}
        </span>
      ))}
    </InfoTip>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  help,
  align,
}: {
  icon: typeof FileText;
  label: string;
  value: string | number;
  hint?: string;
  help: readonly string[];
  align?: "left" | "right";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {label} <Help label={label} lines={help} align={align} />
          </p>
          <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
          {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionLink({ href, label = "전체 보기" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

function TopList({
  title,
  items,
  ranked,
  notes,
  saved,
  scope,
  href,
  align,
}: {
  title: string;
  items: ContentItem[];
  ranked: boolean;
  notes: Record<string, string>;
  saved: Set<string>;
  scope: string;
  href: string;
  align?: "left" | "right";
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-1.5">
            {title} <Help label={title} lines={HELP.top} align={align} />
          </CardTitle>
          <CardDescription>
            {ranked ? "출처별 순위로 정규화한 인기순" : "인기 지표 없음 · 게시일 최신순"} · 집계 범위: {scope}
          </CardDescription>
        </div>
        <SectionLink href={href} />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.length === 0 ? (
          <EmptyState title="해당 기간 콘텐츠가 없습니다" description="Settings에서 '지금 수집'을 실행하거나 다음 자동 수집(06:00 KST)을 기다려 주세요." />
        ) : (
          items.map((it, idx) => (
            <ContentCard key={it.id} item={it} saved={saved.has(it.id)} rank={idx + 1} rankNote={notes[it.id]} compact />
          ))
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
    listContent(user.id, { sinceIso: weekIso, limit: 300 }),
    getSavedContentIds(user.id),
    supabase
      .from("topics")
      .select(
        "id,name,priority,content_topics(content:content_items!inner(id,title,original_url,published_at,collected_at,provenance,source_name,source:data_sources(logo_key,homepage_url,brand_color)))",
      )
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

  // 주제별 최근 7일 업데이트 (펼치기용 최신 5건 포함)
  type TopicContent = {
    id: string;
    title: string;
    original_url: string;
    published_at: string | null;
    collected_at: string;
    provenance: string;
    source_name: string;
    source: { logo_key: string | null; homepage_url: string | null; brand_color: string | null } | null;
  };
  type TopicRow = { id: string; name: string; priority: number; content_topics: { content: TopicContent }[] };
  const topics: TopicUpdate[] = ((topicsRes.data ?? []) as unknown as TopicRow[]).map((t) => {
    const recent = t.content_topics
      .map((ct) => ct.content)
      .filter((c) => (c.published_at ?? c.collected_at) >= weekIso)
      .sort((a, b) => (b.published_at ?? b.collected_at).localeCompare(a.published_at ?? a.collected_at));
    return {
      id: t.id,
      name: t.name,
      count: recent.length,
      items: recent.slice(0, 5).map((c) => ({
        id: c.id,
        title: c.title,
        date: c.published_at ?? c.collected_at,
        sourceName: c.source_name,
        logo: resolveSourceLogo({
          logoKey: c.source?.logo_key,
          url: c.original_url,
          homepageUrl: c.source?.homepage_url,
          brandColor: c.source?.brand_color,
          name: c.source_name,
          isDemo: c.provenance === "demo",
        }),
      })),
    };
  });
  const topicUpdates = topics.reduce((n, t) => n + t.count, 0);

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
          <p className="mt-1 text-xs text-muted-foreground">각 항목 제목 옆 ⓘ 를 누르면 설명을, 콘텐츠 제목을 누르면 상세 내용을 볼 수 있습니다.</p>
        </div>
        {hasDemo ? (
          <Badge variant="demo" className="text-xs">
            일부 콘텐츠는 DEMO DATA입니다 · 실제 수집 데이터 아님
          </Badge>
        ) : null}
      </div>

      <section aria-label="요약 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={FileText} label="전체 콘텐츠" value={total.toLocaleString("ko-KR")} help={HELP.total} />
        <Stat icon={Sparkles} label="오늘 신규 콘텐츠" value={newToday.toLocaleString("ko-KR")} hint="KST 00:00 이후 수집" help={HELP.today} />
        <Stat icon={Hash} label="관심 주제 업데이트" value={topicUpdates} hint="최근 7일" help={HELP.topics} align="right" />
        <Stat icon={UserCheck} label="팔로잉 업데이트" value={following.length} hint="최근 등록 링크" help={HELP.following} align="right" />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-primary" aria-hidden="true" /> Today&apos;s Intelligence
              <Help label="Today's Intelligence" lines={HELP.intelligence} />
            </CardTitle>
            <CardDescription>최근 7일 콘텐츠 키워드 빈도 · AI 분석 아님 · 키워드를 누르면 관련 콘텐츠로 이동</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              {keywords.length === 0 ? (
                <p className="text-xs text-muted-foreground">집계할 키워드가 없습니다.</p>
              ) : (
                <ol className="flex flex-col gap-0.5" aria-label="최근 7일 키워드 순위">
                  {keywords.map((k, i) => (
                    <li key={k.keyword}>
                      <Link
                        href={`/trending?period=weekly&limit=50&kw=${encodeURIComponent(k.keyword)}`}
                        className="flex items-center justify-between rounded-md px-1 py-0.5 text-sm hover:bg-accent"
                      >
                        <span>
                          <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}</span>#{k.keyword}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">{k.count}건</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                최근 7일 콘텐츠 (게시일 기준) <Help label="일자별 콘텐츠 차트" lines={HELP.chart} align="right" />
              </p>
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
              <Help label="AI Daily Briefing" lines={HELP.briefing} align="right" />
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
        <TopList
          title="Daily Top 10"
          items={daily.items}
          ranked={daily.ranked}
          notes={daily.notes}
          saved={saved}
          scope="내 수집 콘텐츠 · 최근 24시간"
          href="/trending?period=daily&limit=10"
        />
        <TopList
          title="Weekly Top 10"
          items={weekly.items}
          ranked={weekly.ranked}
          notes={weekly.notes}
          saved={saved}
          scope="내 수집 콘텐츠 · 최근 7일"
          href="/trending?period=weekly&limit=10"
          align="right"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-1.5">
                My Topics Update <Help label="My Topics Update" lines={HELP.topicUpdate} />
              </CardTitle>
              <CardDescription>주제별 최근 7일 콘텐츠 · 행을 눌러 펼치기</CardDescription>
            </div>
            <SectionLink href="/topics" />
          </CardHeader>
          <CardContent>
            {topics.length === 0 ? (
              <EmptyState title="활성 주제가 없습니다" action={<SectionLink href="/topics" label="주제 추가" />} />
            ) : (
              <TopicUpdateList topics={topics} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-1.5">
                My Following Update <Help label="My Following Update" lines={HELP.followingUpdate} />
              </CardTitle>
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
              <CardTitle className="flex items-center gap-1.5">
                Recommended Influencers <Help label="Recommended Influencers" lines={HELP.recommended} align="right" />
              </CardTitle>
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
                    <Link href={`/influencers?q=${encodeURIComponent(p.name)}`} className="text-sm font-medium hover:text-primary">
                      {p.name}
                    </Link>
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
