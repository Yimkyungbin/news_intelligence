"use client";

import { useOptimistic, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setAllSourcesAIAllowed, setAllSourcesEnabled } from "./source-actions";
import { cn } from "@/lib/utils";

/**
 * 열 헤더용 전체 on/off 스위치.
 * kind="use": 내 계정 기준 소스 사용 전체 켜기/끄기
 * kind="ai": 운영자용 AI 번역·요약 전체 허용/차단
 * 일부만 켜진 상태는 aria-checked="mixed" 로 표시하고, 누르면 전체 켜기로 동작한다.
 */
export function BulkToggle({ kind, onCount, total }: { kind: "use" | "ai"; onCount: number; total: number }) {
  const allOn = total > 0 && onCount >= total;
  const [state, setState] = useOptimistic<{ on: number }>({ on: onCount });
  const [pending, start] = useTransition();
  const optimisticAllOn = total > 0 && state.on >= total;
  const mixed = state.on > 0 && !optimisticAllOn;
  const next = !allOn; // 전체 켜짐이면 끄기, 아니면(일부·전체 꺼짐) 켜기
  const what = kind === "ai" ? "AI 번역·요약" : "사용";
  const label = `${what} 전체 ${next ? (kind === "ai" ? "허용" : "켜기") : kind === "ai" ? "차단" : "끄기"} (현재 ${onCount}/${total})`;

  const run = () => {
    let msg: string | null = null;
    if (kind === "ai") {
      msg = next
        ? `모든 출처(${total}개)의 AI 번역·요약을 허용할까요?\n제목과 짧은 요약이 OpenAI로 전송되며, 번역은 백그라운드에서 생성됩니다.`
        : `모든 출처의 AI 번역·요약을 차단할까요?\n기존 번역·시사점·AI 요약이 삭제됩니다.`;
    } else if (!next) {
      msg = `모든 소스(${total}개)를 끌까요?\n수집을 멈추고 피드에서 숨깁니다. 저장한 글은 유지됩니다.`;
    }
    if (msg && !window.confirm(msg)) return;
    start(async () => {
      setState({ on: next ? total : 0 });
      const res = kind === "ai" ? await setAllSourcesAIAllowed(next) : await setAllSourcesEnabled(next);
      if (res?.ok) toast.success(res.message);
      else if (res) toast.error(res.message);
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={mixed ? "mixed" : optimisticAllOn}
        aria-label={label}
        aria-busy={pending}
        title={label}
        disabled={pending || total === 0}
        onClick={run}
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          optimisticAllOn ? "bg-primary" : mixed ? "bg-primary/50" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block h-3 w-3 rounded-full bg-background shadow transition-transform",
            optimisticAllOn ? "translate-x-3.5" : mixed ? "translate-x-2" : "translate-x-0.5",
          )}
        />
      </button>
      {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
      <span className="text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
        {state.on}/{total}
      </span>
    </span>
  );
}
