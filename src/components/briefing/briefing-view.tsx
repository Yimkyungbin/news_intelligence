import Link from "next/link";
import { ArrowDown, ArrowUp, Minus, Sparkles } from "lucide-react";
import type { BriefingContent } from "@/lib/briefing/compose";
import { OpenDetailButton } from "@/components/content/content-detail";
import { Badge } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

function Delta({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="inline-flex items-center text-success" aria-label={`전일 대비 ${value} 증가`}>
        <ArrowUp className="h-3 w-3" aria-hidden="true" />
        {value}
      </span>
    );
  if (value < 0)
    return (
      <span className="inline-flex items-center text-destructive" aria-label={`전일 대비 ${-value} 감소`}>
        <ArrowDown className="h-3 w-3" aria-hidden="true" />
        {-value}
      </span>
    );
  return (
    <span className="inline-flex items-center text-muted-foreground" aria-label="전일과 같음">
      <Minus className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] text-primary">{n}</span>
      {children}
    </h3>
  );
}

export function AIInsightsBlock({ ai, compact = false, columns = false }: { ai: BriefingContent["ai_insights"]; compact?: boolean; columns?: boolean }) {
  if (ai.status !== "generated") {
    return <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{ai.reason}</p>;
  }
  const items = compact ? ai.items.slice(0, 3) : ai.items;
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-primary/5 p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        {ai.headline}
        {ai.is_demo ? <Badge variant="demo">DEMO 모의 AI</Badge> : null}
      </p>
      <ol className={columns ? "grid gap-3 md:grid-cols-2" : "flex flex-col gap-2"}>
        {items.map((i, idx) => (
          <li key={`${idx}-${i.title}`} className={columns ? "rounded-md bg-background/60 p-2.5 text-sm" : "text-sm"}>
            <p className="font-medium">
              {idx + 1}. {i.title}
            </p>
            {!compact ? <p className="text-xs leading-relaxed text-muted-foreground">{i.detail}</p> : null}
            {!compact && i.content_ids.length ? (
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
      <p className="text-[11px] text-muted-foreground">{ai.model} · AI 처리가 허용된 콘텐츠만 분석했습니다. 원문을 함께 확인하세요.</p>
    </div>
  );
}

/** 대시보드 카드용 요약 */
export function BriefingSummary({ b }: { b: BriefingContent }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted-foreground">
        최근 24시간 콘텐츠 <b className="text-foreground">{b.stats.today}</b>건 (전일 대비 <Delta value={b.stats.delta} />)
      </p>
      {b.trends.length ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">트렌드 TOP 5</p>
          <div className="flex flex-wrap gap-1">
            {b.trends.map((t) => (
              <Badge key={t.keyword} variant={t.is_new ? "default" : "secondary"}>
                #{t.keyword} {t.count}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">AI 핵심 인사이트</p>
        <AIInsightsBlock ai={b.ai_insights} compact />
      </div>
    </div>
  );
}

/**
 * 대시보드 최상단 브리핑: 24시간 건수 + AI 핵심 인사이트만
 * (키워드·주제 변화는 같은 화면의 '급상승 키워드'·'트렌드 한눈에'에 있으므로 중복 표시하지 않음)
 */
export function BriefingHero({ b }: { b: BriefingContent }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-xs text-muted-foreground">
        최근 24시간 콘텐츠 <b className="text-base font-bold tabular-nums text-foreground">{b.stats.today}</b>건 (전일 대비 <Delta value={b.stats.delta} />)
      </p>
      <AIInsightsBlock ai={b.ai_insights} columns />
    </div>
  );
}

/** 브리핑 전체 (6개 섹션) */
export function BriefingFull({ b }: { b: BriefingContent }) {
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="오늘의 주요 기술 트렌드 TOP 5">
        <H n={1}>오늘의 주요 기술 트렌드 TOP 5</H>
        {b.trends.length === 0 ? (
          <p className="text-xs text-muted-foreground">최근 24시간 키워드가 없습니다.</p>
        ) : (
          <ol className="grid gap-1 sm:grid-cols-2">
            {b.trends.map((t, i) => (
              <li key={t.keyword} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                <Link href={`/trending?period=daily&limit=50&kw=${encodeURIComponent(t.keyword)}`} className="hover:text-primary">
                  {i + 1}. #{t.keyword}
                  {t.is_new ? <Badge className="ml-1.5">NEW</Badge> : null}
                </Link>
                <span className="flex items-center gap-2 text-xs tabular-nums">
                  {t.count}건 <Delta value={t.delta} />
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">키워드 빈도 집계 결과이며 AI 분석이 아닙니다.</p>
      </section>

      <section aria-label="주요 신규 콘텐츠 TOP 10">
        <H n={2}>주요 신규 콘텐츠 TOP 10</H>
        {b.new_content.length === 0 ? (
          <p className="text-xs text-muted-foreground">최근 24시간 신규 콘텐츠가 없습니다.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {b.new_content.map((c, i) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0">
                  <OpenDetailButton contentId={c.id} className="font-medium hover:text-primary">
                    {c.title}
                  </OpenDetailButton>
                  <span className="block text-[11px] text-muted-foreground">
                    {c.source_name}
                    {c.provenance === "demo" ? " · DEMO" : ""}
                    {c.note ? ` · ${c.note}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="관심 주제별 업데이트">
        <H n={3}>관심 주제별 업데이트</H>
        <ul className="grid gap-1 sm:grid-cols-2">
          {b.topic_updates.map((t) => (
            <li key={t.id} className="rounded-md border px-3 py-1.5 text-sm">
              <span className="flex items-center justify-between">
                <Link href={`/topics/${t.id}`} className="font-medium hover:text-primary">
                  {t.name}
                </Link>
                <span className="flex items-center gap-2 text-xs tabular-nums">
                  {t.count}건 <Delta value={t.delta} />
                </span>
              </span>
              {t.top ? (
                <OpenDetailButton contentId={t.top.id} className="line-clamp-1 text-[11px] text-muted-foreground hover:text-primary">
                  {t.top.title}
                </OpenDetailButton>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="주요 인플루언서 콘텐츠">
        <H n={4}>주요 인플루언서 콘텐츠</H>
        {b.influencer_content.length === 0 ? (
          <p className="text-xs text-muted-foreground">최근 24시간 My Following에 등록된 콘텐츠 링크가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {b.influencer_content.map((l) => (
              <li key={`${l.url}-${l.date}`}>
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-primary">
                  {l.title ?? l.url}
                </a>
                <span className="block text-[11px] text-muted-foreground">
                  {l.influencer}
                  {l.company ? ` · ${l.company}` : ""} · {formatDate(l.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="AI가 선정한 핵심 인사이트">
        <H n={5}>AI가 선정한 핵심 인사이트</H>
        <AIInsightsBlock ai={b.ai_insights} />
      </section>

      <section aria-label="전일 대비 주요 변화">
        <H n={6}>전일 대비 주요 변화</H>
        <ul className="flex flex-col gap-1.5 text-sm">
          <li>
            콘텐츠 수: {b.stats.previous}건 → {b.stats.today}건 <Delta value={b.changes.total_delta} />
          </li>
          <li>
            급상승 키워드:{" "}
            {b.changes.rising.length ? b.changes.rising.map((r) => `#${r.keyword}(+${r.delta})`).join(", ") : <span className="text-muted-foreground">없음</span>}
          </li>
          <li>
            새로 등장한 키워드:{" "}
            {b.changes.new_keywords.length ? b.changes.new_keywords.map((k) => `#${k}`).join(", ") : <span className="text-muted-foreground">없음</span>}
          </li>
          <li>
            줄어든 키워드:{" "}
            {b.changes.falling.length ? b.changes.falling.map((r) => `#${r.keyword}(${r.delta})`).join(", ") : <span className="text-muted-foreground">없음</span>}
          </li>
          <li>
            업데이트가 늘어난 주제:{" "}
            {b.changes.topics_up.length ? b.changes.topics_up.map((t) => `${t.name}(+${t.delta})`).join(", ") : <span className="text-muted-foreground">없음</span>}
          </li>
        </ul>
      </section>
    </div>
  );
}
