import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requirePublicEnv } from "@/lib/env";

/**
 * service_role 클라이언트 (RLS 우회). 서버 전용이며 반드시 사용자 인증 확인 후
 * 해당 사용자 범위 작업에만 사용한다. 키 미설정 시 null.
 */
function adminKey() {
  // 신규 secret key 우선, 레거시 service_role key 호환
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function createAdminClient() {
  const key = adminKey();
  if (!key) return null;
  const { url } = requirePublicEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function hasAdminKey() {
  return Boolean(adminKey());
}
