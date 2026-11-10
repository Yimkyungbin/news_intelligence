// AI 처리 권한 게이트 (순수 모듈) — 요구사항 3.4
// AI 호출 직전에 반드시 통과해야 한다. 판단 근거는 콘텐츠의 권한 메타데이터뿐이다.

export type GateInput = {
  provenance: string;
  ai_processing_allowed: boolean;
  external_llm_allowed: boolean;
};

export type GateResult = { ok: true } | { ok: false; reason: string };

/**
 * @param externalProvider 외부 LLM API(OpenAI 등)로 전송하면 true, 로컬 모의 AI 면 false
 */
export function checkAIPermission(c: GateInput, externalProvider: boolean): GateResult {
  // LinkedIn API 데이터는 어떤 경우에도 외부 LLM 으로 보내지 않음 (LinkedIn 정책)
  if (c.provenance === "linkedin_api") return { ok: false, reason: "LinkedIn API 데이터는 AI 처리하지 않습니다." };
  if (!c.ai_processing_allowed) return { ok: false, reason: "AI 처리 권한이 확인되지 않은 콘텐츠입니다." };
  if (externalProvider && !c.external_llm_allowed) return { ok: false, reason: "외부 LLM 전송이 허용되지 않은 콘텐츠입니다." };
  return { ok: true };
}

/** 목록에서 AI 처리 가능한 항목만 남김 */
export function filterAIAllowed<T extends GateInput>(items: T[], externalProvider: boolean): T[] {
  return items.filter((c) => checkAIPermission(c, externalProvider).ok);
}
