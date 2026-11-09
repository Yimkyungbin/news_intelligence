import { ExternalLink, ShieldOff } from "lucide-react";
import { SourceBadge } from "@/components/sources/source-badge";
import { Badge } from "@/components/ui/primitives";
import { SaveButton } from "./save-button";
import { popularityEntries } from "@/lib/content";
import { cn, formatDate } from "@/lib/utils";
import type { ContentItem } from "@/lib/types";

/**
 * 콘텐츠 카드: 출처 로고·출처명·유형을 최상단에 표시해 수집처를 즉시 구분
 */
export function ContentCard({
  item,
  saved,
  rank,
  compact = false,
  footer,
}: {
  item: ContentItem;
  saved: boolean;
  rank?: number;
  compact?: boolean;
  footer?: React.ReactNode;
}) {
  const metrics = popularityEntries(item.popularity);
  const authorMeta = [item.author_title, item.author_company].filter(Boolean).join(" · ");

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

        <a
          href={item.original_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-1.5 line-clamp-2 block text-sm font-medium leading-snug hover:text-primary"
        >
          {item.title}
        </a>

        {!compact && item.summary ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary}</p>
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
          {!compact && !item.ai_processing_allowed ? (
            <span className="inline-flex items-center gap-1" title="권한이 확인되지 않아 AI 요약을 실행하지 않습니다.">
              <ShieldOff className="h-3 w-3" aria-hidden="true" /> AI 처리 미허용
            </span>
          ) : null}
        </div>

        {!compact && item.keywords?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.keywords.slice(0, 5).map((k) => (
              <Badge key={k} variant="secondary">
                #{k}
              </Badge>
            ))}
          </div>
        ) : null}
        {footer}
      </div>
    </article>
  );
}
