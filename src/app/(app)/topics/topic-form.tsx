"use client";

import { useActionState, useCallback } from "react";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { FieldError, SubmitButton, useActionToast } from "@/components/forms";
import type { ActionState, Topic } from "@/lib/types";
import { pickValue } from "@/lib/utils";

export function TopicForm({
  action,
  topic,
  onDone,
  submitLabel,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  topic?: Topic;
  onDone?: () => void;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const done = useCallback(() => onDone?.(), [onDone]);
  useActionToast(state, done);
  const p = topic?.id ?? "new";
  const errors = state?.errors;
  const v = state?.ok ? undefined : state?.values;

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <Field label="주제명 *" htmlFor={`name-${p}`}>
        <Input id={`name-${p}`} name="name" required maxLength={100} defaultValue={pickValue(v, "name", topic?.name ?? "")} placeholder="예: Agentic AI" />
        <FieldError errors={errors} name="name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="우선순위" htmlFor={`priority-${p}`}>
          <Select id={`priority-${p}`} name="priority" defaultValue={pickValue(v, "priority", String(topic?.priority ?? 3))}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} {n === 5 ? "(최고)" : n === 1 ? "(낮음)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="수집 언어" htmlFor={`language-${p}`}>
          <Select id={`language-${p}`} name="language" defaultValue={pickValue(v, "language", topic?.language ?? "all")}>
            <option value="all">전체</option>
            <option value="ko">한국어</option>
            <option value="en">영어</option>
          </Select>
        </Field>
      </div>
      <Field label="설명" htmlFor={`description-${p}`} className="md:col-span-2">
        <Textarea id={`description-${p}`} name="description" maxLength={1000} rows={2} defaultValue={pickValue(v, "description", topic?.description ?? "")} />
      </Field>
      <Field label="키워드" htmlFor={`keywords-${p}`} hint="쉼표 또는 줄바꿈으로 구분 (최대 30개)">
        <Textarea id={`keywords-${p}`} name="keywords" rows={2} defaultValue={pickValue(v, "keywords", topic?.keywords.join(", ") ?? "")} placeholder="agentic ai, ai agent" />
      </Field>
      <Field label="검색 쿼리" htmlFor={`queries-${p}`} hint="수집 시 사용할 쿼리 (최대 20개)">
        <Textarea id={`queries-${p}`} name="search_queries" rows={2} defaultValue={pickValue(v, "search_queries", topic?.search_queries.join("\n") ?? "")} placeholder={'"agentic AI" enterprise'} />
      </Field>
      <div className="flex items-center justify-between gap-2 md:col-span-2">
        <Switch id={`active-${p}`} name="is_active" defaultChecked={v ? v.is_active === "on" : (topic?.is_active ?? true)} label="수집 활성화" />
        <div className="flex gap-2">
          {onDone && topic ? (
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
