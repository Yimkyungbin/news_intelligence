"use client";

import { useOptimistic, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleSave } from "@/app/(app)/saved/actions";

export function SaveButton({ contentId, saved }: { contentId: string; saved: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [pending, start] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-pressed={optimistic}
      aria-label={optimistic ? "저장 해제" : "저장"}
      title={optimistic ? "저장 해제" : "저장"}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          const res = await toggleSave(contentId, !optimistic);
          if (res && !res.ok) toast.error(res.message);
        })
      }
    >
      {optimistic ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
    </Button>
  );
}
