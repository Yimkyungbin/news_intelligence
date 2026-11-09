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
