// 대시보드 고도화 단위 테스트: 순위 정규화·다양성, 키워드 정리, 게시일 기준 차트
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { dailyBuckets, rankContent, topKeywords } from "../../src/lib/content.ts";
import { mergePluralCounts, normalizeKeyword, normalizeKeywords } from "../../src/lib/keywords.ts";

type Item = {
  id: string;
  popularity: Record<string, number>;
  published_at: string | null;
  collected_at: string;
  source_name: string;
  source: { slug: string } | null;
};

let seq = 0;
function item(source: string, popularity: Record<string, number>, published = "2026-11-09T00:00:00.000Z"): Item {
  seq++;
  return { id: `id-${String(seq).padStart(3, "0")}`, popularity, published_at: published, collected_at: published, source_name: source, source: { slug: source.toLowerCase() } };
}

describe("인기 순위: 출처 정규화와 다양성", () => {
  // 실제 화면과 같은 상황: GitHub stars(수천) 다수 vs Hacker News points(수백) 소수
  const github = Array.from({ length: 30 }, (_, i) => item("GitHub", { stars: 5000 - i * 100 }));
  const hn = [item("Hacker News", { points: 320 }), item("Hacker News", { points: 152 }), item("Hacker News", { points: 30 })];
  const hf = [item("Hugging Face", { likes: 120 })];
  const blogs = [item("OpenAI News", {}, "2026-11-10T00:00:00.000Z"), item("AWS Blog", {}, "2026-11-08T00:00:00.000Z")];
  const all = [...github, ...hn, ...hf, ...blogs];

  test("원래 숫자가 큰 출처가 Top 10을 독점하지 않음", () => {
    const { items } = rankContent(all, 10);
    const gh = items.filter((i) => i.source_name === "GitHub").length;
    assert.ok(gh <= 6, `GitHub ${gh}건`);
    assert.ok(items.some((i) => i.source_name === "Hacker News"));
    assert.ok(items.some((i) => i.source_name === "Hugging Face"));
  });

  test("각 출처의 1위가 상위권에 포함됨", () => {
    const { items } = rankContent(all, 10);
    const top5 = items.slice(0, 5).map((i) => i.id);
    assert.ok(top5.includes(github[0].id));
    assert.ok(top5.includes(hn[0].id));
  });

  test("같은 출처 안에서는 지표 순서 유지", () => {
    const { items } = rankContent(all, 30);
    const ghOrder = items.filter((i) => i.source_name === "GitHub").map((i) => i.popularity.stars);
    assert.deepEqual(ghOrder, [...ghOrder].sort((a, b) => b - a));
  });

  test("지표 없는 항목은 지표 있는 항목 뒤에 게시일 최신순", () => {
    const { items } = rankContent(all, all.length);
    const firstUnranked = items.findIndex((i) => Object.keys(i.popularity).length === 0);
    assert.equal(firstUnranked, all.length - blogs.length);
    assert.deepEqual(items.slice(firstUnranked).map((i) => i.source_name), ["OpenAI News", "AWS Blog"]);
  });

  test("근거 문구: 출처 내 순위/전체", () => {
    const { notes } = rankContent(all, 10);
    assert.equal(notes[github[0].id], "GitHub 내 1위/30");
    assert.equal(notes[hn[0].id], "Hacker News 내 1위/3");
  });

  test("지표가 하나도 없으면 ranked = false, 게시일순", () => {
    const res = rankContent(blogs, 10);
    assert.equal(res.ranked, false);
    assert.equal(res.items[0].source_name, "OpenAI News");
  });

  test("결과가 결정적 (같은 입력 → 같은 순서)", () => {
    assert.deepEqual(rankContent(all, 10).items.map((i) => i.id), rankContent([...all].reverse(), 10).items.map((i) => i.id));
  });
});

describe("키워드 정리", () => {
  test("arXiv 분류 코드는 읽기 쉬운 이름으로, 모르는 코드는 제외", () => {
    assert.equal(normalizeKeyword("cs.AI"), "ai");
    assert.equal(normalizeKeyword("cs.LG"), "machine learning");
    assert.equal(normalizeKeyword("q-bio.nc"), null);
  });

  test("복합 분류 분리, 하이픈·밑줄 정리, 메타데이터 태그 제외", () => {
    assert.deepEqual(normalizeKeywords(["Agentic AI / Generative AI", "ai-agents", "endpoints_compatible", "safetensors", "GPT-4o"]), [
      "agentic ai",
      "generative ai",
      "ai agents",
      "gpt-4o",
    ]);
  });

  test("같은 목록의 복수형은 단수형으로 병합", () => {
    assert.deepEqual(normalizeKeywords(["ai agent", "AI Agents", "llm", "LLMs"]), ["ai agent", "llm"]);
  });

  test("숫자만·너무 긴 값·빈 값 제외, 한국어 유지", () => {
    assert.deepEqual(normalizeKeywords(["2026", "", "x".repeat(41), "  에이전트  "]), ["에이전트"]);
  });

  test("집계 시 복수형 개수를 단수형에 합산", () => {
    const merged = mergePluralCounts(new Map([["ai agent", 3], ["ai agents", 2], ["news", 1]]));
    assert.equal(merged.get("ai agent"), 5);
    assert.equal(merged.has("ai agents"), false);
    assert.equal(merged.get("news"), 1); // 단수형 "new" 가 없으면 그대로
  });

  test("topKeywords: 저장된 원문 키워드도 정리해서 집계", () => {
    const res = topKeywords([{ keywords: ["cs.AI", "llm"] }, { keywords: ["CS.ai", "LLMs"] }, { keywords: ["agentic ai / generative ai"] }]);
    assert.deepEqual(res.slice(0, 2), [
      { keyword: "ai", count: 2 },
      { keyword: "llm", count: 2 },
    ]);
    assert.ok(res.some((k) => k.keyword === "generative ai"));
  });
});

describe("일자별 차트", () => {
  test("게시일 기준으로 나누고, 게시일이 없으면 수집일 사용", () => {
    const now = Date.parse("2026-11-10T03:00:00.000Z"); // KST 11/10 12:00
    const buckets = dailyBuckets(
      [
        { published_at: "2026-11-08T03:00:00.000Z", collected_at: "2026-11-10T01:00:00.000Z" },
        { published_at: "2026-11-08T05:00:00.000Z", collected_at: "2026-11-10T01:00:00.000Z" },
        { published_at: null, collected_at: "2026-11-10T01:00:00.000Z" },
      ],
      7,
      now,
    );
    assert.equal(buckets.length, 7);
    assert.equal(buckets.find((b) => b.day === "11. 8.")?.count, 2);
    assert.equal(buckets.at(-1)?.count, 1);
  });
});
