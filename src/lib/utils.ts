import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const KST = "Asia/Seoul";

/** KST 기준 날짜 표시 (예: 2026. 11. 9.) */
export function formatDate(value: string | Date | null | undefined, timeZone = KST) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone, dateStyle: "medium" }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined, timeZone = KST) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** 상대 시간 (예: 3시간 전). 7일이 지나면 날짜로 표시 */
export function formatRelative(value: string | Date | null | undefined, now = Date.now()) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = now - d.getTime();
  if (Number.isNaN(diff)) return "-";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}일 전`;
  return formatDate(d);
}

/** KST 기준 오늘 00:00의 UTC ISO 문자열 */
export function startOfTodayKstIso() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: KST }));
  const offsetMs = kst.getTime() - now.getTime();
  kst.setHours(0, 0, 0, 0);
  return new Date(kst.getTime() - offsetMs).toISOString();
}

export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** URL에서 호스트명 추출 (www. 제거). 유효하지 않으면 null */
export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** 쉼표/줄바꿈 구분 문자열을 정리된 배열로 변환 */
export function splitList(value: FormDataEntryValue | null | undefined, max = 30): string[] {
  if (typeof value !== "string") return [];
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((s) => s.normalize("NFC").trim())
        .filter(Boolean)
        .map((s) => s.slice(0, 200)),
    ),
  ).slice(0, max);
}

/** 폼 기본값 해석: 검증 실패 후에는 사용자가 입력한 값, 그 외에는 기존 값 */
export function pickValue(values: Record<string, string | string[]> | undefined, key: string, fallback: string) {
  const v = values?.[key];
  if (v === undefined) return fallback;
  return Array.isArray(v) ? v.join(", ") : v;
}
