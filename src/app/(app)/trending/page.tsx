import Link from "next/link";
import { X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAIMeta, getSavedContentIds, getTranslatePref } from "@/lib/queries";
import { displayTitle, rankContent } from "@/lib/content";
import { CATEGORIES, categoryDef, itemCategory } from "@/lib/categories";
import { cn, daysAgoIso } from "@/lib/utils";
import { trendDelta } from "@/lib/trends/compute";
import { categoryBreakdown, coKeywords, relatedCounts, sourceShares } from "@/lib/trends/overview";
import { describeTrendScope, isFocused, LANGS, LIMITS, parseTrendParams, PERIODS, SORTS, trendCacheKey, TYPES } from "@/lib/trends/params";
import type { BriefingContent } from "@/lib/briefing/compose";
import { loadTrendItems, type TrendInsightContent } from "@/lib/trends/service";
import type { RankedEntry } from "@/lib/trends/board";
import { TrendCard } from "@/components/trends/trend-card";
import { CategoryShareBars } from "@/components/trends/trend-overview";
import { OpenDetailButton } from "@/components/content/content-detail";
import { TranslateToggle } from "@/components/content/translate-toggle";
import { TrendOverviewHint, TrendPanel } from "@/components/trends/trend-panel";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import type { ContentItem } from "@/lib/types";

export const metadata = { title: "Trending Posts" };
// AI 시사점 생성(Server Action) 실행 시간 상한
export const maxDuration = 300;

const VIEWS = { list: "목록", category: "카테고리" } as const;

export default async function TrendingPage({ searchParams }: PageProps<"/trending">) {
  const sp = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const { data: topics } = await supabase.from("topics").select("id,name").eq("user_id", user.id).order("name");
  const params = parseTrendParams(sp, (topics ?? []).map((t) => t.id as string));
  const { period, limit, type, lang, sort, topic, kw, cat } = params;
  const view: keyof typeof VIEWS = sp.view === "category" ? "category" : "list";
  // 카테고리 개요(카테고리 미선택)는 카테고리 필터 없이 전체를 나눠 보여 줌
  const overview = view === "category" && !cat;
  // 조건이 없으면 전체 흐름(= Dashboard)과 같으므로 브리핑 AI 인사이트를 재사용하고 AI 시사점은 만들지 않음
  const focused = isFocused(params);

  const [{ current: items, previous }, saved, translate, insightRes, briefingRes] = await Promise.all([
    loadTrendItems(user.id, params),
    getSavedContentIds(user.id),
    getTranslatePref(user.id),
    focused
      ? supabase
          .from("trend_insights")
          .select("content,model_name,is_demo,generated_at")
          .eq("user_id", user.id)
          .eq("cache_key", trendCacheKey(params))
          .gte("generated_at", daysAgoIso(1))
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    focused
      ? Promise.resolve(null)
      : supabase.from("daily_briefings").select("briefing_date,content").eq("user_id", user.id).order("briefing_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const result =
    sort === "popular"
      ? rankContent(items, limit)
      : { items: items.slice(0, limit), ranked: false, notes: {} as Record<string, string>, positions: {} as Record<string, { rank: number; total: number }> };
  const related = relatedCounts(result.items, items);
  const entries: RankedEntry[] = result.items.map((item, i) => ({
    item,
    rank: i + 1,
    change: null,
    position: result.positions[item.id] ?? null,
    growth: null,
    related: related[item.id] ?? { count: 0, keywords: [] },
  }));

  // 카테고리 개요: 카테고리별 인기 상위 3건
  const groups = overview
    ? CATEGORIES.map((c) => {
        const list = items.filter((i) => itemCategory(i) === c.slug);
        return { def: c, count: list.length, top: rankContent(list, 3).items as ContentItem[] };
      })
    : [];
  const shares = overview ? categoryBreakdown(items, previous) : [];
  const meta = await getAIMeta([...result.items, ...groups.flatMap((g) => g.top)].map((i) => i.original_url));
  const delta = trendDelta(items, previous);
  const topicName = (topics ?? []).find((t) => t.id === topic)?.name as string | undefined;
  const panelParams = Object.fromEntries(
    Object.entries({ period, limit: String(limit), type, lang, sort, topic, kw, cat }).filter(([, v]) => v),
  ) as Record<string, string>;

  const current = { view, period, limit: String(limit), type, lang, sort, topic, kw, cat };
  const href = (patch: Partial<Record<keyof typeof current, string>>) => {
    const merged = { ...current, ...patch };
    if (merged.view === "list") merged.view = "" as typeof view;
    const u = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    return `/trending?${u.toString()}`;
  };
  const chip = (active: boolean) =>
    cn("rounded-md px-2.5 py-1 text-xs transition-colors", active ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent");
  const catLabel = categoryDef(cat)?.label;
  const compare = period === "daily" ? "어제" : period === "weekly" ? "지난주" : "지난달";

  return (
    <>
      <PageHeader
        title="Trending Posts"
        description="수집된 콘텐츠 중 인기 콘텐츠를 확인합니다. LinkedIn 전체 인기 순위가 아닙니다."
        actions={<TranslateToggle on={translate} />}
      />

      <div className="mb-3 flex gap-1 border-b" role="tablist" aria-label="보기 방식">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => (
          <Link
            key={v}
            role="tab"
            aria-selected={view === v}
            href={href({ view: v, cat: v === "list" ? cat : "" })}
            className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm", view === v ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {VIEWS[v]}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(PERIODS).map(([k, v]) => (
            <Link key={k} href={href({ period: k })} className={chip(period === k)}>
              {v.label}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {LIMITS.map((n) => (
            <Link key={n} href={href({ limit: String(n) })} className={chip(limit === n)}>
              Top {n}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {Object.entries(SORTS).map(([k, v]) => (
            <Link key={k} href={href({ sort: k })} className={chip(sort === k)}>
              {v}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="카테고리 필터">
          <Link href={href({ cat: "" })} className={chip(!cat)}>
            전체 카테고리
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={href({ cat: c.slug })}
              aria-current={cat === c.slug ? "page" : undefined}
              title={c.description}
              className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs", cat === c.slug ? "bg-primary text-primary-foreground" : c.chip)}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
              {c.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(TYPES).map(([k, v]) => (
            <Link key={k || "all"} href={href({ type: k })} className={chip(type === k)}>
              {v}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {Object.entries(LANGS).map(([k, v]) => (
            <Link key={k || "all"} href={href({ lang: k })} className={chip(lang === k)}>
              {v}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={href({ topic: "" })} className={chip(!topic)}>
            전체 주제
          </Link>
          {(topics ?? []).map((t) => (
            <Link key={t.id} href={href({ topic: t.id })} className={chip(topic === t.id)}>
              {t.name}
            </Link>
          ))}
        </div>
      </div>

      {overview ? (
        <>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>카테고리 비중</CardTitle>
              <CardDescription>
                최근 {PERIODS[period].days}일 콘텐츠 {items.length}건 · 아래 얇은 막대는 {compare} 같은 기간 · 카드를 눌러 카테고리 모아보기
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryShareBars shares={shares} period={period} compareLabel={compare} />
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="카테고리별 모아보기">
            {groups.map((g) => {
              const s = shares.find((x) => x.slug === g.def.slug);
              return (
                <section key={g.def.slug} aria-label={`${g.def.label} 카테고리`} className="relative flex flex-col overflow-hidden rounded-lg border bg-card p-3 pt-4">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: g.def.color }} aria-hidden="true" />
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold">{g.def.label}</h2>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {g.count}건
                      {s && Math.round(s.deltaPp) !== 0 ? <span className={s.deltaPp > 0 ? "text-success" : "text-destructive"}> {s.deltaPp > 0 ? "▲" : "▼"}{Math.abs(Math.round(s.deltaPp))}%p</span> : null}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{g.def.description}</p>
                  <ol className="mt-2 flex flex-1 flex-col gap-1.5 text-xs">
                    {g.top.length === 0 ? <li className="text-muted-foreground">콘텐츠 없음</li> : null}
                    {g.top.map((it, idx) => {
                      const ai = meta.get(it.original_url);
                      const t = translate && it.language !== "ko" && ai?.title_ko ? ai.title_ko : displayTitle(it);
                      return (
                        <li key={it.id} className="flex gap-1.5">
                          <span className="tabular-nums text-muted-foreground">{idx + 1}</span>
                          <OpenDetailButton contentId={it.id} className="line-clamp-2 text-left hover:text-primary">
                            {t}
                          </OpenDetailButton>
                        </li>
                      );
                    })}
                  </ol>
                  <Link href={href({ cat: g.def.slug })} className="mt-2 text-xs font-medium text-primary hover:underline">
                    {g.def.label} 모아보기 →
                  </Link>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {focused ? (
            <TrendPanel
              delta={delta}
              periodLabel={`최근 ${PERIODS[period].days}일`}
              scopeLabel={describeTrendScope(params, topicName).split(" · ").slice(1).join(" · ")}
              params={panelParams}
              insight={insightRes.data ? { ...insightRes.data, content: insightRes.data.content as TrendInsightContent } : null}
              coKeywords={coKeywords(items, kw ? [kw] : [])}
              sources={sourceShares(items)}
              categories={cat ? null : categoryBreakdown(items, previous)}
            />
          ) : (
            <TrendOverviewHint
              delta={delta}
              params={panelParams}
              briefing={briefingRes?.data ? { date: briefingRes.data.briefing_date as string, content: briefingRes.data.content as BriefingContent } : null}
            />
          )}

          <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">집계 범위: 내 수집 콘텐츠 · 최근 {PERIODS[period].days}일</Badge>
            {cat ? (
              <Link href={href({ cat: "" })} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary hover:bg-primary/20" aria-label={`카테고리 필터 ${catLabel} 해제`}>
                카테고리: {catLabel} <X className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : null}
            {kw ? (
              <Link href={href({ kw: "" })} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary hover:bg-primary/20" aria-label={`키워드 필터 ${kw} 해제`}>
                키워드: #{kw} <X className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : null}
            <span>
              {sort === "popular"
                ? result.ranked
                  ? "출처가 제공한 인기 지표(points, stars 등)를 출처 안의 순위로 정규화하고, 한 출처가 상위를 독점하지 않도록 조정합니다. 지표가 없는 항목은 게시일순으로 뒤에 표시됩니다."
                  : "인기 지표를 제공하는 콘텐츠가 없어 게시일순으로 표시합니다."
                : "게시일 최신순"}
            </span>
          </p>

          {entries.length === 0 ? (
            <EmptyState title="조건에 맞는 콘텐츠가 없습니다" description="기간·필터를 바꾸거나 Settings에서 '지금 수집'을 실행해 보세요." />
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((e) => (
                <TrendCard key={e.item.id} entry={e} saved={saved.has(e.item.id)} ai={meta.get(e.item.original_url)} translate={translate} period={period} compareLabel={compare} showOriginal />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
