import "server-only";
import { callOpenAI, cleanApiKey, type Usage } from "./openai";
import { MOCK_MODEL, mockBatchMeta, mockBriefingInsight, mockContentInsight, mockTitleBatch, mockTopicInsight, mockTrendInsight } from "./mock";
import type { BatchMeta, BriefingInsight, ContentInsight, TitleBatch, TopicInsight } from "./schemas";
import {
  buildBatchMetaPrompt,
  buildTitleBatchPrompt,
  buildBriefingInsightPrompt,
  buildContentInsightPrompt,
  buildTopicInsightPrompt,
  buildTrendInsightPrompt,
  type PromptContent,
} from "./prompts";
import { AI_MODELS } from "@/lib/types";

/**
 * 교체 가능한 AI Provider (요구사항 5 AI: 모델 교체 가능 구조)
 * - AI_PROVIDER=mock  : 모의 AI (테스트·CI). 운영(VERCEL_ENV=production)에서는 사용 불가
 * - AI_PROVIDER=openai 또는 미설정 + OPENAI_API_KEY 있음 : OpenAI
 * - 그 외 : 로컬·Preview 는 mock, 운영은 비활성
 */
export type AIProvider = {
  name: "openai" | "mock";
  model: string;
  /** 외부 LLM API 로 데이터를 보내는지 (권한 게이트에 사용) */
  external: boolean;
  isDemo: boolean;
  contentInsight(c: PromptContent): Promise<{ output: ContentInsight; usage: Usage }>;
  topicInsight(topic: { name: string; description: string | null; keywords: string[] }, items: PromptContent[]): Promise<{ output: TopicInsight; usage: Usage }>;
  briefingInsight(date: string, items: PromptContent[], keywords: string[]): Promise<{ output: BriefingInsight; usage: Usage }>;
  batchMeta(items: (PromptContent & { language: string })[]): Promise<{ output: BatchMeta; usage: Usage }>;
  titleBatch(items: { title: string }[]): Promise<{ output: TitleBatch; usage: Usage }>;
  trendInsight(scope: string, items: PromptContent[], keywords: string[]): Promise<{ output: BriefingInsight; usage: Usage }>;
};

export type ProviderStatus = { mode: "openai" | "mock" | "disabled"; reason: string };

const NO_USAGE: Usage = { input_tokens: 0, output_tokens: 0 };
const isProduction = () => process.env.VERCEL_ENV === "production";

export function providerStatus(): ProviderStatus {
  const pref = process.env.AI_PROVIDER;
  const hasKey = Boolean(cleanApiKey(process.env.OPENAI_API_KEY));
  if (process.env.OPENAI_API_KEY && !hasKey && pref !== "mock") {
    return { mode: "disabled", reason: "OPENAI_API_KEY 값에 공백·따옴표·한글 등 사용할 수 없는 문자가 있습니다. Vercel 환경변수 값을 다시 입력하세요." };
  }
  if (pref === "mock") {
    return isProduction() ? { mode: "disabled", reason: "운영 환경에서는 모의 AI를 사용할 수 없습니다." } : { mode: "mock", reason: "AI_PROVIDER=mock (DEMO)" };
  }
  if (hasKey) return { mode: "openai", reason: "OpenAI API 키 설정됨" };
  if (pref === "openai") return { mode: "disabled", reason: "OPENAI_API_KEY 가 설정되지 않았습니다." };
  return isProduction() ? { mode: "disabled", reason: "OPENAI_API_KEY 가 설정되지 않았습니다." } : { mode: "mock", reason: "OpenAI 키 미설정 → 로컬 모의 AI (DEMO)" };
}

export function getProvider(preferredModel?: string | null): AIProvider | null {
  const status = providerStatus();
  if (status.mode === "disabled") return null;

  if (status.mode === "mock") {
    return {
      name: "mock",
      model: MOCK_MODEL,
      external: false,
      isDemo: true,
      contentInsight: async (c) => ({ output: mockContentInsight(c), usage: NO_USAGE }),
      topicInsight: async (t, items) => ({ output: mockTopicInsight(t.name, items), usage: NO_USAGE }),
      briefingInsight: async (_d, items) => ({ output: mockBriefingInsight(items), usage: NO_USAGE }),
      batchMeta: async (items) => ({ output: mockBatchMeta(items), usage: NO_USAGE }),
      titleBatch: async (items) => ({ output: mockTitleBatch(items), usage: NO_USAGE }),
      trendInsight: async (_s, items) => ({ output: mockTrendInsight(items), usage: NO_USAGE }),
    };
  }

  const apiKey = cleanApiKey(process.env.OPENAI_API_KEY) as string;
  const model = (AI_MODELS as readonly string[]).includes(preferredModel ?? "") ? (preferredModel as string) : AI_MODELS[0];
  return {
    name: "openai",
    model,
    external: true,
    isDemo: false,
    contentInsight: (c) => callOpenAI({ apiKey, model, task: "content_insight", prompt: buildContentInsightPrompt(c), maxOutputTokens: 2000 }),
    topicInsight: (t, items) => callOpenAI({ apiKey, model, task: "topic_insight", prompt: buildTopicInsightPrompt(t, items), maxOutputTokens: 3000 }),
    briefingInsight: (d, items, kw) => callOpenAI({ apiKey, model, task: "briefing_insight", prompt: buildBriefingInsightPrompt(d, items, kw), maxOutputTokens: 2000 }),
    batchMeta: (items) => callOpenAI({ apiKey, model, task: "batch_meta", prompt: buildBatchMetaPrompt(items), maxOutputTokens: 4000 }),
    // 제목만: 응답이 짧아 빠름. 시간 상한도 짧게 (실패 시 2단계에서 다시 번역됨)
    titleBatch: (items) => callOpenAI({ apiKey, model, task: "title_batch", prompt: buildTitleBatchPrompt(items), maxOutputTokens: 800, timeoutMs: 30_000 }),
    trendInsight: (s, items, kw) => callOpenAI({ apiKey, model, task: "briefing_insight", prompt: buildTrendInsightPrompt(s, items, kw), maxOutputTokens: 2000 }),
  };
}
