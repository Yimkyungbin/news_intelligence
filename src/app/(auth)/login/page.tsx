import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

const NOTICES: Record<string, string> = {
  confirmed: "이메일 인증이 완료되었습니다. 로그인하세요.",
  link_invalid: "인증 링크가 만료되었거나 올바르지 않습니다.",
  deleted: "계정과 데이터가 삭제되었습니다.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  return <LoginForm next={next} notice={notice} />;
}
