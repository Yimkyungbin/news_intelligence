// AI 출력 스키마 (순수 모듈)
// - OpenAI Structured Outputs(json_schema strict)에 보낼 JSON Schema
// - 응답을 다시 zod 로 검증 (모델 출력은 신뢰하지 않음)
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const list = (max: number, itemMax: number) => z.array(text(itemMax)).max(max);

/* ---------- 콘텐츠 요약·인사이트 (4.1, 4.2) ---------- */
export const contentInsightSchema = z.object({
  summary_ko: text(1200),
  key_claims: list(5, 300),
  technologies: list(8, 80),
  keywords: list(8, 40),
  insight: z.object({
    core: text(600),
    technical_meaning: text(600),
    business_impact: text(600),
    practical_use: text(600),
    related_tech: text(600),
  }),
});
export type ContentInsight = z.infer<typeof contentInsightSchema>;

/* ---------- 주제 인텔리전스 (4.3) ---------- */
const topicPoint = z.object({ point: text(400), content_refs: z.array(z.number().int().min(1).max(30)).max(10) });
export const topicInsightSchema = z.object({
  overview: text(800),
  recent_trends: z.array(topicPoint).max(6),
  new_technologies: z.array(topicPoint).max(6),
  company_moves: z.array(topicPoint).max(6),
  expert_claims: z.array(topicPoint).max(6),
  common_issues: z.array(topicPoint).max(6),
  watch_next: z.array(topicPoint).max(6),
});
export type TopicInsight = z.infer<typeof topicInsightSchema>;

/* ---------- 브리핑 핵심 인사이트 (4.4-5) ---------- */
export const briefingInsightSchema = z.object({
  headline: text(200),
  insights: z
    .array(z.object({ title: text(120), detail: text(600), content_refs: z.array(z.number().int().min(1).max(30)).max(10) }))
    .min(1)
    .max(5),
});
export type BriefingInsight = z.infer<typeof briefingInsightSchema>;

/* ---------- 일괄 번역·한 줄 시사점 (번역 토글·Trending 카드) ---------- */
export const batchMetaSchema = z.object({
  items: z
    .array(
      z.object({
        n: z.number().int().min(1).max(20),
        title_ko: z.string().trim().max(400),
        summary_ko: z.string().trim().max(1200),
        implication_ko: z.string().trim().max(200),
      }),
    )
    .max(20),
});
export type BatchMeta = z.infer<typeof batchMetaSchema>;

/* ---------- OpenAI 용 JSON Schema (strict: 모든 필드 required, additionalProperties false) ---------- */
const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;
const refs = { type: "array", items: { type: "integer" } } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const pointArr = { type: "array", items: obj({ point: str, content_refs: refs }) };

export const JSON_SCHEMAS = {
  content_insight: obj({
    summary_ko: str,
    key_claims: strArr,
    technologies: strArr,
    keywords: strArr,
    insight: obj({ core: str, technical_meaning: str, business_impact: str, practical_use: str, related_tech: str }),
  }),
  topic_insight: obj({
    overview: str,
    recent_trends: pointArr,
    new_technologies: pointArr,
    company_moves: pointArr,
    expert_claims: pointArr,
    common_issues: pointArr,
    watch_next: pointArr,
  }),
  briefing_insight: obj({
    headline: str,
    insights: { type: "array", items: obj({ title: str, detail: str, content_refs: refs }) },
  }),
  batch_meta: obj({
    items: { type: "array", items: obj({ n: { type: "integer" }, title_ko: str, summary_ko: str, implication_ko: str }) },
  }),
} as const;

export type AITaskName = keyof typeof JSON_SCHEMAS;
export const TASK_SCHEMAS = {
  content_insight: contentInsightSchema,
  topic_insight: topicInsightSchema,
  briefing_insight: briefingInsightSchema,
  batch_meta: batchMetaSchema,
} as const;
