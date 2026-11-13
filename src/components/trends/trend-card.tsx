import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Box,
  ExternalLink,
  FileText,
  Flame,
  GraduationCap,
  Languages,
  Lightbulb,
  Link2,
  MessageCircle,
  MessagesSquare,
  Package,
  PanelRightOpen,
  TrendingUp,
} from "lucide-react";
import { SourceBadge } from "@/components/sources/source-badge";
import { SaveButton } from "@/components/content/save-button";
import { OpenDetailButton } from "@/components/content/content-detail";
import { CategoryChip } from "./category-chip";
import { CONTENT_TYPE_LABELS, displaySummary, displayTitle } from "@/lib/content";
import { isLinkOnly } from "@/lib/collectors/text";
import { categoryDef, itemCategory } from "@/lib/categories";
import { primaryMetric, SCORE_LABELS, topPercent } from "@/lib/metrics";
import { cn, formatRelative } from "@/lib/utils";
import type { ContentAIMeta } from "@/lib/types";
import type { RankedEntry } from "@/lib/trends/board";

const TYPE_ICON: Record<string, typeof FileText> = {
  article: FileText,
  post: MessageCircle,
  paper: GraduationCap,
  repository: Package,
  model: Box,
  discussion: MessagesSquare,
};

function RankChange({ change }: { change: RankedEntry["change"] }) {
  if (change === null) return null;
  if (change === "new") return <span className="text-[10px] font-semibold text-primary" title="직전 시점 순위에 없던 새 진입">NEW</span>;
  if (change === 0) return <span className="text-[10px] text-muted-foreground" title="순위 변동 없음">–</span>;
  const up = change > 0;
  return (
    <span className={cn("inline-flex items-center text-[10px] font-semibold tabular-nums", up ? "text-success" : "text-destructive")} title={`하루 전 대비 ${Math.abs(change)}계단 ${up ? "상승" : "하락"}`}>
      {up ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />}
      {Math.abs(change)}
      <span className="sr-only">{up ? "계단 상승" : "계단 하락"}</span>
    </span>
  );
}

/**
 * 트렌드 순위 카드 (메인·Trending)
 * 왼쪽: 순위·변동 / 가운데: 카테고리·유형·출처·제목·핵심 한 줄·시사점 / 오른쪽: 반응 지표
 * URL·작성자 핸들 같은 식별 정보는 카드에 노출하지 않고 상세 보기에서 확인한다.
 */
export function TrendCard({
  entry,
  saved,
  ai,
  translate,
  period = "weekly",
  compareLabel = "어제",
  showOriginal = false,
}: {
  entry: RankedEntry;
  saved: boolean;
  ai?: ContentAIMeta;
  translate: boolean;
  period?: string;
  compareLabel?: string;
  /** 번역 시 원문 제목 줄 표시 (Trending 목록) */
  showOriginal?: boolean;
}) {
  const { item, rank, change, position, growth, related } = entry;
  const cat = itemCategory(item);
  const def = categoryDef(cat);
  const Icon = TYPE_ICON[item.content_type] ?? FileText;
  const original = displayTitle(item);
  const translated = translate && item.language !== "ko" && Boolean(ai?.title_ko);
  const title = translated ? ai!.title_ko! : original;
  const rawSummary = translate && item.language !== "ko" && ai?.summary_ko ? ai.summary_ko : displaySummary(item);
  // 번역 요약도 링크만 나열된 경우는 숨김
  const summary = rawSummary && !isLinkOnly(rawSummary) ? rawSummary : null;
  const metric = primaryMetric(item.popularity);
  const comments = typeof item.popularity?.comments === "number" && item.popularity.comments > 0 ? item.popularity.comments : null;
  const percent = position ? topPercent(position.rank, position.total) : null;
  const topic = (item.topic_links ?? []).filter((l) => l.topic).sort((a, b) => b.relevance_score - a.relevance_score)[0]?.topic;

  return (
    <article className="relative flex gap-3 overflow-hidden rounded-lg border bg-card p-3 pl-4 transition-colors hover:border-primary/40">
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: def?.color }} aria-hidden="true" />
      <div className="flex w-7 shrink-0 flex-col items-center pt-0.5">
        <span className="text-lg font-bold leading-none tabular-nums">{rank}</span>
        <RankChange change={change} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <CategoryChip slug={cat} period={period} />
          {topic ? (
            <Link href={`/topics/${topic.id}`} className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 font-medium text-primary hover:bg-primary/10">
              {topic.name}
            </Link>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {CONTENT_TYPE_LABELS[item.content_type] ?? item.content_type}
          </span>
          <span aria-hidden="true">·</span>
          <SourceBadge
            name={item.source_name}
            sourceType={item.source_type}
            logoKey={item.source?.logo_key}
            url={item.original_url}
            homepageUrl={item.source?.homepage_url}
            brandColor={item.source?.brand_color}
            provenance={item.provenance}
            size="xs"
            showType={false}
          />
          <span aria-hidden="true">·</span>
          <time dateTime={item.published_at ?? item.collected_at}>{formatRelative(item.published_at ?? item.collected_at)}</time>
          {translated ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-secondary px-1" title={`원문: ${original}`}>
              <Languages className="h-3 w-3" aria-hidden="true" />
              {ai?.is_demo ? "DEMO 번역" : "번역"}
            </span>
          ) : null}
        </div>

        <OpenDetailButton contentId={item.id} className="mt-1 line-clamp-2 block w-full text-left text-[15px] font-semibold leading-snug hover:text-primary">
          {title}
        </OpenDetailButton>
        {translated && showOriginal ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">원문: {original}</p> : null}
        {summary ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{summary}</p> : null}
        {ai?.implication_ko ? (
          <p className="mt-1.5 flex gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
            <span className="line-clamp-2">
              <span className="font-semibold">시사점</span> {ai.implication_ko}
              {ai.is_demo ? <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">(DEMO)</span> : null}
            </span>
          </p>
        ) : null}
        {/* 좁은 화면: 반응 지표·동작 한 줄 */}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground sm:hidden">
          {metric ? (
            <span className="tabular-nums">
              {percent !== null ? `상위 ${percent}% · ` : ""}
              {metric.value.toLocaleString("ko-KR")} {SCORE_LABELS[metric.key]}
              {growth && growth.delta > 0 ? ` · +${growth.delta.toLocaleString("ko-KR")}` : ""}
            </span>
          ) : null}
          <span className="ml-auto flex items-center">
            <SaveButton contentId={item.id} saved={saved} />
            <a href={item.original_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent" aria-label="원문 열기 (새 탭)">
              <ExternalLink className="h-4 w-4" />
            </a>
          </span>
        </div>
      </div>

      <div className="hidden w-44 shrink-0 flex-col gap-1 border-l pl-3 text-xs sm:flex" aria-label="반응 지표">
        <div className="-mr-1 -mt-1 flex justify-end">
          <OpenDetailButton contentId={item.id} className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent">
            <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">상세 보기</span>
          </OpenDetailButton>
          <SaveButton contentId={item.id} saved={saved} />
          <a
            href={item.original_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
            aria-label="원문 열기 (새 탭)"
            title="원문 열기"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        {metric ? (
          <>
            {percent !== null ? (
              <p className="inline-flex items-center gap-1 font-semibold" title={`${item.source_name} 수집분 ${position!.total}건 중 ${position!.rank}위`}>
                <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" /> 출처 내 상위 {percent}%
              </p>
            ) : null}
            <p className="tabular-nums">
              <span className="font-semibold">{metric.value.toLocaleString("ko-KR")}</span> {SCORE_LABELS[metric.key]}
              {comments ? <span className="text-muted-foreground"> · 댓글 {comments.toLocaleString("ko-KR")}</span> : null}
            </p>
            {growth && growth.delta > 0 ? (
              <p className="inline-flex items-center gap-1 text-success tabular-nums" title={`${growth.since} 기록 대비`}>
                <TrendingUp className="h-3 w-3" aria-hidden="true" /> +{growth.delta.toLocaleString("ko-KR")} ({compareLabel} 대비)
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">반응 지표 미제공 · 최신순</p>
        )}
        {related.count > 0 ? (
          <Link
            href={`/trending?period=${period}&limit=50${related.keywords[0] ? `&kw=${encodeURIComponent(related.keywords[0])}` : ""}`}
            className="mt-auto inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
            title={related.keywords.length ? `겹치는 키워드: ${related.keywords.map((k) => `#${k}`).join(" ")}` : undefined}
          >
            <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">관련 기사 {related.count}건</span>
            {related.keywords[0] ? <span className="min-w-0 truncate">#{related.keywords[0]}</span> : null}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
