"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "../actions";
import { Field, Input } from "@/components/ui/primitives";
import { FormMessage, SubmitButton } from "@/components/forms";

export default function SignupPage() {
  const [state, action] = useActionState(signUp, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">회원가입</h2>
      <Field label="이름" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required maxLength={60} />
      </Field>
      <Field label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="비밀번호" htmlFor="password" hint="8자 이상">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="처리 중...">가입하기</SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="text-primary hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
