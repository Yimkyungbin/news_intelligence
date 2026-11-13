import Link from "next/link";
import { ExternalLink, Languages, Lightbulb, PanelRightOpen, ShieldOff } from "lucide-react";
import { SourceBadge } from "@/components/sources/source-badge";
import { SaveButton } from "./save-button";
import { OpenDetailButton } from "./content-detail";
import { displaySummary, displayTitle, popularityEntries } from "@/lib/content";
import { itemCategory } from "@/lib/categories";
import { CategoryChip } from "@/components/trends/category-chip";
import { normalizeKeywords } from "@/lib/keywords";
import { cn, formatDate } from "@/lib/utils";
import type { ContentAIMeta, ContentItem } from "@/lib/types";

/**
 * 콘텐츠 카드: 출처 로고·출처명·유형을 최상단에 표시해 수집처를 즉시 구분
 * 제목을 누르면 원문으로 이동하지 않고 상세 보기 패널이 열린다 (원문은 ↗ 버튼)
 */
export function ContentCard({
  item,
  saved,
  rank,
  rankNote,
  compact = false,
  footer,
  ai,
  translate = false,
}: {
  item: ContentItem;
  saved: boolean;
  rank?: number;
  /** 순위 근거 (예: "GitHub 내 1위/53") */
  rankNote?: string;
  compact?: boolean;
  footer?: React.ReactNode;
  /** 번역·한 줄 시사점 (운영자가 허용한 출처만 존재) */
  ai?: ContentAIMeta;
  /** 사용자 "한국어로 보기" 설정 */
  translate?: boolean;
}) {
  const metrics = popularityEntries(item.popularity);
  const authorMeta = [item.author_title, item.author_company].filter(Boolean).join(" · ");
  const keywords = normalizeKeywords(item.keywords, 5);
  const topics = (item.topic_links ?? [])
    .filter((l) => l.topic)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, compact ? 2 : 3)
    .map((l) => l.topic!);
  // 번역: 토글이 켜져 있고, 외국어 콘텐츠이며, 번역이 있을 때만
  const translated = translate && item.language !== "ko" && Boolean(ai?.title_ko);
  const original = displayTitle(item);
  const title = translated ? ai!.title_ko! : original;
  const summary = translate && item.language !== "ko" && ai?.summary_ko ? ai.summary_ko : displaySummary(item);

  return (
    <article
      className={cn(
        "group flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40",
        item.provenance === "demo" && "border-dashed",
      )}
    >
      {rank !== undefined ? (
        <span className="w-5 shrink-0 pt-0.5 text-right text-sm font-semibold tabular-nums text-muted-foreground">{rank}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <SourceBadge
            name={item.source_name}
            sourceType={item.source_type}
            logoKey={item.source?.logo_key}
            url={item.original_url}
            homepageUrl={item.source?.homepage_url}
            brandColor={item.source?.brand_color}
            provenance={item.provenance}
          />
          <div className="flex shrink-0 items-center">
            <OpenDetailButton
              contentId={item.id}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
            >
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
        </div>

        {topics.length || item.content_type ? (
          <div className="mt-1.5 flex flex-wrap gap-1" aria-label="카테고리·연결된 관심 주제">
            <CategoryChip slug={itemCategory(item)} />
            {topics.map((t) => (
              <Link key={t.id} href={`/topics/${t.id}`} className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10">
                {t.name}
              </Link>
            ))}
          </div>
        ) : null}

        <OpenDetailButton contentId={item.id} className="mt-1.5 line-clamp-2 block w-full text-sm font-semibold leading-snug hover:text-primary">
          {title}
        </OpenDetailButton>
        {translated ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground" title="원문 제목">
            <Languages className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="shrink-0 rounded bg-secondary px-1">{ai?.is_demo ? "DEMO 번역" : "번역"}</span>
            <span className="truncate">원문: {original}</span>
          </p>
        ) : null}

        {summary ? (
          <p className={cn("mt-1 text-xs leading-relaxed text-muted-foreground", compact ? "line-clamp-1" : "line-clamp-3")}>{summary}</p>
        ) : null}

        {ai?.implication_ko ? (
          <p className={cn("mt-1.5 flex gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-foreground", compact && "line-clamp-1")}>
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              <span className="font-semibold">시사점</span> {ai.implication_ko}
              {ai.is_demo ? <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">(DEMO)</span> : null}
            </span>
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {item.author ? (
            <span>
              {item.author}
              {authorMeta ? <span className="text-muted-foreground/70"> ({authorMeta})</span> : null}
            </span>
          ) : null}
          <span>{formatDate(item.published_at ?? item.collected_at)}</span>
          {metrics.map((m) => (
            <span key={m.key} className="tabular-nums">
              {m.value.toLocaleString("ko-KR")} {m.label}
            </span>
          ))}
          {rankNote ? (
            <span className="rounded bg-primary/10 px-1 text-primary" title="출처마다 지표 규모가 달라 출처 안에서의 순위로 비교합니다">
              {rankNote}
            </span>
          ) : null}
          {!compact && !item.ai_processing_allowed ? (
            <span className="inline-flex items-center gap-1" title="권한이 확인되지 않아 AI 요약을 실행하지 않습니다.">
              <ShieldOff className="h-3 w-3" aria-hidden="true" /> AI 처리 미허용
            </span>
          ) : null}
        </div>

        {!compact && keywords.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {keywords.map((k) => (
              <Link
                key={k}
                href={`/trending?period=monthly&limit=50&kw=${encodeURIComponent(k)}`}
                className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground hover:bg-accent"
              >
                #{k}
              </Link>
            ))}
          </div>
        ) : null}
        {footer}
      </div>
    </article>
  );
}
