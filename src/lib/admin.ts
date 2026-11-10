import "server-only";

/**
 * 운영자(관리자) 판별: ADMIN_EMAILS (쉼표 구분)
 * - "user@example.com" : 해당 이메일
 * - "@example.com"     : 해당 도메인 전체 (테스트·사내용)
 * 미설정이면 관리자 없음 → 시스템 소스 AI 권한은 변경할 수 없다.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  const entries = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return entries.some((x) => (x.startsWith("@") ? e.endsWith(x) : e === x));
}
