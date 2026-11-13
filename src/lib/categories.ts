// 콘텐츠 카테고리 (고정 8종) 규칙 기반 분류 (순수 모듈: 단위 테스트를 위해 상대 경로 사용)
// My Topics(개인 관심사)와 별개의 공통 분류 축. AI 를 쓰지 않아 모든 출처에 적용된다.
// DB CHECK 제약(content_items.category)과 slug 목록이 일치해야 한다.

export const CATEGORY_SLUGS = ["model_research", "agent", "infra", "devtools", "product", "business", "policy", "usecase"] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export type CategoryDef = {
  slug: CategorySlug;
  label: string;
  description: string;
  /** 막대·띠 색 (hex, 라이트/다크 공통) */
  color: string;
  /** 칩 배경·글자 (Tailwind 클래스) */
  chip: string;
};

export const CATEGORIES: readonly CategoryDef[] = [
  { slug: "model_research", label: "모델·연구", description: "LLM·파운데이션 모델, 논문, 벤치마크, 학습 기법", color: "#8B6CF0", chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  { slug: "agent", label: "에이전트", description: "AI 에이전트, 멀티 에이전트, 도구 호출, MCP·A2A", color: "#2F9E72", chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  { slug: "infra", label: "인프라·반도체", description: "GPU·칩, 데이터센터, 클라우드, 추론 서빙", color: "#E8832E", chip: "bg-orange-500/12 text-orange-700 dark:text-orange-300" },
  { slug: "devtools", label: "개발도구·오픈소스", description: "SDK·라이브러리·프레임워크, 오픈소스 저장소, RAG 도구", color: "#3B7BF0", chip: "bg-blue-500/12 text-blue-700 dark:text-blue-300" },
  { slug: "product", label: "제품·출시", description: "신제품·기능 출시, 서비스 업데이트 발표", color: "#DB4C91", chip: "bg-pink-500/12 text-pink-700 dark:text-pink-300" },
  { slug: "business", label: "비즈니스·투자", description: "투자 유치, 인수합병, 실적, 시장 동향, 제휴", color: "#C59A0E", chip: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300" },
  { slug: "policy", label: "정책·규제·보안", description: "규제·법안, 저작권·소송, AI 안전, 보안 취약점", color: "#D64545", chip: "bg-red-500/12 text-red-700 dark:text-red-300" },
  { slug: "usecase", label: "활용 사례", description: "기업 도입기, 운영 경험, 산업별 적용 사례", color: "#1F9AA8", chip: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300" },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function categoryDef(slug: string | null | undefined): CategoryDef | null {
  return slug ? (BY_SLUG.get(slug as CategorySlug) ?? null) : null;
}

export function isCategorySlug(v: unknown): v is CategorySlug {
  return typeof v === "string" && BY_SLUG.has(v as CategorySlug);
}

/** 영문 패턴(단어 경계, 접두 일치)과 한국어 패턴(부분 일치) */
type Rule = { en: string[]; ko: string[] };

const RULES: Record<CategorySlug, Rule> = {
  agent: {
    en: ["agent", "agents", "agentic", "multi-agent", "a2a", "mcp", "model context protocol", "tool use", "tool calling", "function calling", "computer use", "browser use", "autonomous", "orchestrat", "workflow automation", "assistant api", "subagent"],
    ko: ["에이전트", "에이전틱", "자율 실행", "도구 호출", "오케스트레이션", "업무 자동화"],
  },
  model_research: {
    en: ["llm", "language model", "foundation model", "benchmark", "paper", "arxiv", "training", "pretrain", "fine-tun", "finetun", "reasoning", "transformer", "diffusion", "multimodal", "vision-language", "rlhf", "reinforcement learning", "dataset", "evaluation", "open-weight", "open weights", "gpt-", "claude", "gemini", "llama", "qwen", "deepseek", "mistral", "embedding", "distillation", "scaling law", "tokeniz", "neural", "state-of-the-art", "sota"],
    ko: ["모델", "논문", "연구", "학습", "벤치마크", "추론 능력", "파인튜닝", "데이터셋", "멀티모달"],
  },
  infra: {
    en: ["gpu", "gpus", "nvidia", "tpu", "chip", "chips", "semiconductor", "datacenter", "data center", "cuda", "cluster", "inference serving", "serving", "vllm", "quantiz", "hbm", "kubernetes", "cloud", "compute", "latency", "throughput", "accelerator", "h100", "b200", "blackwell", "power grid"],
    ko: ["반도체", "데이터센터", "클라우드", "인프라", "엔비디아", "그래픽처리장치", "칩", "서버", "전력"],
  },
  devtools: {
    en: ["sdk", "library", "framework", "open source", "open-source", "opensource", "github", "repository", "repo", "cli", "ide", "vscode", "cursor", "typescript", "python", "rust", "javascript", "langchain", "llamaindex", "rag", "retrieval", "vector database", "vector db", "api", "developer", "coding", "code review", "devtools", "plugin", "npm", "pip install"],
    ko: ["오픈소스", "라이브러리", "프레임워크", "개발자", "개발 도구", "코딩", "깃허브", "벡터 db", "검색 증강"],
  },
  product: {
    en: ["launch", "launches", "launched", "release", "releases", "released", "announce", "announces", "announced", "introducing", "introduces", "unveil", "now available", "generally available", "beta", "new feature", "rolls out", "rolling out", "update", "chatgpt", "app"],
    ko: ["출시", "공개", "발표", "선보", "업데이트", "베타", "정식 서비스", "신기능", "탑재"],
  },
  business: {
    en: ["funding", "raises", "raised", "series a", "series b", "series c", "series d", "valuation", "acquisition", "acquire", "acquires", "acquired", "ipo", "revenue", "earnings", "investment", "invest", "investors", "startup", "market share", "partnership", "partners with", "deal", "layoff", "layoffs", "billion", "stock", "shares"],
    ko: ["투자", "인수", "매출", "실적", "상장", "스타트업", "시장", "유치", "협력", "제휴", "계약", "주가", "억 원", "조 원"],
  },
  policy: {
    en: ["regulation", "regulator", "law", "lawsuit", "sues", "sued", "court", "policy", "government", "congress", "senate", "eu ai act", "ai act", "compliance", "privacy", "gdpr", "security", "vulnerability", "exploit", "attack", "jailbreak", "prompt injection", "safety", "copyright", "ban", "banned", "antitrust", "ftc", "guardrail", "deepfake", "misinformation"],
    ko: ["규제", "법안", "정책", "정부", "보안", "개인정보", "저작권", "소송", "취약점", "해킹", "안전", "가이드라인", "공정위", "과기정통부", "기본법"],
  },
  usecase: {
    en: ["case study", "how we", "we built", "lessons learned", "in production", "use case", "customer story", "adoption", "deployed", "deployment", "migrat", "healthcare", "hospital", "finance", "bank", "education", "manufacturing", "retail", "legal", "enterprise", "postmortem"],
    ko: ["사례", "도입", "활용", "적용", "구축기", "전환기", "회고", "운영기", "경험", "개선기", "고객사"],
  },
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 영문 패턴: 앞쪽 단어 경계 필수. '-' 로 끝나거나 어간(접두 일치용)인 패턴은 뒤 경계를 두지 않는다.
const PREFIX = new Set(["fine-tun", "finetun", "pretrain", "tokeniz", "quantiz", "orchestrat", "migrat", "gpt-"]);
const COMPILED = Object.fromEntries(
  (Object.entries(RULES) as [CategorySlug, Rule][]).map(([slug, r]) => [
    slug,
    {
      en: r.en.map((p) => {
        const body = escapeRegExp(p).replace(/\\?[ -]/g, "[\\s-]");
        return new RegExp(`(^|[^a-z0-9])${body}${PREFIX.has(p) ? "" : "s?(?=[^a-z0-9]|$)"}`);
      }),
      ko: r.ko,
    },
  ]),
) as Record<CategorySlug, { en: RegExp[]; ko: string[] }>;

export type CategorizeInput = {
  title: string;
  summary?: string | null;
  keywords?: readonly string[] | null;
  content_type?: string | null;
  source_type?: string | null;
  source_slug?: string | null;
};

/** 국내 기업 기술 블로그: 운영·도입 경험 글이 대부분 */
const CASE_STUDY_BLOGS = new Set(["toss-tech", "woowahan-tech", "daangn-tech", "kakao-tech", "naver-d2"]);

function countHits(text: string, rules: { en: RegExp[]; ko: string[] }): number {
  let n = 0;
  for (const re of rules.en) if (re.test(text)) n++;
  for (const k of rules.ko) if (text.includes(k)) n++;
  return n;
}

/**
 * 규칙 기반 카테고리 분류
 * - 제목 일치는 2점, 요약·키워드 일치는 1점
 * - 콘텐츠 유형 보정: 논문·모델 → 모델·연구, 저장소 → 개발도구
 * - 동점이면 CATEGORY_SLUGS 순서가 아닌 TIE_ORDER(구체적인 분류 우선)로 결정
 */
const TIE_ORDER: CategorySlug[] = ["agent", "policy", "business", "infra", "usecase", "devtools", "product", "model_research"];

export function categorize(input: CategorizeInput): CategorySlug {
  const title = input.title.normalize("NFC").toLowerCase();
  const rest = [input.summary ?? "", ...(input.keywords ?? [])].join(" ").normalize("NFC").toLowerCase();
  const scores = new Map<CategorySlug, number>(CATEGORY_SLUGS.map((s) => [s, 0]));
  for (const slug of CATEGORY_SLUGS) {
    const rules = COMPILED[slug];
    scores.set(slug, countHits(title, rules) * 2 + countHits(rest, rules));
  }
  const add = (s: CategorySlug, n: number) => scores.set(s, (scores.get(s) ?? 0) + n);
  // 유형 보정은 제목 단어 하나(2점) 수준: 에이전트·보안 논문처럼 제목 단서가 분명하면 그쪽으로 분류
  if (input.content_type === "paper") add("model_research", 2);
  if (input.content_type === "model") add("model_research", 2);
  if (input.content_type === "repository") add("devtools", 3);
  if (input.source_slug && CASE_STUDY_BLOGS.has(input.source_slug)) add("usecase", 2);

  let best: CategorySlug = "model_research";
  let bestScore = 0;
  for (const slug of TIE_ORDER) {
    const s = scores.get(slug) ?? 0;
    if (s > bestScore) {
      best = slug;
      bestScore = s;
    }
  }
  if (bestScore > 0) return best;
  // 단서가 없으면 출처 유형으로 기본값
  if (input.source_type === "news") return "product";
  return "model_research";
}

/** 저장된 분류가 있으면 사용, 없으면(기존 콘텐츠) 같은 규칙으로 계산 */
export function itemCategory(item: CategorizeInput & { category?: string | null; source?: { slug?: string | null } | null }): CategorySlug {
  if (isCategorySlug(item.category)) return item.category;
  return categorize({ ...item, source_slug: item.source_slug ?? item.source?.slug ?? null });
}
