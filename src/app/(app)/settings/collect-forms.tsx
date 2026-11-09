"use client";

import { useActionState, useRef, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { addUserFeed, collectNow } from "./collect-actions";
import { Field, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { FieldError, SubmitButton, useActionToast } from "@/components/forms";
import { pickValue } from "@/lib/utils";

export function CollectNowButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const res = await collectNow();
          if (res?.ok) toast.success(res.message);
          else if (res) toast.error(res.message);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden="true" />
      {pending ? "수집 중..." : "지금 수집"}
    </Button>
  );
}

export function AddFeedForm() {
  const [state, action] = useActionState(addUserFeed, null);
  const ref = useRef<HTMLFormElement>(null);
  useActionToast(state, () => ref.current?.reset());
  const v = state?.ok ? undefined : state?.values;
  return (
    <form ref={ref} action={action} className="grid gap-2 md:grid-cols-[1fr_2fr_auto] md:items-end">
      <Field label="피드 이름" htmlFor="feed-name">
        <Input id="feed-name" name="name" required maxLength={100} placeholder="예: 개인 기술 블로그" defaultValue={pickValue(v, "name", "")} />
        <FieldError errors={state?.errors} name="name" />
      </Field>
      <Field label="RSS / Atom URL" htmlFor="feed-url" hint="https 피드만 등록할 수 있으며, 등록 전에 피드를 한 번 읽어 확인합니다.">
        <Input id="feed-url" name="url" type="url" required placeholder="https://example.com/feed.xml" defaultValue={pickValue(v, "url", "")} />
        <FieldError errors={state?.errors} name="url" />
      </Field>
      <SubmitButton size="sm" pendingText="확인 중..." className="md:mb-5">
        피드 추가
      </SubmitButton>
    </form>
  );
}
