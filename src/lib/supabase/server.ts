import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requirePublicEnv } from "@/lib/env";

/**
 * 요청 단위 Supabase 서버 클라이언트 (사용자 세션 + RLS 적용)
 * 요청마다 새로 생성해야 한다.
 */
export async function createClient() {
  // cookies()를 먼저 호출해 라우트를 동적 렌더링으로 고정 (빌드 시 정적 프리렌더 방지)
  const cookieStore = await cookies();
  const { url, anonKey } = requirePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component 에서는 쿠키를 쓸 수 없음. 세션 갱신은 proxy.ts 가 담당.
        }
      },
    },
  });
}
