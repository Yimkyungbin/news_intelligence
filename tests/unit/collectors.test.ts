// 수집기 파서·분류·IP 검사 단위 테스트
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed, SUMMARY_MAX } from "../../src/lib/collectors/rss.ts";
import { parseArxiv, parseGithubSearch, parseHackerNewsItem, parseHfModels } from "../../src/lib/collectors/sources.ts";
import { classify, matchesKeyword } from "../../src/lib/collectors/classify.ts";
import { isPublicAddress } from "../../src/lib/collectors/net.ts";
import { stripHtml } from "../../src/lib/collectors/text.ts";
import type { CollectedItem } from "../../src/lib/collectors/types.ts";
import { ARXIV, ATOM, GITHUB_SEARCH, HF_MODELS, HN_ASK, HN_STORY, RSS2, XXE } from "./fixtures/feeds.ts";

describe("RSS 2.0 파서", () => {
  const items = parseFeed(RSS2);

  test("제목·URL 없는 항목과 위험한 스킴은 제외", () => {
    assert.equal(items.length, 2);
    assert.ok(items.every((i) => i.url.startsWith("https://")));
  });

  test("HTML·스크립트 제거, 엔티티 해제, URL 해시 제거", () => {
    const [first] = items;
    assert.equal(first.title, "Building Agentic AI systems & tools");
    assert.equal(first.url, "https://blog.example.com/posts/agentic-ai");
    assert.equal(first.summary, "Hello world <3 AA");
    assert.ok(!/script|onerror/i.test(first.summary ?? ""));
    assert.equal(first.author, "Jane Doe");
    assert.equal(first.publishedAt, "2026-11-09T10:00:00.000Z");
    assert.deepEqual(first.tags, ["AI", "Agents"]);
  });

  test("상대 링크는 채널 링크 기준 절대 URL로, 요약은 500자 제한", () => {
    const rel = items[1];
    assert.equal(rel.url, "https://blog.example.com/posts/relative");
    assert.ok(Array.from(rel.summary ?? "").length <= SUMMARY_MAX);
    assert.ok(rel.summary?.endsWith("…"));
  });

  test("엔티티 선언(XXE/billion laughs) 피드는 거부", () => {
    assert.throws(() => parseFeed(XXE), /엔티티/);
  });

  test("RSS/Atom 이 아니면 오류", () => {
    assert.throws(() => parseFeed("<html><body>hi</body></html>"), /형식이 아닙니다/);
  });
});

describe("Atom 파서", () => {
  test("alternate 링크 선택, 저자·요약·카테고리 추출", () => {
    const [e] = parseFeed(ATOM);
    assert.equal(e.url, "https://developer.example.com/posts/1");
    assert.equal(e.author, "John Roe");
    assert.equal(e.summary, "GPU inference tips");
    assert.equal(e.publishedAt, "2026-11-08T09:00:00.000Z");
    assert.deepEqual(e.tags, ["Generative AI"]);
  });
});

describe("공개 API 파서", () => {
  test("Hacker News: points·comments 지표, 외부 URL", () => {
    const it = parseHackerNewsItem(HN_STORY);
    assert.ok(it);
    assert.deepEqual(it.popularity, { points: 321, comments: 42 });
    assert.equal(it.url, "https://example.org/agents");
    assert.equal(it.contentType, "discussion");
  });

  test("Hacker News: URL 없는 글은 토론 페이지, 0 지표는 제외", () => {
    const it = parseHackerNewsItem(HN_ASK);
    assert.equal(it?.url, "https://news.ycombinator.com/item?id=50431059");
    assert.deepEqual(it?.popularity, { points: 10 });
    assert.equal(it?.summary, "How do you evaluate ?");
    assert.equal(parseHackerNewsItem({ ...HN_STORY, type: "job" }), null);
    assert.equal(parseHackerNewsItem({ ...HN_STORY, dead: true }), null);
  });

  test("GitHub: stars 지표, 잘못된 URL 제외", () => {
    const items = parseGithubSearch(GITHUB_SEARCH);
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].popularity, { stars: 1500 });
    assert.deepEqual(items[0].tags, ["ai-agents", "llm"]);
    assert.throws(() => parseGithubSearch({}));
  });

  test("arXiv: https 통일, 줄바꿈 제목 정리, 언어 en", () => {
    const [p] = parseArxiv(ARXIV);
    assert.equal(p.url, "https://arxiv.org/abs/2611.00001v1");
    assert.equal(p.title, "Retrieval Augmented Generation Evaluation at Scale");
    assert.equal(p.contentType, "paper");
    assert.equal(p.language, "en");
  });

  test("Hugging Face: likes·downloads, 경로 조작 id 제외, 라이선스 태그 제외", () => {
    const items = parseHfModels(HF_MODELS);
    assert.equal(items.length, 1);
    assert.equal(items[0].url, "https://huggingface.co/org/open-model-7b");
    assert.deepEqual(items[0].popularity, { likes: 120, downloads: 50000 });
    assert.ok(!items[0].tags.some((t) => t.includes(":")));
  });
});

describe("주제 분류", () => {
  const base: CollectedItem = {
    title: "A practical guide to RAG pipelines",
    url: "https://x.example/1",
    summary: "Vector database and retrieval augmented generation",
    author: null,
    publishedAt: null,
    contentType: "article",
    popularity: {},
    tags: [],
    language: null,
  };

  test("영문 키워드는 단어 경계로 매칭 (rag ≠ storage)", () => {
    assert.ok(matchesKeyword("rag pipelines", "rag"));
    assert.ok(!matchesKeyword("object storage tips", "rag"));
    assert.ok(matchesKeyword("new llms released", "llm"));
    assert.ok(matchesKeyword("multi agent systems", "multi-agent"));
  });

  test("한국어 키워드는 부분 일치, NFD 입력도 일치", () => {
    assert.ok(matchesKeyword("에이전트 오케스트레이션 사례", "오케스트레이션"));
    assert.ok(matchesKeyword("에이전트 오케스트레이션".normalize("NFC"), "에이전트".normalize("NFD")));
  });

  test("일치 키워드 비율로 relevance, 불일치 주제 제외", () => {
    const res = classify(base, [
      { id: "rag", keywords: ["rag", "vector database", "knowledge graph", "retrieval augmented generation"], language: "all" },
      { id: "gpu", keywords: ["gpu", "inference"], language: "all" },
    ]);
    assert.equal(res.length, 1);
    assert.equal(res[0].topicId, "rag");
    assert.equal(res[0].relevance, 1);
    assert.deepEqual(res[0].matched.sort(), ["rag", "retrieval augmented generation", "vector database"]);
  });

  test("주제 언어 조건: ko 주제는 영어 콘텐츠에 연결하지 않음", () => {
    const res = classify(base, [{ id: "ko-only", keywords: ["rag"], language: "ko" }]);
    assert.equal(res.length, 0);
    const ko = classify({ ...base, title: "RAG 파이프라인 구축 사례", summary: null }, [{ id: "ko-only", keywords: ["rag"], language: "ko" }]);
    assert.equal(ko.length, 1);
  });
});

describe("SSRF IP 검사", () => {
  test("내부 대역 차단", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "not-an-ip"]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
  });

  test("공인 주소 허용", () => {
    for (const ip of ["8.8.8.8", "140.82.112.3", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      assert.equal(isPublicAddress(ip), true, ip);
    }
  });
});

test("stripHtml: 엔티티로 숨긴 태그도 제거", () => {
  assert.equal(stripHtml("&lt;img src=x onerror=alert(1)&gt;safe"), "safe");
});
