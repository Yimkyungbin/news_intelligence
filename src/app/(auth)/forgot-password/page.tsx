"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "../actions";
import { Field, Input } from "@/components/ui/primitives";
import { FormMessage, SubmitButton } from "@/components/forms";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">비밀번호 재설정</h2>
      <Field label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="전송 중...">재설정 링크 받기</SubmitButton>
      <Link href="/login" className="text-center text-xs text-muted-foreground hover:text-foreground">
        로그인으로 돌아가기
      </Link>
    </form>
  );
}
