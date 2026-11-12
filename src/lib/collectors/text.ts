// 수집 텍스트 정리: HTML 제거, 엔티티 해제, 공백 정리, 길이 제한

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      // 제어문자·서로게이트 등 비정상 코드포인트는 제거
      if (!Number.isFinite(n) || n < 32 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return " ";
      return String.fromCodePoint(n);
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

/** HTML 태그·스크립트 제거 후 일반 텍스트로 변환 (저장은 항상 일반 텍스트) */
export function stripHtml(input: string): string {
  return decodeEntities(
    input
      .replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/<[^>]*>/g, " ") // 엔티티 해제 후 생긴 태그도 제거
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 문자 수 기준 자르기 (단어 중간이면 말줄임) */
export function truncate(s: string, max: number): string {
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = truncate(stripHtml(v).normalize("NFC"), max);
  return t === "" ? null : t;
}

/** http(s) 절대 URL만 허용, 해시 제거. 아니면 null */
export function normalizeUrl(v: unknown, base?: string): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  try {
    const u = new URL(v.trim(), base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function toIsoDate(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const TITLE_MAX = 120;

/**
 * SNS 게시글 제목 정리 (Mastodon·Bluesky 등 본문 첫 문장을 제목으로 쓰는 경우)
 * - URL, @멘션(@user@host 포함), 앞쪽 "RE:"/"RT" 제거
 * - 해시태그는 '#' 만 제거하고 단어는 유지 ("# HumanEmacs" → "HumanEmacs")
 * - 정리 후 너무 짧으면(8자 미만) 본문에서 같은 방식으로 정리한 첫 문장을 사용
 */
export function cleanPostText(s: string): string {
  return (
    s
      .normalize("NFC")
      // HTML 제거 과정에서 "https:// host/path 123456" 처럼 공백이 끼어 깨진 URL도 제거
      .replace(/https?:\/\/\s*[^\s]+(?:\s+\d{4,}\b)*/gi, " ")
      .replace(/(^|\s)(?:www\.)\S+/gi, " ")
      // @user, @user@host, "@ user" (공백이 낀 멘션)
      .replace(/(^|[\s(])@\s?[\w.-]+(?:@[\w.-]+)?/g, "$1")
      .replace(/#\s*(?=[\p{L}\p{N}_])/gu, "")
      .replace(/^\s*(?:re|rt|fw|fwd)\s*:\s*/i, "")
      .replace(/\s+([,.!?:;])/g, "$1")
      .replace(/\s+/g, " ")
      .replace(/^[\s:;,.\-–—|/]+/, "")
      .trim()
  );
}

export function cleanPostTitle(title: string, body?: string | null): string {
  const firstSentence = (s: string) => s.split(/(?<=[.!?。])\s/)[0] ?? s;
  let t = cleanPostText(title);
  if (Array.from(t).length < 8 && body) t = cleanPostText(firstSentence(cleanPostText(body)));
  if (!t) t = title.trim();
  return truncate(t, TITLE_MAX);
}

/** SNS 게시글 요약: 정리 후 제목과 같은 앞부분은 빼서 중복 표시를 막음. 남는 내용이 없으면 null */
export function cleanPostSummary(summary: string | null | undefined, title: string): string | null {
  if (!summary) return null;
  let s = cleanPostText(summary);
  const truncated = title.endsWith("…");
  const head = title.replace(/…$/, "");
  if (head && s.startsWith(head)) {
    s = s.slice(head.length);
    // 제목이 단어 중간에서 잘렸으면 남은 단어 조각도 제거
    if (truncated) s = s.replace(/^[^\s]*/, "");
    s = s.replace(/^[\s.!?:;,…-]+/, "");
  }
  return Array.from(s).length >= 10 ? s : null;
}

/** URL 을 빼면 남는 내용이 거의 없는 요약(링크만 나열한 본문)인지 */
export function isLinkOnly(text: string | null | undefined): boolean {
  if (!text) return false;
  return Array.from(text.replace(/https?:\/\/\S+/gi, "").replace(/[\s.,…]+/g, "")).length < 10;
}
