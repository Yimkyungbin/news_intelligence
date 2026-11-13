import Link from "next/link";
import { categoryDef } from "@/lib/categories";
import { cn } from "@/lib/utils";

/** 카테고리 칩: 누르면 Trending 카테고리 탭에서 해당 카테고리 콘텐츠 모아보기 */
export function CategoryChip({ slug, period = "weekly", className, count }: { slug: string; period?: string; className?: string; count?: number }) {
  const def = categoryDef(slug);
  if (!def) return null;
  return (
    <Link
      href={`/trending?view=category&cat=${def.slug}&period=${period}`}
      title={`${def.label}: ${def.description}`}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium hover:opacity-80", def.chip, className)}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: def.color }} aria-hidden="true" />
      {def.label}
      {count !== undefined ? <span className="tabular-nums opacity-80">{count}</span> : null}
    </Link>
  );
}
