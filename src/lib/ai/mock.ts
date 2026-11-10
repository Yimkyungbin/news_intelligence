// 모의 AI (순수 모듈): 키가 없는 로컬·테스트·CI 용. 결과는 DEMO 로 표시된다.
// 입력 텍스트만으로 결정적으로 생성하며 외부로 아무것도 보내지 않는다.
import type { BriefingInsight, ContentInsight, TopicInsight } from "./schemas.ts";
import type { PromptContent } from "./prompts.ts";

export const MOCK_MODEL = "mock-demo";

const short = (s: string, n: number) => (Array.from(s).length > n ? `${Array.from(s).slice(0, n - 1).join("")}…` : s);

export function mockContentInsight(c: PromptContent): ContentInsight {
  const title = short(c.title, 80);
  return {
    summary_ko: `[DEMO 요약] '${title}' 콘텐츠의 모의 AI 요약입니다. 실제 AI 분석 결과가 아닙니다.`,
    key_claims: [`[DEMO] ${title}의 핵심 주장 예시`],
    technologies: ["demo"],
    keywords: ["demo"],
    insight: {
      core: "[DEMO] 핵심 인사이트 예시입니다.",
      technical_meaning: "[DEMO] 기술적 의미 예시입니다.",
      business_impact: "[DEMO] 산업·비즈니스 영향 예시입니다.",
      practical_use: "[DEMO] 실무 적용 가능성 예시입니다.",
      related_tech: "[DEMO] 관련 기술 연관성 예시입니다.",
    },
  };
}

export function mockTopicInsight(topicName: string, items: PromptContent[]): TopicInsight {
  const refs = items.slice(0, 3).map((_, i) => i + 1);
  return {
    overview: `[DEMO] '${short(topicName, 40)}' 주제의 콘텐츠 ${items.length}건을 바탕으로 한 모의 분석입니다.`,
    recent_trends: items.length ? [{ point: `[DEMO] ${short(items[0].title, 60)} 관련 동향`, content_refs: refs }] : [],
    new_technologies: [],
    company_moves: [],
    expert_claims: [],
    common_issues: [],
    watch_next: [{ point: "[DEMO] 향후 주목할 기술 예시", content_refs: refs.slice(0, 1) }],
  };
}

export function mockBriefingInsight(items: PromptContent[]): BriefingInsight {
  return {
    headline: `[DEMO] AI 처리 허용 콘텐츠 ${items.length}건 기반 모의 브리핑`,
    insights: items.slice(0, 3).map((c, i) => ({
      title: `[DEMO] ${short(c.title, 50)}`,
      detail: "[DEMO] 모의 AI 가 만든 예시 인사이트입니다. 실제 분석 결과가 아닙니다.",
      content_refs: [i + 1],
    })),
  };
}
