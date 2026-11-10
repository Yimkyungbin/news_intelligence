import { resolveSourceLogo } from "@/lib/sources/registry";
import { SourceLogo } from "./source-logo";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  linkedin_api: "LinkedIn API",
  official_blog: "공식 블로그",
  news: "IT 뉴스",
  rss: "RSS",
  public_api: "공개 API",
  social_api: "소셜 API",
  user_provided: "직접 입력",
  demo: "DEMO",
};

export function sourceTypeLabel(t: string) {
  return TYPE_LABEL[t] ?? t;
}

/**
 * 콘텐츠 카드에 표시하는 출처 배지: [로고] 출처명 · 유형 [DEMO]
 */
export function SourceBadge({
  name,
  sourceType,
  logoKey,
  url,
  homepageUrl,
  brandColor,
  provenance,
  size = "sm",
  showType = true,
  className,
}: {
  name: string;
  sourceType: string;
  logoKey?: string | null;
  url?: string | null;
  homepageUrl?: string | null;
  brandColor?: string | null;
  provenance?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  showType?: boolean;
  className?: string;
}) {
  const isDemo = provenance === "demo" || sourceType === "demo";
  const logo = resolveSourceLogo({ logoKey, url, homepageUrl, name, brandColor, isDemo });
  // 직접 입력 콘텐츠는 도메인 로고를 쓰되 출처명은 도메인 라벨로 보완
  const display = sourceType === "user_provided" && logo.kind !== "monogram" ? logo.label : name;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <SourceLogo logo={logo} size={size} />
      <span className="truncate text-xs font-medium text-foreground/90">{display}</span>
      {showType ? (
        <span className="hidden text-[11px] text-muted-foreground sm:inline">· {sourceTypeLabel(sourceType)}</span>
      ) : null}
      {isDemo ? <Badge variant="demo">DEMO DATA</Badge> : null}
    </span>
  );
}
