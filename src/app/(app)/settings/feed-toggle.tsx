"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setAllUserFeedsActive, setUserFeedActive } from "./collect-actions";
import { cn } from "@/lib/utils";

function Switch({ on, label, disabled, onClick, small = false }: { on: boolean; label: string; disabled: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        small ? "h-4 w-7" : "h-5 w-9",
        on ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "inline-block rounded-full bg-background shadow transition-transform",
          small ? "h-3 w-3" : "h-4 w-4",
          on ? (small ? "translate-x-3.5" : "translate-x-4") : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** 내 RSS 피드 하나의 수집 on/off */
export function FeedToggle({ feedId, name, active }: { feedId: string; name: string; active: boolean }) {
  const [on, setOn] = useOptimistic(active);
  const [pending, start] = useTransition();
  return (
    <Switch
      on={on}
      label={`${name} 수집 ${on ? "끄기" : "켜기"}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOn(!on);
          const res = await setUserFeedActive(feedId, !on);
          if (res?.ok) toast.success(res.message);
          else if (res) toast.error(res.message);
        })
      }
    />
  );
}

/** 내 RSS 피드 전체 수집 on/off (모두 켜져 있으면 끄기, 하나라도 꺼져 있으면 켜기) */
export function FeedBulkToggle({ activeCount, total }: { activeCount: number; total: number }) {
  const allOn = total > 0 && activeCount >= total;
  const [on, setOn] = useOptimistic(allOn);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="tabular-nums">
        수집 중 {activeCount}/{total}
      </span>
      <Switch
        small
        on={on}
        label={`내 피드 전체 수집 ${allOn ? "끄기" : "켜기"}`}
        disabled={pending || total === 0}
        onClick={() =>
          start(async () => {
            setOn(!allOn);
            const res = await setAllUserFeedsActive(!allOn);
            if (res?.ok) toast.success(res.message);
            else if (res) toast.error(res.message);
          })
        }
      />
    </span>
  );
}
