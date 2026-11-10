import Link from "next/link";
import { X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAIMeta, getSavedContentIds, getTranslatePref } from "@/lib/queries";
import { rankContent } from "@/lib/content";
import { cn, daysAgoIso } from "@/lib/utils";
import { trendDelta } from "@/lib/trends/compute";
import { LANGS, LIMITS, parseTrendParams, PERIODS, SORTS, trendCacheKey, TYPES } from "@/lib/trends/params";
import { loadTrendItems, type TrendInsightContent } from "@/lib/trends/service";
import { ContentCard } from "@/components/content/content-card";
import { TranslateToggle } from "@/components/content/translate-toggle";
import { TrendPanel } from "@/components/trends/trend-panel";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Trending Posts" };
// AI 시사점 생성(Server Action) 실행 시간 상한
export const maxDuration = 300;

export default async function TrendingPage({ searchParams }: PageProps<"/trending">) {
  const sp = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const { data: topics } = await supabase.from("topics").select("id,name").eq("user_id", user.id).order("name");
  const params = parseTrendParams(sp, (topics ?? []).map((t) => t.id as string));
  const { period, limit, type, lang, sort, topic, kw } = params;

  const [{ current: items, previous }, saved, translate, insightRes] = await Promise.all([
    loadTrendItems(user.id, params),
    getSavedContentIds(user.id),
    getTranslatePref(user.id),
    supabase
      .from("trend_insights")
      .select("content,model_name,is_demo,generated_at")
      .eq("user_id", user.id)
      .eq("cache_key", trendCacheKey(params))
      .gte("generated_at", daysAgoIso(1))
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const result = sort === "popular" ? rankContent(items, limit) : { items: items.slice(0, limit), ranked: false, notes: {} as Record<string, string> };
  const meta = await getAIMeta(result.items.map((i) => i.original_url));
  const delta = trendDelta(items, previous);

  const current = { period, limit: String(limit), type, lang, sort, topic, kw };
  const href = (patch: Partial<typeof current>) => {
    const u = new URLSearchParams(Object.entries({ ...current, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/trending?${u.toString()}`;
  };
  const chip = (active: boolean) =>
    cn("rounded-md px-2.5 py-1 text-xs transition-colors", active ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent");

  return (
    <>
      <PageHeader
        title="Trending Posts"
        description="수집된 콘텐츠 중 인기 콘텐츠를 확인합니다. LinkedIn 전체 인기 순위가 아닙니다."
        actions={<TranslateToggle on={translate} />}
      />
      <div className="mb-4 flex flex-col gap-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(PERIODS).map(([k, v]) => (
            <Link key={k} href={href({ period: k as typeof period })} className={chip(period === k)}>
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
            <Link key={k} href={href({ sort: k as typeof sort })} className={chip(sort === k)}>
              {v}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(TYPES).map(([k, v]) => (
            <Link key={k || "all"} href={href({ type: k as typeof type })} className={chip(type === k)}>
              {v}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {Object.entries(LANGS).map(([k, v]) => (
            <Link key={k || "all"} href={href({ lang: k as typeof lang })} className={chip(lang === k)}>
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

      <TrendPanel
        delta={delta}
        periodLabel={`최근 ${PERIODS[period].days}일`}
        params={Object.fromEntries(Object.entries(current).filter(([, v]) => v)) as Record<string, string>}
        insight={insightRes.data ? { ...insightRes.data, content: insightRes.data.content as TrendInsightContent } : null}
      />

      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">집계 범위: 내 수집 콘텐츠 · 최근 {PERIODS[period].days}일</Badge>
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

      {result.items.length === 0 ? (
        <EmptyState title="조건에 맞는 콘텐츠가 없습니다" description="기간·필터를 바꾸거나 Settings에서 '지금 수집'을 실행해 보세요." />
      ) : (
        <div className="flex flex-col gap-2">
          {result.items.map((it, i) => (
            <ContentCard key={it.id} item={it} saved={saved.has(it.id)} rank={i + 1} rankNote={result.notes[it.id]} ai={meta.get(it.original_url)} translate={translate} />
          ))}
        </div>
      )}
    </>
  );
}
