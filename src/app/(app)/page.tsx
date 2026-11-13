import Link from "next/link";
import { ArrowRight, CalendarDays, Flame, Sparkles, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAIMeta, getSavedContentIds, getTranslatePref } from "@/lib/queries";
import { getDisabledSourceIds } from "@/lib/source-settings";
import { CATEGORIES, categoryDef, isCategorySlug } from "@/lib/categories";
import { BOARD_PERIODS, loadTrendBoard, type BoardPeriod } from "@/lib/trends/board";
import { resolveSourceLogo } from "@/lib/sources/registry";
import { cn, daysAgoIso, formatDate, formatDateTime } from "@/lib/utils";
import { TrendCard } from "@/components/trends/trend-card";
import { CategoryBarTable, RisingKeywordRows } from "@/components/trends/trend-overview";
import { TopicUpdateList, type TopicUpdate } from "@/components/dashboard/topic-update-list";
import { SourceBadge } from "@/components/sources/source-badge";
import { InfoTip } from "@/components/info-tip";
import { BriefingHero } from "@/components/briefing/briefing-view";
import { GenerateBriefingButton } from "@/components/briefing/ai-buttons";
import type { BriefingContent } from "@/lib/briefing/compose";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { TranslateToggle } from "@/components/content/translate-toggle";

export const metadata = { title: "Dashboard" };
// 브리핑 수동 생성(Server Action) 실행 시간 상한
export const maxDuration = 300;

/* ---------- 항목 설명 (InfoTip) ---------- */
const HELP = {
  overview: [
    "기간 콘텐츠를 8개 고정 카테고리로 나눈 건수와 비율입니다. 옅은 막대는 직전 같은 기간 건수, 오른쪽은 비중 변화(%p)입니다.",
    "카테고리는 제목·요약·키워드·콘텐츠 유형으로 규칙 기반 분류합니다 (AI 분석 아님). 행을 누르면 Trending 카테고리 탭에서 모아 봅니다.",
  ],
  rising: ["직전 같은 기간보다 많이 등장한 키워드입니다. 처음 등장한 키워드는 NEW로 표시합니다.", "선은 최근 7일 일별 등장 수, 행을 누르면 해당 키워드 콘텐츠를 Trending에서 봅니다."],
  briefing: [
    "매일 07:00 KST에 최근 24시간 콘텐츠를 정리합니다: 트렌드 TOP 5, 신규 콘텐츠 TOP 10, 주제별 업데이트, AI 핵심 인사이트, 전일 대비 변화.",
    "AI 핵심 인사이트만 AI가 만들며, 운영자가 AI 처리를 허용한 출처의 콘텐츠만 사용합니다. 나머지 섹션은 집계 결과입니다.",
    "'지금 생성'으로 직접 만들 수도 있습니다 (10분에 1회).",
  ],
  top: [
    "출처가 직접 제공한 인기 지표로 순위를 매깁니다 (Hacker News points, GitHub stars, Hugging Face likes 등).",
    "출처마다 숫자 규모가 달라 원래 숫자를 직접 비교하지 않고, 각 출처 안에서의 순위로 바꿔 비교합니다. 같은 출처가 연달아 뽑힐수록 점수를 낮춰 한 출처가 상위를 독점하지 않게 합니다.",
    "▲▼는 하루 전 시점 순위 대비 변동, NEW는 새로 진입한 콘텐츠입니다. 증가량은 매일 수집 때 기록한 지표 기준입니다.",
    "논문은 아래 '주목할 논문'에 따로 모읍니다. 내가 수집한 콘텐츠 안의 순위이며 LinkedIn 전체 순위가 아닙니다.",
  ],
  papers: [
    "arXiv, Hugging Face Daily Papers, OpenAlex에서 수집한 논문입니다.",
    "Hugging Face 추천 수, OpenAlex 인용 수를 출처 안의 순위로 비교하고, 지표가 없는 arXiv 논문은 최신순으로 뒤에 붙습니다.",
  ],
  topicUpdate: ["활성 관심 주제별로 최근 7일 연결된 콘텐츠 수입니다.", "행을 누르면 최신 콘텐츠 5건이 펼쳐지고, 제목을 누르면 상세 내용을 볼 수 있습니다."],
  followingUpdate: [
    "Influencers에서 팔로우한 인물의 게시글·블로그 링크입니다 (직접 등록).",
    "제목을 누르면 원문이 새 탭에서 열립니다. 아래 '팔로우 후보'는 등록했지만 아직 팔로우하지 않은 인물입니다.",
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

function SectionLink({ href, label = "전체 보기" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const period: BoardPeriod = sp.period === "weekly" ? "weekly" : "daily";
  const cat = isCategorySlug(sp.cat) ? sp.cat : "";
  const { label: periodLabel, compare } = BOARD_PERIODS[period];

  const user = await requireUser();
  const supabase = await createClient();
  const weekIso = daysAgoIso(7);

  const [board, saved, translate, topicsRes, followingRes, briefingRes, disabledIds] = await Promise.all([
    loadTrendBoard(user.id, period, cat),
    getSavedContentIds(user.id),
    getTranslatePref(user.id),
    supabase
      .from("topics")
      .select(
        "id,name,priority,content_topics(content:content_items!inner(id,source_id,title,original_url,language,published_at,collected_at,provenance,source_name,source:data_sources(logo_key,homepage_url,brand_color)))",
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
    supabase.from("daily_briefings").select("briefing_date,content,generated_at,is_demo").eq("user_id", user.id).order("briefing_date", { ascending: false }).limit(1).maybeSingle(),
    getDisabledSourceIds(user.id),
  ]);
  // 팔로우 후보(등록했지만 팔로우하지 않은 활성 인물) 수: Following Update 카드에서 Influencers 로 연결
  const { count: candidateCount = 0 } = await supabase
    .from("influencers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("is_following", false);
  const disabledSources = new Set(disabledIds);

  // 주제별 최근 7일 업데이트 (펼치기용 최신 5건 포함)
  type TopicContent = {
    id: string;
    source_id: string | null;
    title: string;
    original_url: string;
    language: string;
    published_at: string | null;
    collected_at: string;
    provenance: string;
    source_name: string;
    source: { logo_key: string | null; homepage_url: string | null; brand_color: string | null } | null;
  };
  type TopicRow = { id: string; name: string; priority: number; content_topics: { content: TopicContent }[] };
  const topicRows = ((topicsRes.data ?? []) as unknown as TopicRow[]).map((t) => ({
    ...t,
    recent: t.content_topics
      .map((ct) => ct.content)
      .filter((c) => (c.published_at ?? c.collected_at) >= weekIso && !(c.source_id && disabledSources.has(c.source_id)))
      .sort((a, b) => (b.published_at ?? b.collected_at).localeCompare(a.published_at ?? a.collected_at)),
  }));
  // 한국어로 보기: 펼치기 목록(주제별 최신 5건) 제목도 번역 표시
  const topicMeta = translate ? await getAIMeta(topicRows.flatMap((t) => t.recent.slice(0, 5).map((c) => c.original_url))) : new Map();
  const topicTitle = (c: TopicContent) => (translate && c.language !== "ko" && topicMeta.get(c.original_url)?.title_ko) || c.title;
  const topics: TopicUpdate[] = topicRows.map((t) => {
    const recent = t.recent;
    return {
      id: t.id,
      name: t.name,
      count: recent.length,
      items: recent.slice(0, 5).map((c) => ({
        id: c.id,
        title: topicTitle(c),
        date: c.published_at ?? c.collected_at,
        sourceName: c.source_name,
        logo: resolveSourceLogo({ logoKey: c.source?.logo_key, url: c.original_url, homepageUrl: c.source?.homepage_url, brandColor: c.source?.brand_color, name: c.source_name, isDemo: c.provenance === "demo" }),
      })),
    };
  });

  type FollowRow = { id: string; url: string; title: string | null; posted_at: string | null; created_at: string; influencer: { name: string; company: string | null } };
  const following = (followingRes.data ?? []) as unknown as FollowRow[];

  const href = (patch: { period?: BoardPeriod; cat?: string }) => {
    const u = new URLSearchParams();
    u.set("period", patch.period ?? period);
    const c = patch.cat ?? cat;
    if (c) u.set("cat", c);
    return `/?${u.toString()}`;
  };
  const diff = board.total - board.previousTotal;
  const catLabel = categoryDef(cat)?.label;
  const topTitle = `${periodLabel} Top 10`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDate(new Date())} (KST) · {user.name}님
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">오늘의 트렌드</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {periodLabel === "Daily" ? "최근 24시간" : "최근 7일"} 콘텐츠 {board.total.toLocaleString("ko-KR")}건 · {compare} 같은 기간 대비 {diff >= 0 ? `+${diff}` : diff}건 · 수치 통계는{" "}
            <Link href="/statistics" className="text-primary hover:underline">
              Statistics
            </Link>
          </p>
        </div>
        <TranslateToggle on={translate} />
      </div>

      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> AI Daily Briefing
              <Help label="AI Daily Briefing" lines={HELP.briefing} />
            </CardTitle>
            <CardDescription>
              {briefingRes.data ? `${formatDate(briefingRes.data.briefing_date)} · 생성 ${formatDateTime(briefingRes.data.generated_at)}` : "매일 07:00 KST 자동 생성"}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {briefingRes.data ? <SectionLink href="/briefing" /> : null}
            <GenerateBriefingButton label={briefingRes.data ? "다시 생성" : "지금 생성"} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {briefingRes.data ? (
            <>
              {briefingRes.data.is_demo ? <Badge variant="demo" className="self-start">DEMO 포함</Badge> : null}
              <BriefingHero b={briefingRes.data.content as BriefingContent} />
            </>
          ) : (
            <EmptyState title="아직 생성된 브리핑이 없습니다" description="지금 생성하거나 다음 자동 생성(07:00 KST)을 기다려 주세요." />
          )}
        </CardContent>
      </Card>

      <nav aria-label="기간·카테고리 선택" className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <div className="flex rounded-full bg-secondary p-0.5" role="group" aria-label="기간">
          {(Object.keys(BOARD_PERIODS) as BoardPeriod[]).map((p) => (
            <Link
              key={p}
              href={href({ period: p })}
              aria-current={p === period ? "page" : undefined}
              className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", p === period ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              {BOARD_PERIODS[p].label}
            </Link>
          ))}
        </div>
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="카테고리 필터">
          <Link href={href({ cat: "" })} aria-current={!cat ? "page" : undefined} className={cn("rounded-full px-2.5 py-1 text-xs", !cat ? "bg-foreground text-background" : "bg-secondary hover:bg-accent")}>
            전체 {board.total}
          </Link>
          {CATEGORIES.map((c) => {
            const n = board.categories.find((s) => s.slug === c.slug)?.count ?? 0;
            const active = cat === c.slug;
            return (
              <Link
                key={c.slug}
                href={active ? `/?period=${period}` : href({ cat: c.slug })}
                aria-current={active ? "page" : undefined}
                title={c.description}
                className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-opacity", c.chip, active ? "ring-2 ring-offset-1 ring-offset-background" : "", n === 0 && !active ? "opacity-50" : "")}
                style={active ? ({ "--tw-ring-color": c.color } as React.CSSProperties) : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
                {c.label} <span className="tabular-nums">{n}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" /> 트렌드 한눈에
              <Help label="트렌드 한눈에" lines={HELP.overview} />
            </CardTitle>
            <CardDescription>
              카테고리별 콘텐츠 {board.total}건 · {compare} 같은 기간 {board.previousTotal}건과 비교
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBarTable shares={board.categories} period={period} compareLabel={compare} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <Flame className="h-4 w-4 text-orange-500" aria-hidden="true" /> 급상승 키워드
              <Help label="급상승 키워드" lines={HELP.rising} align="right" />
            </CardTitle>
            <CardDescription>{compare} 같은 기간 대비 · 최근 7일 추이</CardDescription>
          </CardHeader>
          <CardContent>
            <RisingKeywordRows items={board.rising} period={period} compareLabel={compare} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-1.5 text-base">
              {topTitle} <Help label={topTitle} lines={HELP.top} />
            </CardTitle>
            <CardDescription>
              {board.topRanked ? "출처별 순위로 정규화한 인기순" : "인기 지표 없음 · 게시일 최신순"} · {period === "daily" ? "최근 24시간" : "최근 7일"}
              {catLabel ? ` · 카테고리: ${catLabel}` : ""} · 논문은{" "}
              <Link href="/papers" className="text-primary hover:underline">
                Papers
              </Link>
              에서
            </CardDescription>
          </div>
          <SectionLink href={`/trending?period=${period}&limit=50${cat ? `&cat=${cat}` : ""}`} />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {board.top.length === 0 ? (
            <EmptyState title="해당 기간 콘텐츠가 없습니다" description={cat ? "다른 카테고리를 선택해 보세요." : "Settings에서 '지금 수집'을 실행하거나 다음 자동 수집(06:00 KST)을 기다려 주세요."} />
          ) : (
            board.top.map((e) => (
              <TrendCard key={e.item.id} entry={e} saved={saved.has(e.item.id)} ai={board.meta.get(e.item.original_url)} translate={translate} period={period} compareLabel={compare} />
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
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
            {topics.length === 0 ? <EmptyState title="활성 주제가 없습니다" action={<SectionLink href="/topics" label="주제 추가" />} /> : <TopicUpdateList topics={topics} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-1.5">
                Following Update <Help label="Following Update" lines={HELP.followingUpdate} align="right" />
              </CardTitle>
              <CardDescription>팔로우한 인물의 최신 콘텐츠 링크</CardDescription>
            </div>
            <SectionLink href="/influencers?tab=following" />
          </CardHeader>
          <CardContent>
            {following.length === 0 ? (
              <EmptyState title="등록된 콘텐츠 링크가 없습니다" description="Influencers에서 인물을 팔로우하고 게시글 링크를 추가하세요." />
            ) : (
              <ul className="flex flex-col divide-y">
                {following.map((f) => (
                  <li key={f.id} className="py-2">
                    <SourceBadge name={f.influencer.name} sourceType="user_provided" url={f.url} size="xs" showType={false} />
                    <a href={f.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 line-clamp-1 block text-sm hover:text-primary">
                      {f.title ?? "제목 없는 링크"}
                    </a>
                    <p className="text-[11px] text-muted-foreground">
                      {f.influencer.name}
                      {f.influencer.company ? ` · ${f.influencer.company}` : ""} · {formatDate(f.posted_at ?? f.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {candidateCount ? (
              <Link href="/influencers?tab=candidates" className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                팔로우 후보 {candidateCount}명 보기 <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
