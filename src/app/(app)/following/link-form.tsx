"use client";

import { useActionState, useRef } from "react";
import { Input } from "@/components/ui/primitives";
import { FieldError, SubmitButton, useActionToast } from "@/components/forms";
import { addPersonLink } from "./actions";
import { pickValue } from "@/lib/utils";

export function LinkForm({ personId }: { personId: string }) {
  const [state, action] = useActionState(addPersonLink.bind(null, personId), null);
  const ref = useRef<HTMLFormElement>(null);
  useActionToast(state, () => ref.current?.reset());
  const v = state?.ok ? undefined : state?.values;

  return (
    <form ref={ref} action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex-1">
        <label htmlFor={`lurl-${personId}`} className="sr-only">
          콘텐츠 URL
        </label>
        <Input id={`lurl-${personId}`} name="url" type="url" required placeholder="게시글/블로그 URL" defaultValue={pickValue(v, "url", "")} className="h-8 text-xs" />
        <FieldError errors={state?.errors} name="url" />
      </div>
      <label htmlFor={`ltitle-${personId}`} className="sr-only">
        제목
      </label>
      <Input id={`ltitle-${personId}`} name="title" maxLength={300} placeholder="제목(선택)" defaultValue={pickValue(v, "title", "")} className="h-8 text-xs sm:w-48" />
      <label htmlFor={`ldate-${personId}`} className="sr-only">
        게시일
      </label>
      <Input id={`ldate-${personId}`} name="posted_at" type="date" defaultValue={pickValue(v, "posted_at", "")} className="h-8 text-xs sm:w-36" />
      <SubmitButton size="sm" variant="secondary">
        링크 추가
      </SubmitButton>
    </form>
  );
}
