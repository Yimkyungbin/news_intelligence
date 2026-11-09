"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionState } from "@/lib/types";

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

/** 액션 결과를 toast 로 알리고, 성공 시 콜백 실행 */
export function useActionToast(state: ActionState, onSuccess?: () => void) {
  const last = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      if (state.message) toast.success(state.message);
      onSuccess?.();
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, onSuccess]);
}

export function FieldError({ errors, name }: { errors?: Record<string, string[]>; name: string }) {
  const msg = errors?.[name]?.[0];
  if (!msg) return null;
  return (
    <p className="text-[11px] text-destructive" role="alert">
      {msg}
    </p>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={state.ok ? "rounded-md bg-success/10 p-2 text-xs text-success" : "rounded-md bg-destructive/10 p-2 text-xs text-destructive"}
    >
      {state.message}
    </p>
  );
}
