import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSavedContentIds, getTranslatePref } from "@/lib/queries";
import { loadPaperBoard, PAPER_PERIODS, PAPER_SOURCES, type PaperPeriod, type PaperSourceSlug } from "@/lib/trends/board";
import { cn } from "@/lib/utils";
import { TrendCard } from "@/components/trends/trend-card";
import { TranslateToggle } from "@/components/content/translate-toggle";
import { InfoTip } from "@/components/info-tip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Papers" };

const SORTS = { popular: "추천·인용순", latest: "최신순" } as const;
const LIMIT = 30;

export default async function PapersPage({ searchParams }: PageProps<"/papers">) {
  const sp = await searchParams;
  const period: PaperPeriod = sp.period === "daily" || sp.period === "monthly" ? sp.period : "weekly";
  const source = (PAPER_SOURCES.find((s) => s.slug === sp.source)?.slug ?? "") as PaperSourceSlug | "";
  const sort = sp.sort === "latest" ? "latest" : "popular";

  const user = await requireUser();
  const [board, saved, translate] = await Promise.all([
    loadPaperBoard(user.id, { period, source, sort, limit: LIMIT }),
    getSavedContentIds(user.id),
    getTranslatePref(user.id),
  ]);

  const href = (patch: Partial<{ period: string; source: string; sort: string }>) => {
    const v = { period, source, sort, ...patch };
    const u = new URLSearchParams(Object.entries(v).filter(([, x]) => x) as [string, string][]);
    return `/papers?${u.toString()}`;
  };
  const chip = (active: boolean) => cn("rounded-md px-2.5 py-1 text-xs transition-colors", active ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent");
  const max = Math.max(1, ...board.bySource.map((s) => s.count));

  return (
    <>
      <PageHeader title="Papers" description="arXiv, Hugging Face Daily Papers, OpenAlex에서 수집한 IT·AI 논문입니다. 관심 주제와 일치한 논문만 저장됩니다." actions={<TranslateToggle on={translate} />} />

      <div className="mb-4 flex flex-col gap-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="기간">
          {(Object.keys(PAPER_PERIODS) as PaperPeriod[]).map((p) => (
            <Link key={p} href={href({ period: p })} aria-current={p === period ? "page" : undefined} className={chip(p === period)}>
              {PAPER_PERIODS[p].label}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((s) => (
            <Link key={s} href={href({ sort: s })} className={chip(sort === s)}>
              {SORTS[s]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="논문 출처">
          <Link href={href({ source: "" })} className={chip(!source)}>
            전체 출처 {board.total}
          </Link>
          {board.bySource.map((s) => (
            <Link key={s.slug} href={href({ source: s.slug })} aria-current={source === s.slug ? "page" : undefined} className={cn(chip(source === s.slug), s.count === 0 && source !== s.slug && "opacity-50")}>
              {s.label} {s.count}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-label="논문 목록" className="flex flex-col gap-2">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {sort === "popular" ? (board.ranked ? "출처가 제공한 추천·인용 수를 출처 안의 순위로 비교하고, 지표가 없는 arXiv 논문은 최신순으로 뒤에 표시합니다." : "추천·인용 지표가 있는 논문이 없어 최신순으로 표시합니다.") : "게시일 최신순"}
            <InfoTip label="논문 순위 기준" align="right">
              <span className="block">HF Daily Papers: 커뮤니티 추천(upvote) 수. OpenAlex: 피인용 수.</span>
              <span className="block">arXiv는 인기 지표를 제공하지 않아 최신순입니다. 증가량은 매일 수집 때 기록한 값 기준입니다.</span>
            </InfoTip>
          </p>
          {board.entries.length === 0 ? (
            <EmptyState title="조건에 맞는 논문이 없습니다" description="기간·출처를 바꾸거나, Settings에서 논문 출처를 켜고 '지금 수집'을 실행해 보세요." />
          ) : (
            board.entries.map((e) => (
              <TrendCard key={e.item.id} entry={e} saved={saved.has(e.item.id)} ai={board.meta.get(e.item.original_url)} translate={translate} period={period} compareLabel="이전 기록" showOriginal />
            ))
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>출처별 논문 수</CardTitle>
              <CardDescription>최근 {PAPER_PERIODS[period].days}일</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-xs" aria-label="출처별 논문 수">
                {board.bySource.map((s) => (
                  <li key={s.slug}>
                    <Link href={href({ source: s.slug })} className="block hover:text-primary">
                      <span className="flex justify-between gap-2">
                        <span className="truncate">{s.label}</span>
                        <span className="tabular-nums text-muted-foreground">{s.count}</span>
                      </span>
                      <span className="mt-0.5 block h-1.5 rounded-full bg-muted">
                        <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${(s.count / max) * 100}%` }} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>논문 키워드</CardTitle>
              <CardDescription>출처가 붙인 키워드·분야 기준 (AI 분석 아님)</CardDescription>
            </CardHeader>
            <CardContent>
              {board.keywords.length === 0 ? (
                <p className="text-xs text-muted-foreground">키워드가 없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {board.keywords.map((k) => (
                    <Link key={k.keyword} href={`/trending?period=${period}&type=paper&limit=50&kw=${encodeURIComponent(k.keyword)}`} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] hover:bg-accent">
                      #{k.keyword} {k.count}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
