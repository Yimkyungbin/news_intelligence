"use client";

import { useTransition } from "react";
import { Loader2, ShieldOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { setAllSourcesAIAllowed } from "./source-actions";
import { Button } from "@/components/ui/button";

/** 운영자용: 모든 출처 AI 번역·요약 일괄 허용(+번역 실행) / 일괄 차단 */
export function BulkAIButtons({ allowedCount, total }: { allowedCount: number; total: number }) {
  const [pending, start] = useTransition();
  const run = (allowed: boolean) => {
    const msg = allowed
      ? `모든 출처(${total}개)의 AI 번역·요약을 허용하고 최근 콘텐츠를 바로 번역할까요?\n제목과 짧은 요약이 OpenAI로 전송됩니다.`
      : "모든 출처의 AI 번역·요약을 차단할까요? 기존 번역·시사점·AI 요약이 삭제됩니다.";
    if (!window.confirm(msg)) return;
    start(async () => {
      const res = await setAllSourcesAIAllowed(allowed);
      if (res?.ok) toast.success(res.message);
      else if (res) toast.error(res.message);
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
      <span className="mr-auto">
        <b>운영자 일괄 처리</b> · AI 번역·요약 허용 {allowedCount}/{total}개 출처
      </span>
      <Button size="sm" disabled={pending} aria-busy={pending} onClick={() => run(true)}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
        {pending ? "처리 중..." : "전체 허용 + 번역 실행"}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(false)}>
        <ShieldOff aria-hidden="true" /> 전체 차단
      </Button>
    </div>
  );
}
