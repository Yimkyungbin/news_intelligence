import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSavedContentIds, listContent } from "@/lib/queries";
import { rankContent } from "@/lib/content";
import { cn, daysAgoIso } from "@/lib/utils";
import { ContentCard } from "@/components/content/content-card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Trending Posts" };

const PERIODS = { daily: { label: "Daily", days: 1 }, weekly: { label: "Weekly", days: 7 }, monthly: { label: "Monthly", days: 30 } } as const;
const LIMITS = [10, 20, 50] as const;
const TYPES = { "": "전체 유형", article: "아티클", post: "게시글", paper: "논문", repository: "저장소", model: "모델", discussion: "토론" } as const;
const LANGS = { "": "전체 언어", ko: "한국어", en: "영어" } as const;
const SORTS = { popular: "인기순", latest: "게시일순" } as const;

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export default async function TrendingPage({ searchParams }: PageProps<"/trending">) {
  const sp = await searchParams;
  const period = pick(sp.period, Object.keys(PERIODS) as (keyof typeof PERIODS)[], "weekly");
  const limit = Number(pick(sp.limit, LIMITS.map(String), "10"));
  const type = pick(sp.type, Object.keys(TYPES) as (keyof typeof TYPES)[], "");
  const lang = pick(sp.lang, Object.keys(LANGS) as (keyof typeof LANGS)[], "");
  const sort = pick(sp.sort, Object.keys(SORTS) as (keyof typeof SORTS)[], "popular");

  const user = await requireUser();
  const supabase = await createClient();
  const { data: topics } = await supabase.from("topics").select("id,name").eq("user_id", user.id).order("name");
  const topic = pick(sp.topic, (topics ?? []).map((t) => t.id as string), "");

  const [items, saved] = await Promise.all([
    listContent(user.id, {
      sinceIso: daysAgoIso(PERIODS[period].days),
      limit: 300,
      topicId: topic || undefined,
      contentType: type || undefined,
      language: lang || undefined,
    }),
    getSavedContentIds(user.id),
  ]);
  const result = sort === "popular" ? rankContent(items, limit) : { items: items.slice(0, limit), ranked: false };

  const current = { period, limit: String(limit), type, lang, sort, topic };
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

      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">집계 범위: 내 수집 콘텐츠 · 최근 {PERIODS[period].days}일</Badge>
        <span>
          {sort === "popular"
            ? result.ranked
              ? "출처가 제공한 인기 지표(points, stars 등) 기준. 지표가 없는 항목은 게시일순으로 뒤에 표시됩니다."
              : "인기 지표를 제공하는 콘텐츠가 없어 게시일순으로 표시합니다."
            : "게시일 최신순"}
        </span>
      </p>

      {result.items.length === 0 ? (
        <EmptyState title="조건에 맞는 콘텐츠가 없습니다" description="Phase 2에서 Hacker News, GitHub, arXiv, 공식 블로그 RSS 수집이 활성화됩니다." />
      ) : (
        <div className="flex flex-col gap-2">
          {result.items.map((it, i) => (
            <ContentCard key={it.id} item={it} saved={saved.has(it.id)} rank={i + 1} />
          ))}
        </div>
      )}
    </>
  );
}
