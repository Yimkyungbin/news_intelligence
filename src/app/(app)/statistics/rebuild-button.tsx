"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { rebuildStats } from "./actions";
import { Button } from "@/components/ui/button";

export function RebuildStatsButton() {
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
          const res = await rebuildStats();
          if (res?.ok) toast.success(res.message);
          else if (res) toast.error(res.message);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
      {pending ? "갱신 중..." : "통계 갱신"}
    </Button>
  );
}
