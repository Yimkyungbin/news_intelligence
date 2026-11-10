"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SourceLogo } from "@/components/sources/source-logo";
import { OpenDetailButton } from "@/components/content/content-detail";
import { Badge } from "@/components/ui/primitives";
import { cn, formatDate } from "@/lib/utils";
import type { SourceLogo as Logo } from "@/lib/sources/registry";

export type TopicUpdate = {
  id: string;
  name: string;
  count: number;
  items: { id: string; title: string; date: string; sourceName: string; logo: Logo }[];
};

/** My Topics Update: 주제 행을 펼쳐 최신 콘텐츠를 바로 확인 */
export function TopicUpdateList({ topics }: { topics: TopicUpdate[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="flex flex-col divide-y">
      {topics.map((t) => {
        const open = openId === t.id;
        const panelId = `topic-update-${t.id}`;
        return (
          <li key={t.id} className="py-1.5">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : t.id)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={`${t.name} 최신 콘텐츠 ${open ? "접기" : "펼치기"} (${t.count}건)`}
              disabled={t.count === 0}
              className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{t.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{t.items[0]?.title ?? "새 콘텐츠 없음"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Badge variant={t.count ? "default" : "outline"}>{t.count}</Badge>
                {t.count ? (
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
                ) : null}
              </span>
            </button>
            {open ? (
              <div id={panelId} className="mt-1 flex flex-col gap-1 pl-1">
                <ul className="flex flex-col gap-1" aria-label={`${t.name} 최신 콘텐츠`}>
                  {t.items.map((it) => (
                    <li key={it.id} className="flex items-start gap-2 rounded-md px-1 py-1 hover:bg-accent/60">
                      <SourceLogo logo={it.logo} size="xs" className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <OpenDetailButton contentId={it.id} className="line-clamp-2 block w-full text-xs font-medium leading-snug hover:text-primary">
                          {it.title}
                        </OpenDetailButton>
                        <span className="text-[11px] text-muted-foreground">
                          {it.sourceName} · {formatDate(it.date)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href={`/topics/${t.id}`} className="self-end px-1 text-[11px] text-primary hover:underline">
                  {t.name} 전체 보기 ({t.count}건)
                </Link>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
