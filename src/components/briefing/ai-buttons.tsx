"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateBriefingNow, generateTopicIntelligence } from "@/app/(app)/ai/actions";
import { Button } from "@/components/ui/button";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string } | null>) =>
    start(async () => {
      const res = await fn();
      if (res?.ok) toast.success(res.message);
      else if (res) toast.error(res.message);
      router.refresh();
    });
  return { pending, run };
}

export function GenerateBriefingButton({ label = "지금 생성" }: { label?: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="secondary" disabled={pending} aria-busy={pending} onClick={() => run(generateBriefingNow)}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
      {pending ? "생성 중..." : label}
    </Button>
  );
}

export function GenerateTopicInsightButton({ topicId, hasInsight }: { topicId: string; hasInsight: boolean }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="secondary" disabled={pending} aria-busy={pending} onClick={() => run(() => generateTopicIntelligence(topicId))}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
      {pending ? "분석 중..." : hasInsight ? "AI 인사이트 다시 생성" : "AI 인사이트 생성"}
    </Button>
  );
}
