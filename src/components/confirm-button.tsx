"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionState } from "@/lib/types";

/** 확인 후 서버 액션 실행 (삭제 등) */
export function ConfirmButton({
  action,
  confirmText,
  children,
  ...props
}: ButtonProps & { action: () => Promise<ActionState>; confirmText: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        start(async () => {
          const res = await action();
          if (res?.ok) toast.success(res.message ?? "완료했습니다.");
          else if (res) toast.error(res.message ?? "실패했습니다.");
        });
      }}
    >
      {children}
    </Button>
  );
}

/** 확인 없이 서버 액션 실행 (토글 등) */
export function ActionButton({
  action,
  children,
  ...props
}: ButtonProps & { action: () => Promise<ActionState> }) {
  const [pending, start] = useTransition();
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() =>
        start(async () => {
          const res = await action();
          if (res?.ok) toast.success(res.message ?? "완료했습니다.");
          else if (res) toast.error(res.message ?? "실패했습니다.");
        })
      }
    >
      {children}
    </Button>
  );
}
