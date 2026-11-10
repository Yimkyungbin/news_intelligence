"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateTrendIntelligence } from "@/app/(app)/ai/actions";
import { Button } from "@/components/ui/button";

export function GenerateTrendInsightButton({ params, hasInsight }: { params: Record<string, string>; hasInsight: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const res = await generateTrendIntelligence(params);
          if (res?.ok) toast.success(res.message);
          else if (res) toast.error(res.message);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
      {pending ? "분석 중..." : hasInsight ? "AI 시사점 다시 생성" : "AI 시사점 생성"}
    </Button>
  );
}
