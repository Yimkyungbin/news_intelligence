// 트렌드 메인 개편 단위 테스트: 카테고리 분류, SNS 제목 정리, 논문 파서, 반응 지표, 순위 변동·관련 기사
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, CATEGORY_SLUGS, categorize, itemCategory } from "../../src/lib/categories.ts";
import { cleanPostSummary, cleanPostTitle, isLinkOnly } from "../../src/lib/collectors/text.ts";
import { openAlexAbstract, parseHfDailyPapers, parseMastodonStatuses, parseOpenAlexWorks } from "../../src/lib/collectors/sources.ts";
import { kstDate, metricGrowth, primaryMetric, topPercent } from "../../src/lib/metrics.ts";
import { categoryBreakdown, coKeywords, keywordDailySeries, rankChanges, relatedCounts, sourceShares } from "../../src/lib/trends/overview.ts";
import { isFocused, parseTrendParams } from "../../src/lib/trends/params.ts";

describe("카테고리 분류 (규칙 기반)", () => {
  const cases: [string, Parameters<typeof categorize>[0], string][] = [
    ["에이전트", { title: "Building multi-agent systems with MCP and A2A" }, "agent"],
    ["에이전트(한국어)", { title: "사내 업무 에이전트 오케스트레이션 구축" }, "agent"],
    ["인프라", { title: "NVIDIA unveils new Blackwell GPUs for data center inference" }, "infra"],
    ["비즈니스", { title: "AI startup raises $200M Series C at $2 billion valuation" }, "business"],
    ["비즈니스(한국어)", { title: "AI 스타트업, 300억 원 투자 유치" }, "business"],
    ["정책", { title: "EU AI Act compliance deadline: what regulators expect" }, "policy"],
    ["정책(보안)", { title: "Prompt injection vulnerability found in popular chatbot" }, "policy"],
    ["제품", { title: "Adobe launches new Firefly features, now available in beta" }, "product"],
    ["활용 사례", { title: "How we migrated search to RAG in production: lessons learned" }, "usecase"],
    ["논문 유형 보정", { title: "On the convergence of sparse attention", content_type: "paper" }, "model_research"],
    ["에이전트 논문", { title: "Comparative Analysis of Agent Evaluation Frameworks in Enterprise Agents", content_type: "paper" }, "agent"],
    ["저장소 유형 보정", { title: "acme/fast-tokenizer", content_type: "repository" }, "devtools"],
    ["국내 기술 블로그", { title: "결제 시스템 개선기", source_slug: "toss-tech" }, "usecase"],
    ["단서 없는 뉴스", { title: "오늘의 소식", source_type: "news" }, "product"],
  ];
  for (const [name, input, expected] of cases) {
    test(`${name} → ${expected}`, () => assert.equal(categorize(input), expected));
  }

  test("단어 경계: 'storage' 는 rag, 'apple' 은 app 으로 보지 않음", () => {
    assert.notEqual(categorize({ title: "Cheap storage for apple fans" }), "devtools");
    assert.notEqual(categorize({ title: "Cheap storage for apple fans" }), "product");
  });

  test("저장된 분류 우선, 잘못된 값이면 다시 계산", () => {
    assert.equal(itemCategory({ title: "NVIDIA GPU", category: "policy" }), "policy");
    assert.equal(itemCategory({ title: "NVIDIA GPU cluster", category: "unknown" }), "infra");
  });

  test("정의: 8종, 색·라벨 모두 존재, slug 목록 일치", () => {
    assert.equal(CATEGORIES.length, 8);
    assert.deepEqual(CATEGORIES.map((c) => c.slug), [...CATEGORY_SLUGS]);
    assert.ok(CATEGORIES.every((c) => /^#[0-9A-F]{6}$/i.test(c.color) && c.label));
  });
});

describe("SNS 제목 정리", () => {
  test("URL·멘션·RE: 제거, 해시태그 기호 제거", () => {
    assert.equal(
      cleanPostTitle("RE: https://mastodon.social/@meejah/117595425483136501 I'm not going to sign # HumanEmacs because"),
      "I'm not going to sign HumanEmacs because",
    );
    assert.equal(cleanPostTitle("@alice@example.social @bob thanks for the #LLM tips!"), "thanks for the LLM tips!");
  });

  test("공백이 낀 깨진 URL·멘션 제거 (저장된 기존 데이터 형태)", () => {
    assert.equal(
      cleanPostTitle("https:// mastodon.social/@meejah/117595 425483136501 I'm not going to sign HumanEmacs because"),
      "I'm not going to sign HumanEmacs because",
    );
    assert.equal(cleanPostTitle("@ backintime Your contribution policy links to the GenAI policy"), "Your contribution policy links to the GenAI policy");
  });

  test("요약: 정리 후 제목과 겹치는 앞부분 제거, 남는 내용이 짧으면 null", () => {
    const title = cleanPostTitle("RE: https://x.y/z Agents are eating SaaS.");
    assert.equal(cleanPostSummary("RE: https://x.y/z Agents are eating SaaS. Here is why the per-seat model breaks.", title), "Here is why the per-seat model breaks.");
    assert.equal(cleanPostSummary("Agents are eating SaaS.", title), null);
    // 제목이 단어 중간에서 잘린 경우 남은 단어 조각까지 제거
    assert.equal(cleanPostSummary("We discuss things about LLMs effectiveness in practice today", "We discuss thing…"), "about LLMs effectiveness in practice today");
  });

  test("링크만 나열된 요약 판별", () => {
    assert.equal(isLinkOnly("https://a.example/x … https://b.example/y"), true);
    assert.equal(isLinkOnly("See https://a.example/x for the full benchmark results"), false);
    assert.equal(isLinkOnly(null), false);
  });

  test("정리 후 너무 짧으면 본문 첫 문장 사용", () => {
    assert.equal(cleanPostTitle("https://example.com/x", "https://example.com/x New open-weight model is out. More soon."), "New open-weight model is out.");
  });

  test("Mastodon 파서가 정리된 제목을 저장", () => {
    const [p] = parseMastodonStatuses([
      { visibility: "public", url: "https://mastodon.social/@a/1", content: "<p>RE: <a href='https://x.y/z'>https://x.y/z</a> Agents are eating SaaS</p>", account: { acct: "a" }, created_at: "2026-11-10T00:00:00Z" },
    ]);
    assert.equal(p.title, "Agents are eating SaaS");
  });
});

describe("논문 출처 파서", () => {
  test("HF Daily Papers: HF 논문 페이지 URL, 추천·댓글, AI 키워드, 저자 요약", () => {
    const [p, ...rest] = parseHfDailyPapers([
      {
        paper: { id: "2611.14116", title: "Visual Similarity", summary: "Long abstract", ai_summary: "Short summary", upvotes: 12, publishedAt: "2026-11-10T00:00:00.000Z", authors: [{ name: "Kim" }, { name: "Lee" }, { name: "Park" }], ai_keywords: ["DINOv2", "frozen encoder"] },
        numComments: 3,
      },
      { paper: { id: "../etc", title: "bad id" } },
      { paper: { id: "2611.00001", title: "" } },
    ]);
    assert.equal(rest.length, 0);
    assert.equal(p.url, "https://huggingface.co/papers/2611.14116");
    assert.equal(p.contentType, "paper");
    assert.deepEqual(p.popularity, { upvotes: 12, comments: 3 });
    assert.equal(p.summary, "Short summary");
    assert.equal(p.author, "Kim 외 2명");
    assert.deepEqual(p.tags, ["DINOv2", "frozen encoder"]);
    assert.throws(() => parseHfDailyPapers({}));
  });

  test("OpenAlex: 역색인 초록 복원, DOI 우선, 인용 수, 주제·키워드 태그, 언어", () => {
    assert.equal(openAlexAbstract({ world: [1], Hello: [0], "!": [2] }), "Hello world !");
    assert.equal(openAlexAbstract(null), null);
    const [w] = parseOpenAlexWorks({
      results: [
        {
          id: "https://openalex.org/W1",
          doi: "https://doi.org/10.1/abc",
          display_name: "MonkeyOCR",
          publication_date: "2026-11-01",
          cited_by_count: 115,
          language: "en",
          primary_location: { landing_page_url: "https://example.org/p", source: { display_name: "Sci China" } },
          authorships: [{ author: { display_name: "Zhang" } }, { author: { display_name: "Li" } }],
          primary_topic: { display_name: "Handwritten Text Recognition" },
          keywords: [{ display_name: "OCR" }],
          abstract_inverted_index: { Document: [0], parsing: [1] },
        },
        { id: "https://openalex.org/W2", display_name: "" },
      ],
    });
    assert.equal(w.url, "https://doi.org/10.1/abc");
    assert.deepEqual(w.popularity, { citations: 115 });
    assert.equal(w.summary, "Document parsing");
    assert.equal(w.author, "Zhang 외 1명");
    assert.deepEqual(w.tags, ["Handwritten Text Recognition", "OCR"]);
    assert.equal(w.language, "en");
    assert.throws(() => parseOpenAlexWorks([]));
  });
});

describe("반응 지표", () => {
  test("대표 지표: 우선순위, 0·음수·비정상 값 제외", () => {
    assert.deepEqual(primaryMetric({ comments: 9, points: 120 }), { key: "points", value: 120 });
    assert.deepEqual(primaryMetric({ citations: 5, downloads: 900 }), { key: "citations", value: 5 });
    assert.equal(primaryMetric({ points: 0, likes: -1, stars: Number.NaN }), null);
  });

  test("증가량: 기준일 이전 최근 기록 대비, 처음 수집이면 null", () => {
    const today = "2026-11-11";
    const snaps = [
      { content_id: "a", captured_on: "2026-11-03", score: 100 },
      { content_id: "a", captured_on: "2026-11-10", score: 400 },
      { content_id: "a", captured_on: "2026-11-11", score: 500 },
    ];
    assert.deepEqual(metricGrowth(500, snaps, 1, today), { delta: 100, since: "2026-11-10" });
    assert.deepEqual(metricGrowth(500, snaps, 7, today), { delta: 400, since: "2026-11-03" });
    assert.equal(metricGrowth(500, [{ content_id: "a", captured_on: today, score: 500 }], 1, today), null);
    assert.equal(metricGrowth(null, snaps, 1, today), null);
  });

  test("출처 내 상위 비율, 표본 3건 미만은 표시 안 함", () => {
    assert.equal(topPercent(1, 50), 2);
    assert.equal(topPercent(3, 10), 30);
    assert.equal(topPercent(1, 2), null);
  });

  test("KST 날짜: UTC 15시 이후는 다음 날", () => {
    assert.equal(kstDate(new Date("2026-11-10T15:30:00Z")), "2026-11-11");
    assert.equal(kstDate(new Date("2026-11-10T15:30:00Z"), -1), "2026-11-10");
  });
});

describe("트렌드 한눈에", () => {
  const base = { published_at: "2026-11-10T00:00:00Z", collected_at: "2026-11-10T00:00:00Z", summary: null };
  const item = (id: string, title: string, keywords: string[], extra: Record<string, unknown> = {}) => ({ id, title, keywords, ...base, ...extra });

  test("카테고리 비중: 8종 모두 반환, 비율·증감(%p)", () => {
    const cur = [item("1", "AI agent framework", []), item("2", "Multi-agent MCP", []), item("3", "NVIDIA GPU", []), item("4", "Series B funding", [])];
    const prev = [item("5", "NVIDIA GPU cluster", []), item("6", "Agentic workflow", [])];
    const s = categoryBreakdown(cur, prev);
    assert.equal(s.length, 8);
    const agent = s.find((x) => x.slug === "agent")!;
    assert.equal(agent.count, 2);
    assert.equal(agent.share, 50);
    assert.equal(agent.prevShare, 50);
    assert.equal(agent.deltaPp, 0);
    assert.equal(s.find((x) => x.slug === "business")!.deltaPp, 25);
    assert.equal(s.find((x) => x.slug === "infra")!.deltaPp, -25);
  });

  test("순위 변동: 상승·하락·NEW", () => {
    assert.deepEqual(rankChanges(["a", "b", "c"], ["b", "c", "a"]), { a: 2, b: -1, c: -1 });
    assert.deepEqual(rankChanges(["x"], []), { x: "new" });
  });

  test("관련 기사: 범용 키워드 제외, 같은 카테고리 1개 또는 2개 이상 겹침", () => {
    const pool = [
      item("t", "Agent SDK release", ["ai", "mcp", "agent sdk"]),
      item("s", "MCP servers for agents", ["mcp"]),
      item("u", "LLM news", ["ai", "llm"]),
      item("v", "GPU cluster tuning", ["mcp", "agent sdk"]),
    ];
    const r = relatedCounts([pool[0]], pool);
    assert.equal(r.t.count, 2); // s(같은 카테고리, mcp 1개), v(2개 겹침). u 는 범용 키워드만
    assert.deepEqual(r.t.keywords, ["mcp", "agent sdk"]);
  });

  test("조건 여부: 기간·정렬·개수만으로는 조건 아님 (Dashboard 와 같은 범위)", () => {
    const p = parseTrendParams({ period: "daily", sort: "latest", limit: "50" });
    assert.equal(isFocused(p), false);
    assert.equal(isFocused({ ...p, kw: "mcp" }), true);
    assert.equal(isFocused({ ...p, cat: "agent" }), true);
    assert.equal(isFocused({ ...p, type: "paper" }), true);
  });

  test("함께 등장한 키워드: 선택 키워드·범용 키워드 제외, 2건 이상만", () => {
    const items = [{ keywords: ["mcp", "a2a", "ai"] }, { keywords: ["mcp", "a2a", "agent sdk"] }, { keywords: ["mcp", "agent sdk"] }, { keywords: ["mcp", "solo"] }];
    assert.deepEqual(coKeywords(items, ["mcp"]), [
      { keyword: "a2a", count: 2 },
      { keyword: "agent sdk", count: 2 },
    ]);
  });

  test("출처 분포: 상위 N개 + 기타", () => {
    const items = ["HN", "HN", "HN", "GitHub", "dev.to", "arXiv"].map((source_name) => ({ source_name }));
    assert.deepEqual(sourceShares(items, 2), [
      { name: "HN", count: 3, share: 50 },
      { name: "arXiv", count: 1, share: 16.7 }, // 동률은 이름순(ko 로케일)
      { name: "기타", count: 2, share: 33.3 },
    ]);
  });

  test("키워드 7일 추이: KST 날짜별, 콘텐츠당 1회", () => {
    const now = Date.parse("2026-11-11T03:00:00Z");
    const s = keywordDailySeries(
      [
        { keywords: ["mcp", "mcp"], published_at: "2026-11-11T01:00:00Z", collected_at: "2026-11-11T01:00:00Z" },
        { keywords: ["mcp"], published_at: "2026-11-09T01:00:00Z", collected_at: "2026-11-09T01:00:00Z" },
        { keywords: ["mcp"], published_at: "2026-10-01T01:00:00Z", collected_at: "2026-10-01T01:00:00Z" },
      ],
      ["mcp"],
      7,
      now,
    );
    assert.deepEqual(s.get("mcp"), [0, 0, 0, 0, 1, 0, 1]);
  });
});
