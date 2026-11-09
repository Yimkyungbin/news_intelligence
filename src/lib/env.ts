/**
 * 공개 환경변수 (클라이언트에 노출되어도 안전한 값만 NEXT_PUBLIC_ 접두사 사용)
 * 서버 비밀값(SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY 등)은 src/lib/env.server.ts 에서만 읽는다.
 */
export function getPublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // 신규 publishable key 우선, 레거시 anon key 호환
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

export function requirePublicEnv() {
  const env = getPublicEnv();
  if (!env.url || !env.anonKey) {
    throw new Error(
      "Supabase 환경변수가 설정되지 않았습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 를 설정하세요.",
    );
  }
  return { url: env.url, anonKey: env.anonKey };
}

/** 인증 메일 리다이렉트 등에 쓰는 사이트 URL */
export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
