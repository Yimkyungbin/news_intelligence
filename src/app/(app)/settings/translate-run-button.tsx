"use client";

import { useTransition } from "react";
import { Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { runSystemTranslation } from "./source-actions";
import { Button } from "@/components/ui/button";

/** 운영자용: 누락된 번역·시사점 생성 (허용 스위치를 다시 누를 필요 없음) */
export function TranslateRunButton({ translated, target }: { translated: number; target: number }) {
  const [pending, start] = useTransition();
  const missing = Math.max(0, target - translated);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs">
      <Languages className="h-4 w-4 text-primary" aria-hidden="true" />
      <span className="mr-auto" aria-label="번역 현황">
        <b>한국어 번역</b> · 내 외국어 콘텐츠 {target.toLocaleString("ko-KR")}건 중 {translated.toLocaleString("ko-KR")}건 번역됨
        {missing ? <span className="text-muted-foreground"> (미번역 {missing.toLocaleString("ko-KR")}건, 1회 최대 100건)</span> : null}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            const res = await runSystemTranslation();
            if (res?.ok) toast.success(res.message);
            else if (res) toast.error(res.message);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Languages aria-hidden="true" />}
        누락 번역 생성
      </Button>
    </div>
  );
}
