"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">문제가 발생했습니다</p>
      {/* 내부 오류 상세는 노출하지 않고 digest 만 표시 */}
      <p className="text-xs text-muted-foreground">잠시 후 다시 시도하세요.{error.digest ? ` (코드: ${error.digest})` : ""}</p>
      <Button size="sm" variant="outline" onClick={reset}>
        다시 시도
      </Button>
    </div>
  );
}
