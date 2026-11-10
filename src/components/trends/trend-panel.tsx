import Link from "next/link";
import { Lightbulb, TrendingUp } from "lucide-react";
import type { TrendDelta } from "@/lib/trends/compute";
import type { TrendInsightContent } from "@/lib/trends/service";
import { OpenDetailButton } from "@/components/content/content-detail";
import { InfoTip } from "@/components/info-tip";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { GenerateTrendInsightButton } from "./trend-button";
import { formatDateTime } from "@/lib/utils";

/** Trending 상단 트렌드 시사점 패널: 집계(항상) + AI 시사점(허용 콘텐츠, 요청 시) */
export function TrendPanel({
  delta,
  periodLabel,
  params,
  insight,
}: {
  delta: TrendDelta;
  periodLabel: string;
  params: Record<string, string>;
  insight: { content: TrendInsightContent; model_name: string; is_demo: boolean; generated_at: string } | null;
}) {
  const kwHref = (k: string) => `/trending?${new URLSearchParams({ ...params, kw: k }).toString()}`;
  const diff = delta.current - delta.previous;
  return (
    <Card className="mb-4">
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" /> 트렌드 시사점
            <InfoTip label="트렌드 시사점">
              <span className="block">현재 조건의 콘텐츠를 직전 동일 기간과 비교한 집계입니다 (AI 분석 아님).</span>
              <span className="block">AI 시사점은 운영자가 AI 처리를 허용한 출처의 콘텐츠만 분석하며, 같은 조건 결과는 24시간 동안 재사용합니다.</span>
            </InfoTip>
          </CardTitle>
          <CardDescription>
            {periodLabel} 콘텐츠 {delta.current}건 · 직전 기간 {delta.previous}건 ({diff >= 0 ? `+${diff}` : diff})
          </CardDescription>
        </div>
        <GenerateTrendInsightButton params={params} hasInsight={Boolean(insight)} />
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-3 text-xs">
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
          <div>
            <p className="mb-1 font-semibold text-muted-foreground">새로 등장한 키워드</p>
            {delta.new_keywords.length ? (
              <div className="flex flex-wrap gap-1">
                {delta.new_keywords.map((k) => (
                  <Link key={k.keyword} href={kwHref(k.keyword)}>
                    <Badge>
                      NEW #{k.keyword} {k.count}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">없음</p>
            )}
          </div>
          <div>
            <p className="mb-1 font-semibold text-muted-foreground">주제별 증감</p>
            {delta.topics.length ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {delta.topics.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <Link href={`/topics/${t.id}`} className="truncate hover:text-primary">
                      {t.name}
                    </Link>
                    <span className={t.delta > 0 ? "text-success" : t.delta < 0 ? "text-destructive" : "text-muted-foreground"}>
                      {t.count} ({t.delta > 0 ? `+${t.delta}` : t.delta})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">연결된 주제 없음</p>
            )}
          </div>
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
