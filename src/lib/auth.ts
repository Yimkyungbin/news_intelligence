import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string; name: string };

/**
 * Data Access Layer: 현재 사용자 확인 (JWT 검증). 미인증이면 /login 으로 이동.
 * 같은 요청 내 중복 호출은 React cache 로 1회만 수행.
 */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name,email")
    .eq("id", claims.sub)
    .maybeSingle();

  const email = (profile?.email ?? claims.email ?? "") as string;
  return { id: claims.sub, email, name: profile?.name ?? email.split("@")[0] };
});

/** Server Action 내부용: 인증 + 클라이언트를 함께 반환 */
export async function authedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}
