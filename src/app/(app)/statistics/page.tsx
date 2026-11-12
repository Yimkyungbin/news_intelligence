import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { keywordSeries, recentKstDates, summarizeRange, type DailyStatsData, type StatRow } from "@/lib/stats/compute";
import { DailyTotalChart, KeywordTrendChart } from "@/components/stats/stats-charts";
import { InfoTip } from "@/components/info-tip";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { RebuildStatsButton } from "./rebuild-button";
import { LiveOverview } from "@/components/stats/live-overview";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Statistics" };
export const maxDuration = 300;

const RANGES = [7, 30, 90, 365] as const;
const LANG: Record<string, string> = { ko: "한국어", en: "영어" };
const TYPE: Record<string, string> = { article: "아티클", post: "게시글", paper: "논문", repository: "저장소", model: "모델", discussion: "토론", video: "영상", other: "기타" };

function Bars({ items, total, label }: { items: { key: string; name: string; count: number }[]; total: number; label: string }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">데이터 없음</p>;
  const max = items[0].count;
  return (
    <ul className="flex flex-col gap-1.5" aria-label={label}>
      {items.map((i) => (
        <li key={i.key} className="text-xs">
          <div className="flex justify-between gap-2">
            <span className="truncate">{i.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {i.count.toLocaleString("ko-KR")}건 · {total ? Math.round((i.count / total) * 100) : 0}%
            </span>
          </div>
          <div className="mt-0.5 h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, (i.count / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function StatisticsPage({ searchParams }: PageProps<"/statistics">) {
  const sp = await searchParams;
  const range = RANGES.find((r) => String(r) === sp.range) ?? 30;
  const dates = recentKstDates(range);
  const date = typeof sp.date === "string" && dates.includes(sp.date) ? sp.date : null;

  const user = await requireUser();
  const supabase = await createClient();
  const [{ data }, { data: briefings }] = await Promise.all([
    supabase.from("daily_stats").select("stat_date,data").eq("user_id", user.id).gte("stat_date", dates[0]).order("stat_date"),
    supabase.from("daily_briefings").select("briefing_date").eq("user_id", user.id).gte("briefing_date", dates[0]),
  ]);
  const rows = (data ?? []) as StatRow[];
  const byDate = new Map(rows.map((r) => [r.stat_date, r.data]));
  const summary = summarizeRange(rows);
  const daily = dates.map((d) => ({ date: d, total: byDate.get(d)?.total ?? 0 }));
  const kwParam = typeof sp.kw === "string" ? sp.kw.slice(0, 60) : "";
  const trendKeywords = kwParam && summary.keywords.some((k) => k.keyword === kwParam) ? [kwParam] : summary.keywords.slice(0, 5).map((k) => k.keyword);
  const series = keywordSeries(rows, dates, trendKeywords);
  const day: DailyStatsData | undefined = date ? byDate.get(date) : undefined;
  const briefingDates = new Set((briefings ?? []).map((b) => b.briefing_date as string));
  const avg = summary.days ? Math.round(summary.total / range) : 0;
  const href = (p: Record<string, string>) => `/statistics?${new URLSearchParams({ range: String(range), ...p }).toString()}`;

  return (
    <>
      <PageHeader
        title="Statistics"
        description="매일 수집된 정보를 날짜별 통계로 저장해 기간별로 비교합니다. 원문이 아닌 집계값만 2년간 보관하며, 날짜는 게시일(없으면 수집일, KST) 기준입니다."
        actions={<RebuildStatsButton />}
      />

      <section aria-label="실시간 요약" className="mb-6">
        <LiveOverview userId={user.id} />
      </section>

      <h2 className="mb-2 text-sm font-semibold">기간별 일자 통계</h2>
      <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="기간 선택">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/statistics?range=${r}`}
            aria-current={r === range ? "page" : undefined}
            className={cn("rounded-md px-2.5 py-1 text-xs", r === range ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
          >
            최근 {r}일
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="저장된 통계가 없습니다" description="수집이 실행되면 매일 자동으로 쌓입니다. '통계 갱신'을 누르면 현재 남아 있는 콘텐츠로 최근 90일 통계를 만듭니다." />
      ) : (
        <div className="flex flex-col gap-4">
          <section aria-label="기간 요약" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["기간 콘텐츠", summary.total.toLocaleString("ko-KR")],
              ["데이터가 있는 날", `${summary.days}일`],
              ["하루 평균", `${avg.toLocaleString("ko-KR")}건`],
              ["출처 수", `${summary.sources.length}곳`],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold tabular-nums">{value}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                일별 콘텐츠 수
                <InfoTip label="일별 콘텐츠 수">
                  <span className="block">하루(KST)에 게시된 콘텐츠 수입니다. 게시일이 없으면 수집일로 셉니다.</span>
                  <span className="block">막대를 누르면 그날의 인기 콘텐츠와 키워드를 볼 수 있습니다.</span>
                </InfoTip>
              </CardTitle>
              <CardDescription>막대를 눌러 날짜별 상세 보기</CardDescription>
            </CardHeader>
            <CardContent>
              <DailyTotalChart data={daily} range={String(range)} />
            </CardContent>
          </Card>

          {date ? (
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle>{formatDate(date)} 상세</CardTitle>
                  <CardDescription>
                    콘텐츠 {day?.total ?? 0}건
                    {day?.demo ? ` · DEMO ${day.demo}건 포함` : ""}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {briefingDates.has(date) ? (
                    <Link href={`/briefing?date=${date}`} className="text-primary hover:underline">
                      이날 브리핑 보기
                    </Link>
                  ) : null}
                  <Link href={href({})} className="text-muted-foreground hover:text-foreground" aria-label="날짜 상세 닫기">
                    닫기
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {day ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">인기 콘텐츠 TOP 10</p>
                      <ol className="flex flex-col gap-1 text-sm" aria-label={`${date} 인기 콘텐츠`}>
                        {day.top_items.map((t, i) => (
                          <li key={t.url}>
                            <a href={t.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-primary">
                              {i + 1}. {t.title}
                            </a>
                            <span className="block text-[11px] text-muted-foreground">
                              {t.source_name}
                              {t.note ? ` · ${t.note}` : ""}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">키워드</p>
                        <div className="flex flex-wrap gap-1">
                          {day.keywords.slice(0, 15).map((k) => (
                            <Badge key={k.keyword} variant="secondary">
                              #{k.keyword} {k.count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">출처</p>
                        <Bars items={day.by_source.slice(0, 8)} total={day.total} label={`${date} 출처별 건수`} />
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {Object.entries(day.by_language).map(([k, v]) => (
                          <span key={k}>
                            {LANG[k] ?? k} {v}
                          </span>
                        ))}
                        <span>·</span>
                        {Object.entries(day.by_type).map(([k, v]) => (
                          <span key={k}>
                            {TYPE[k] ?? k} {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">이날 저장된 통계가 없습니다.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>키워드 추이</CardTitle>
              <CardDescription>{kwParam ? `#${kwParam} 일별 등장 수` : "기간 상위 키워드 5개의 일별 등장 수"} · 아래 키워드를 눌러 하나만 보기</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <KeywordTrendChart data={series} keywords={trendKeywords} />
              <div className="flex flex-wrap gap-1" aria-label="기간 상위 키워드">
                {kwParam ? (
                  <Link href={href({})} className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] text-primary-foreground">
                    전체 보기
                  </Link>
                ) : null}
                {summary.keywords.slice(0, 20).map((k) => (
                  <Link
                    key={k.keyword}
                    href={href({ kw: k.keyword })}
                    className={cn("rounded-md px-1.5 py-0.5 text-[11px]", kwParam === k.keyword ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
                  >
                    #{k.keyword} {k.count}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>출처 비중</CardTitle>
                <CardDescription>기간 합계 상위 15개</CardDescription>
              </CardHeader>
              <CardContent>
                <Bars items={summary.sources.slice(0, 15)} total={summary.total} label="기간 출처별 건수" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>관심 주제별 콘텐츠</CardTitle>
                <CardDescription>기간 합계 · 한 콘텐츠가 여러 주제에 속하면 주제마다 셉니다</CardDescription>
              </CardHeader>
              <CardContent>
                <Bars items={summary.topics.map((t) => ({ key: t.id, name: t.name, count: t.count }))} total={summary.total} label="기간 주제별 건수" />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
