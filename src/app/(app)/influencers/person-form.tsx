"use client";

import { useActionState, useCallback } from "react";
import { Field, Input, Switch, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { FieldError, SubmitButton, useActionToast } from "@/components/forms";
import { INFLUENCER_CATEGORIES, type ActionState, type Influencer } from "@/lib/types";
import { pickValue } from "@/lib/utils";

export function PersonForm({
  action,
  person,
  onDone,
  submitLabel,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  person?: Influencer;
  onDone?: () => void;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const done = useCallback(() => onDone?.(), [onDone]);
  useActionToast(state, done);
  const p = person?.id ?? "new";
  const errors = state?.errors;
  const v = state?.ok ? undefined : state?.values;
  const categories = v ? ((v.category as string[] | undefined) ?? []) : (person?.category ?? []);

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-3">
      <Field label="이름 *" htmlFor={`pname-${p}`}>
        <Input id={`pname-${p}`} name="name" required maxLength={100} defaultValue={pickValue(v, "name", person?.name ?? "")} />
        <FieldError errors={errors} name="name" />
      </Field>
      <Field label="직책" htmlFor={`ptitle-${p}`}>
        <Input id={`ptitle-${p}`} name="job_title" maxLength={200} defaultValue={pickValue(v, "job_title", person?.job_title ?? "")} />
      </Field>
      <Field label="회사" htmlFor={`pcompany-${p}`}>
        <Input id={`pcompany-${p}`} name="company" maxLength={200} defaultValue={pickValue(v, "company", person?.company ?? "")} />
      </Field>
      <Field label="LinkedIn 프로필 URL" htmlFor={`plinkedin-${p}`} className="md:col-span-3" hint="링크만 저장하며 LinkedIn에서 데이터를 가져오지 않습니다.">
        <Input
          id={`plinkedin-${p}`}
          name="linkedin_url"
          type="url"
          inputMode="url"
          placeholder="https://www.linkedin.com/in/..."
          defaultValue={pickValue(v, "linkedin_url", person?.linkedin_url ?? "")}
        />
        <FieldError errors={errors} name="linkedin_url" />
      </Field>
      <fieldset className="md:col-span-3">
        <legend className="mb-1.5 text-xs font-medium">관심 분야</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {INFLUENCER_CATEGORIES.map((c) => (
            <label key={c} className="inline-flex items-center gap-1.5 text-xs">
              <input type="checkbox" name="category" value={c} defaultChecked={categories.includes(c)} className="accent-[var(--primary)]" />
              {c}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="개인 메모" htmlFor={`pnotes-${p}`} className="md:col-span-3">
        <Textarea id={`pnotes-${p}`} name="notes" rows={2} maxLength={4000} defaultValue={pickValue(v, "notes", person?.notes ?? "")} />
      </Field>
      <div className="flex items-center justify-between md:col-span-3">
        <Switch id={`pactive-${p}`} name="is_active" defaultChecked={v ? v.is_active === "on" : (person?.is_active ?? true)} label="활성화" />
        <div className="flex gap-2">
          {onDone ? (
            <Button variant="ghost" size="sm" onClick={onDone}>
              취소
            </Button>
          ) : null}
          <SubmitButton size="sm" pendingText="저장 중...">
            {submitLabel}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
