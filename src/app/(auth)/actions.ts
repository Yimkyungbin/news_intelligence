"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import { text } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

const email = z.email("올바른 이메일을 입력하세요.").max(254);
const password = z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72);

/** open redirect 방지: 내부 경로만 허용 */
function safeNext(value: FormDataEntryValue | null) {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ email, password: z.string().min(1).max(72) }).safeParse({
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (!parsed.success) return { ok: false, message: "이메일과 비밀번호를 확인하세요." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // 계정 존재 여부를 노출하지 않는 일반 메시지
    const unconfirmed = error.code === "email_not_confirmed";
    return {
      ok: false,
      message: unconfirmed ? "이메일 인증이 완료되지 않았습니다. 받은 메일함을 확인하세요." : "이메일 또는 비밀번호가 올바르지 않습니다.",
    };
  }
  redirect(safeNext(fd.get("next")));
}

export async function signUp(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({ name: text().min(1, "이름을 입력하세요.").max(60), email, password })
    .safeParse({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
    },
  });
  if (error) {
    return { ok: false, message: error.code === "weak_password" ? "더 강력한 비밀번호를 사용하세요." : "가입 처리 중 오류가 발생했습니다." };
  }
  // 이메일 인증이 꺼져 있으면 즉시 세션이 생성됨
  if (data.session) redirect("/");
  return { ok: true, message: "인증 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료하세요." };
}

export async function requestPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = email.safeParse(fd.get("email"));
  if (parsed.success) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${getSiteUrl()}/auth/confirm?next=/auth/update-password`,
    });
  }
  // 계정 존재 여부와 무관하게 동일 응답
  return { ok: true, message: "가입된 이메일이라면 재설정 링크가 발송됩니다." };
}

export async function updatePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = password.safeParse(fd.get("password"));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };
  if (fd.get("password") !== fd.get("confirm")) return { ok: false, message: "비밀번호가 일치하지 않습니다." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { ok: false, message: "재설정 링크가 만료되었습니다. 다시 요청하세요." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { ok: false, message: "비밀번호 변경에 실패했습니다." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
