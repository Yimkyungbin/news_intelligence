"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 항목 설명 팝오버: ⓘ 버튼을 누르면 설명이 열리고, 바깥 클릭·Esc 로 닫힌다.
 */
export function InfoTip({
  label,
  children,
  align = "left",
  className,
}: {
  /** 설명 대상 이름 (버튼 접근성 이름: "<label> 설명") */
  label: string;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex align-middle", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label} 설명`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={panelId}
          role="note"
          className={cn(
            "absolute top-6 z-40 w-72 max-w-[80vw] rounded-lg border bg-popover p-3 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <span className="mb-1 block font-semibold">{label}</span>
          <span className="flex flex-col gap-1.5 text-muted-foreground">{children}</span>
        </span>
      ) : null}
    </span>
  );
}
