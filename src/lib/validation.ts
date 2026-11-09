import { z } from "zod";
import { splitList } from "@/lib/utils";

/** 한국어 입력 정규화: NFC(macOS NFD 자모 분리 방지) + 앞뒤 공백 제거 */
export const text = () => z.string().normalize("NFC").trim();

/** http(s) URL만 허용 (javascript:, data: 등 차단 → XSS 방지) */
export const httpUrl = text()
  .max(2000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "http(s)로 시작하는 올바른 URL을 입력하세요.");

const optionalText = (max: number) =>
  text()
    .max(max, `${max}자 이내로 입력하세요.`)
    .transform((v) => (v === "" ? null : v))
    .nullable();

export const linkedinUrl = httpUrl.refine((v) => {
  const host = new URL(v).hostname.toLowerCase();
  return new URL(v).protocol === "https:" && (host === "linkedin.com" || host.endsWith(".linkedin.com"));
}, "https://www.linkedin.com/ 으로 시작하는 프로필 URL을 입력하세요.");

export const topicSchema = z.object({
  name: text().min(1, "주제명을 입력하세요.").max(100),
  description: optionalText(1000),
  keywords: z.array(z.string()).max(30),
  search_queries: z.array(z.string()).max(20),
  priority: z.coerce.number().int().min(1).max(5),
  language: z.enum(["all", "ko", "en"]),
  is_active: z.boolean(),
});

export function parseTopicForm(fd: FormData) {
  return topicSchema.safeParse({
    name: fd.get("name") ?? "",
    description: fd.get("description") ?? "",
    keywords: splitList(fd.get("keywords")),
    search_queries: splitList(fd.get("search_queries"), 20),
    priority: fd.get("priority") ?? 3,
    language: fd.get("language") ?? "all",
    is_active: fd.get("is_active") === "on",
  });
}

export const influencerSchema = z.object({
  name: text().min(1, "이름을 입력하세요.").max(100),
  company: optionalText(200),
  job_title: optionalText(200),
  linkedin_url: text()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .pipe(linkedinUrl.nullable()),
  category: z.array(z.string().max(60)).max(10),
  notes: optionalText(4000),
  is_active: z.boolean(),
});

export function parseInfluencerForm(fd: FormData) {
  return influencerSchema.safeParse({
    name: fd.get("name") ?? "",
    company: fd.get("company") ?? "",
    job_title: fd.get("job_title") ?? "",
    linkedin_url: fd.get("linkedin_url") ?? "",
    category: fd.getAll("category").map(String),
    notes: fd.get("notes") ?? "",
    is_active: fd.get("is_active") === "on",
  });
}

export const linkSchema = z.object({
  url: httpUrl,
  title: optionalText(300),
  note: optionalText(2000),
  posted_at: text()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "날짜 형식이 올바르지 않습니다."),
});

export const manualContentSchema = z.object({
  url: httpUrl,
  title: text().min(1, "제목을 입력하세요.").max(500),
  summary: optionalText(5000),
  author: optionalText(200),
  notes: optionalText(4000),
  tags: z.array(z.string().max(40)).max(20),
  folder_id: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .pipe(z.uuid().nullable()),
});

export const savedPostSchema = z.object({
  notes: optionalText(4000),
  tags: z.array(z.string().max(40)).max(20),
  folder_id: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .pipe(z.uuid().nullable()),
});

/**
 * 검증 실패 시 입력값을 폼에 되돌려주기 위한 직렬화 (React 19 폼 자동 reset 대응)
 * 파일/비밀번호 필드는 제외
 */
export function formValues(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$") || key.includes("password")) continue;
    const all = fd.getAll(key).filter((v): v is string => typeof v === "string").map((v) => v.slice(0, 5000));
    out[key] = all.length > 1 || key === "category" ? all : (all[0] ?? "");
  }
  return out;
}

export function fieldErrors(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

/** 실패 응답: 메시지 + 필드 오류 + 입력값 복원 */
export function failure(message: string, fd: FormData, error?: z.ZodError) {
  return { ok: false as const, message, errors: error ? fieldErrors(error) : undefined, values: formValues(fd) };
}

