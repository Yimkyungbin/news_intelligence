"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setSourceAIAllowed, setSourceEnabled } from "./source-actions";
import { cn } from "@/lib/utils";

/** 소스 on/off 스위치 (role="switch"). kind="ai" 는 운영자용 AI 번역·요약 허용 */
export function SourceToggle({ sourceId, name, enabled, kind = "use" }: { sourceId: string; name: string; enabled: boolean; kind?: "use" | "ai" }) {
  const [on, setOn] = useOptimistic(enabled);
  const [pending, start] = useTransition();
  const action = kind === "ai" ? setSourceAIAllowed : setSourceEnabled;
  const label = kind === "ai" ? `${name} AI 번역·요약 ${on ? "차단" : "허용"}` : `${name} ${on ? "끄기" : "켜기"}`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOn(!on);
          const res = await action(sourceId, !on);
          if (res?.ok) toast.success(res.message);
          else if (res) toast.error(res.message);
        })
      }
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        on ? "bg-primary" : "bg-input",
      )}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-background shadow transition-transform", on ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}
