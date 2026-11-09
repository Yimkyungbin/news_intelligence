"use client";

import { useActionState } from "react";
import { updatePassword } from "../../actions";
import { Field, Input } from "@/components/ui/primitives";
import { FormMessage, SubmitButton } from "@/components/forms";

export default function UpdatePasswordPage() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">새 비밀번호 설정</h2>
      <Field label="새 비밀번호" htmlFor="password" hint="8자 이상">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="비밀번호 확인" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="변경 중...">변경하기</SubmitButton>
    </form>
  );
}
