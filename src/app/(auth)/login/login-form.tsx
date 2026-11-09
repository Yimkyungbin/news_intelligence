"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "../actions";
import { Field, Input } from "@/components/ui/primitives";
import { FormMessage, SubmitButton } from "@/components/forms";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">로그인</h2>
      {notice ? <p className="rounded-md bg-primary/10 p-2 text-xs text-primary">{notice}</p> : null}
      <input type="hidden" name="next" value={next} />
      <Field label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="비밀번호" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="로그인 중...">로그인</SubmitButton>
      <div className="flex justify-between text-xs">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
          비밀번호 찾기
        </Link>
        <Link href="/signup" className="text-primary hover:underline">
          회원가입
        </Link>
      </div>
    </form>
  );
}
