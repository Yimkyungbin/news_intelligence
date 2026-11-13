import Link from "next/link";
import { ArrowRight, Lightbulb, Search, TrendingUp } from "lucide-react";
import type { TrendDelta } from "@/lib/trends/compute";
import type { CategoryShare } from "@/lib/trends/overview";
import type { TrendInsightContent } from "@/lib/trends/service";
import type { BriefingContent } from "@/lib/briefing/compose";
import { OpenDetailButton } from "@/components/content/content-detail";
import { AIInsightsBlock } from "@/components/briefing/briefing-view";
import { InfoTip } from "@/components/info-tip";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { GenerateTrendInsightButton } from "./trend-button";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

type Insight = { content: TrendInsightContent; model_name: string; is_demo: boolean; generated_at: string } | null;

/**
 * 조건 없음: 전체 흐름은 Dashboard 와 같으므로 요약을 반복하지 않고,
 * 오늘의 Daily Briefing AI 인사이트(이미 생성된 결과)를 재사용 + 조건 고르기 안내
 */
export function TrendOverviewHint({
  delta,
  params,
  briefing,
}: {
  delta: TrendDelta;
  params: Record<string, string>;
  briefing: { date: string; content: BriefingContent } | null;
}) {
  const kwHref = (k: string) => `/trending?${new URLSearchParams({ ...params, kw: k }).toString()}`;
  const picks = [...delta.rising.map((k) => k.keyword), ...delta.new_keywords.map((k) => k.keyword)].filter((k, i, a) => a.indexOf(k) === i).slice(0, 8);
  return (
    <Card className="mb-4">
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <Search className="h-4 w-4 text-primary" aria-hidden="true" /> 조건별 트렌드 분석
            <InfoTip label="조건별 트렌드 분석">
              <span className="block">조건 없는 전체 흐름(급상승 키워드·카테고리 비중·AI 인사이트)은 Dashboard에서 봅니다.</span>
              <span className="block">키워드·주제·카테고리·유형·언어 중 하나를 고르면 그 조건의 변화와 함께 등장한 키워드, 출처 분포, AI 시사점을 보여 줍니다.</span>
            </InfoTip>
          </CardTitle>
          <CardDescription>
            전체 흐름은{" "}
            <Link href="/" className="text-primary hover:underline">
              Dashboard
            </Link>
            에서 확인하세요. 아래 키워드나 필터를 고르면 조건별로 깊이 분석합니다.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="text-xs">
          <p className="mb-1.5 font-semibold text-muted-foreground">지금 뜨는 키워드로 분석 시작</p>
          {picks.length ? (
            <div className="flex flex-wrap gap-1.5" aria-label="분석할 키워드 선택">
              {picks.map((k) => (
                <Link key={k} href={kwHref(k)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:border-primary/50 hover:bg-primary/5">
                  #{k} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">직전 기간 대비 늘어난 키워드가 없습니다. 위 필터에서 조건을 골라 보세요.</p>
          )}
        </div>
        <div aria-label="오늘의 AI 인사이트 (Daily Briefing)">
          <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            오늘의 AI 인사이트 · Daily Briefing {briefing ? formatDate(briefing.date) : ""}
            <Link href="/briefing" className="font-normal text-primary hover:underline">
              브리핑 전체 보기
            </Link>
          </p>
          {briefing ? (
            <AIInsightsBlock ai={briefing.content.ai_insights} compact />
          ) : (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">아직 생성된 브리핑이 없습니다. Dashboard에서 생성할 수 있습니다.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** 조건이 걸렸을 때: 조건 안의 변화 + 함께 등장한 키워드 + 분포 + AI 시사점(요청 시) */
export function TrendPanel({
  delta,
  periodLabel,
  scopeLabel,
  params,
  insight,
  coKeywords,
  sources,
  categories,
}: {
  delta: TrendDelta;
  periodLabel: string;
  scopeLabel: string;
  params: Record<string, string>;
  insight: Insight;
  coKeywords: { keyword: string; count: number }[];
  sources: { name: string; count: number; share: number }[];
  categories: CategoryShare[] | null;
}) {
  const kwHref = (k: string) => `/trending?${new URLSearchParams({ ...params, kw: k }).toString()}`;
  const diff = delta.current - delta.previous;
  const cats = categories?.filter((c) => c.count > 0).sort((a, b) => b.count - a.count) ?? [];
  return (
    <Card className="mb-4">
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" /> 트렌드 시사점 · {scopeLabel}
            <InfoTip label="트렌드 시사점">
              <span className="block">선택한 조건의 콘텐츠를 직전 동일 기간과 비교한 집계입니다 (AI 분석 아님).</span>
              <span className="block">AI 시사점은 운영자가 AI 처리를 허용한 출처의 콘텐츠만 분석하며, 같은 조건 결과는 24시간 동안 재사용합니다.</span>
            </InfoTip>
          </CardTitle>
          <CardDescription>
            {periodLabel} 콘텐츠 <b className="text-foreground">{delta.current}</b>건 · 직전 기간 {delta.previous}건{" "}
            <span className={diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : ""}>({diff >= 0 ? `+${diff}` : diff})</span>
          </CardDescription>
        </div>
        <GenerateTrendInsightButton params={params} hasInsight={Boolean(insight)} />
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-3 text-xs">
          <div>
            <p className="mb-1 font-semibold text-muted-foreground">함께 등장한 키워드</p>
            {coKeywords.length ? (
              <div className="flex flex-wrap gap-1" aria-label="함께 등장한 키워드">
                {coKeywords.map((k) => (
                  <Link key={k.keyword} href={kwHref(k.keyword)} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary hover:bg-primary/20">
                    #{k.keyword} {k.count}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">2건 이상 함께 나온 키워드가 없습니다.</p>
            )}
          </div>
          <div>
            <p className="mb-1 font-semibold text-muted-foreground">급상승 키워드</p>
            {delta.rising.length ? (
              <div className="flex flex-wrap gap-1" aria-label="급상승 키워드">
                {delta.rising.map((k) => (
                  <Link key={k.keyword} href={kwHref(k.keyword)} className="rounded-md bg-success/10 px-1.5 py-0.5 text-success hover:bg-success/20">
                    #{k.keyword} +{k.delta}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">없음</p>
            )}
          </div>
          {cats.length ? (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground">카테고리 분포</p>
              <div className="flex h-2.5 overflow-hidden rounded-full" role="img" aria-label={`조건 내 카테고리 분포: ${cats.map((c) => `${c.label} ${c.share}%`).join(", ")}`}>
                {cats.map((c) => (
                  <span key={c.slug} style={{ width: `${c.share}%`, backgroundColor: c.color }} title={`${c.label} ${c.count}건`} />
                ))}
              </div>
              <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                {cats.slice(0, 4).map((c) => (
                  <span key={c.slug}>
                    {c.label} {c.count}
                  </span>
                ))}
              </p>
            </div>
          ) : null}
          <div>
            <p className="mb-1 font-semibold text-muted-foreground">출처 분포</p>
            <ul className="flex flex-col gap-0.5" aria-label="조건 내 출처 분포">
              {sources.map((s) => (
                <li key={s.name} className="flex items-center gap-2">
                  <span className="w-28 truncate">{s.name}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-muted">
                    <span className="block h-1.5 rounded-full bg-primary/70" style={{ width: `${s.share}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums text-muted-foreground">{s.count}</span>
                </li>
              ))}
            </ul>
          </div>
          {delta.topics.length ? (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground">주제별 증감</p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {delta.topics.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <Link href={`/topics/${t.id}`} className="truncate hover:text-primary">
                      {t.name}
                    </Link>
                    <span className={cn(t.delta > 0 ? "text-success" : t.delta < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {t.count} ({t.delta > 0 ? `+${t.delta}` : t.delta})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div aria-label="AI 트렌드 시사점">
          {insight ? (
            <div className="flex flex-col gap-2 rounded-md border bg-amber-500/5 p-3">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                <Lightbulb className="h-4 w-4 text-amber-600" aria-hidden="true" />
                {insight.content.headline}
                {insight.is_demo ? <Badge variant="demo">DEMO 모의 AI</Badge> : null}
              </p>
              <ol className="flex flex-col gap-2">
                {insight.content.items.map((i, idx) => (
                  <li key={`${idx}-${i.title}`} className="text-sm">
                    <p className="font-medium">
                      {idx + 1}. {i.title}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{i.detail}</p>
                    {i.content_ids.length ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {i.content_ids.map((id, n) => (
                          <OpenDetailButton key={id} contentId={id} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] hover:bg-accent">
                            근거 {n + 1}
                          </OpenDetailButton>
                        ))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-muted-foreground">
                {insight.model_name} · {formatDateTime(insight.generated_at)} · 분석 {insight.content.analyzed}건
                {insight.content.excluded ? ` · AI 미허용 ${insight.content.excluded}건 제외` : ""}
              </p>
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              아직 이 조건의 AI 시사점이 없습니다. &lsquo;AI 시사점 생성&rsquo;을 누르면 AI 처리가 허용된 인기 콘텐츠로 시사점을 만듭니다.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
