// OpenAI Responses API 호출 (SDK 없이 fetch). 순수 함수 + 네트워크 호출
// 문서: https://developers.openai.com/api/docs/guides/structured-outputs
import { JSON_SCHEMAS, TASK_SCHEMAS, type AITaskName } from "./schemas.ts";
import type { BuiltPrompt } from "./prompts.ts";

export const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

// 생성자 매개변수 속성(readonly x)은 Node strip-types 에서 지원되지 않아 명시적 필드로 선언
export class AIError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;
  constructor(message: string, retryable: boolean, status: number | null = null) {
    super(message);
    this.name = "AIError";
    this.retryable = retryable;
    this.status = status;
  }
}

export type Usage = { input_tokens: number; output_tokens: number };

/** Responses API 원시 응답에서 출력 텍스트 추출. 미완료·거부는 오류 */
export function extractOutputText(raw: unknown): { text: string; usage: Usage } {
  const r = raw as {
    status?: string;
    incomplete_details?: { reason?: string } | null;
    error?: { message?: string } | null;
    output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  if (!r || typeof r !== "object") throw new AIError("AI 응답 형식이 올바르지 않습니다.", false);
  if (r.error?.message) throw new AIError("AI 처리 중 오류가 발생했습니다.", true);
  if (r.status === "incomplete") {
    const reason = r.incomplete_details?.reason === "content_filter" ? "콘텐츠 필터" : "출력 길이 초과";
    throw new AIError(`AI 응답이 완료되지 않았습니다 (${reason}).`, false);
  }
  if (r.status && r.status !== "completed") throw new AIError(`AI 응답 상태: ${r.status}`, true);

  const parts = (r.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  const refusal = parts.find((p) => p.type === "refusal");
  if (refusal) throw new AIError("AI 가 요청 처리를 거부했습니다.", false);
  const text = parts
    .filter((p) => p.type === "output_text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!text) throw new AIError("AI 응답에 출력이 없습니다.", false);
  return { text, usage: { input_tokens: r.usage?.input_tokens ?? 0, output_tokens: r.usage?.output_tokens ?? 0 } };
}

/** 출력 JSON 파싱 + 스키마 검증 */
export function parseTaskOutput<T extends AITaskName>(task: T, text: string) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AIError("AI 응답 JSON 을 해석할 수 없습니다.", false);
  }
  const parsed = TASK_SCHEMAS[task].safeParse(json);
  if (!parsed.success) throw new AIError("AI 응답이 예상한 형식과 다릅니다.", false);
  return parsed.data as ReturnType<(typeof TASK_SCHEMAS)[T]["parse"]>;
}

/**
 * 환경변수로 받은 API 키 정리: 앞뒤 공백·줄바꿈, 감싼 따옴표, "Bearer " 접두사 제거.
 * 헤더에 넣을 수 없는 문자(공백·제어문자·비 ASCII)가 남으면 null (fetch 가 헤더 생성 단계에서 실패하는 것을 미리 차단)
 */
export function cleanApiKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const k = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  return k && /^[\x21-\x7E]+$/.test(k) ? k : null;
}

/** fetch 오류를 비밀값 없이 짧게 설명 (예: "TypeError: fetch failed / ENOTFOUND") */
export function describeFetchError(e: unknown): string {
  if (!(e instanceof Error)) return "알 수 없는 오류";
  const cause = (e as Error & { cause?: { code?: string; name?: string; message?: string } }).cause;
  const parts = [`${e.name}: ${e.message}`];
  if (cause?.code || cause?.name) parts.push(cause.code ?? cause.name ?? "");
  return parts.join(" / ").replace(/sk-[A-Za-z0-9_-]+/g, "sk-***").slice(0, 160);
}

export async function callOpenAI<T extends AITaskName>(opts: {
  apiKey: string;
  model: string;
  task: T;
  prompt: BuiltPrompt;
  maxOutputTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}) {
  const apiKey = cleanApiKey(opts.apiKey);
  if (!apiKey) throw new AIError("OPENAI_API_KEY 값이 비어 있거나 공백·따옴표·한글 등 사용할 수 없는 문자가 섞여 있습니다.", false);
  const res = await (opts.fetchImpl ?? fetch)(OPENAI_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    body: JSON.stringify({
      model: opts.model,
      // 요청·응답을 OpenAI 측에 저장하지 않음 (store: false)
      store: false,
      max_output_tokens: opts.maxOutputTokens ?? 2500,
      input: [
        { role: "system", content: opts.prompt.system },
        { role: "user", content: opts.prompt.user },
      ],
      text: { format: { type: "json_schema", name: opts.task, strict: true, schema: JSON_SCHEMAS[opts.task] } },
    }),
  }).catch((e: unknown) => {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    if (timeout) throw new AIError("AI 응답 시간이 초과되었습니다.", true);
    // 원인 파악용: 오류 종류·코드만 남김 (키·요청 본문은 포함하지 않음)
    const detail = describeFetchError(e);
    console.error("[openai] fetch 실패:", detail);
    throw new AIError(`AI 서버에 연결하지 못했습니다. (${detail})`, true);
  });

  if (!res.ok) {
    // 응답 본문에는 요청 일부가 포함될 수 있어 상태 코드만 사용
    const retryable = res.status === 429 || res.status >= 500;
    const msg =
      res.status === 401 ? "OpenAI API 키가 올바르지 않습니다." : res.status === 429 ? "OpenAI 사용 한도 또는 요청 제한에 걸렸습니다." : `OpenAI 오류 (HTTP ${res.status})`;
    throw new AIError(msg, retryable, res.status);
  }
  const { text, usage } = extractOutputText(await res.json());
  return { output: parseTaskOutput(opts.task, text), usage };
}
