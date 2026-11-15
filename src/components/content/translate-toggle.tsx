"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setTranslatePreference } from "@/app/(app)/content/pref-actions";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

/** 백그라운드 번역 대기 시 자동 새로고침 간격·최대 횟수 (번역할 수 없는 콘텐츠가 남아도 무한 반복하지 않음) */
// 1단계(제목) 번역이 수 초 안에 끝나므로 짧게, 최대 1분
const REFRESH_MS = 5_000;
const MAX_REFRESH = 12;

/**
 * "한국어로 보기" 토글 (Dashboard·Trending·Papers·주제 상세·Saved Posts·Knowledge Base 공통, 사용자 설정 하나)
 * untranslated: 이 화면의 외국어 콘텐츠 중 아직 번역이 없는 건수. 켜져 있고 남아 있으면 '번역 중' 표시 후 자동 새로고침
 */
export function TranslateToggle({ on: initial, untranslated = 0 }: { on: boolean; untranslated?: number }) {
  const [on, setOn] = useOptimistic(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [refreshes, setRefreshes] = useState(0);
  const waiting = on && untranslated > 0 && refreshes < MAX_REFRESH;
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => {
      setRefreshes((n) => n + 1);
      router.refresh();
    }, REFRESH_MS);
    return () => clearTimeout(t);
    // refreshes 를 넣어 새로고침마다 다음 타이머를 다시 건다 (건수가 그대로여도 최대 MAX_REFRESH 회까지)
  }, [waiting, refreshes, router]);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs">
      {waiting ? (
        <span className="inline-flex items-center gap-1 text-muted-foreground" role="status" aria-label={`번역 중 ${untranslated}건`}>
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> 번역 중 {untranslated}건
          <span className="mx-0.5 h-3 w-px bg-border" aria-hidden="true" />
        </span>
      ) : null}
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
        <span className="block">번역은 수집 후 자동으로 만들어집니다. 아직 번역되지 않은 콘텐츠는 원문으로 보입니다.</span>
      </InfoTip>
    </span>
  );
}
