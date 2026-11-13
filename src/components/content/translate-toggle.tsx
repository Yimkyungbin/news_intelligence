"use client";

import { useOptimistic, useTransition } from "react";
import { Languages } from "lucide-react";
import { toast } from "sonner";
import { setTranslatePreference } from "@/app/(app)/content/pref-actions";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

/** "한국어로 보기" 토글 (Dashboard·Trending·Papers·주제 상세·Saved Posts·Knowledge Base 공통, 사용자 설정 하나) */
export function TranslateToggle({ on: initial }: { on: boolean }) {
  const [on, setOn] = useOptimistic(initial);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs">
      <Languages className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span id="translate-toggle-label">한국어로 보기</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="translate-toggle-label"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setOn(!on);
            const res = await setTranslatePreference(!on);
            if (res && !res.ok) toast.error(res.message);
          })
        }
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span className={cn("inline-block h-3 w-3 rounded-full bg-background shadow transition-transform", on ? "translate-x-3.5" : "translate-x-0.5")} />
      </button>
      <InfoTip label="한국어로 보기" align="right">
        <span className="block">외국어 콘텐츠의 제목·요약을 AI 번역본으로 보여 줍니다. 원문 제목도 함께 표시됩니다.</span>
        <span className="block">운영자가 AI 번역·요약을 허용한 출처만 번역되며, 나머지는 원문 그대로 표시됩니다.</span>
      </InfoTip>
    </span>
  );
}
