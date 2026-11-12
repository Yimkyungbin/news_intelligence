// 수집처 확대·일자별 통계·트렌드 시사점·번역 일괄 처리 단위 테스트
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { blueskyHandleFromUrl, parseAlgoliaHits, parseBlueskyFeed, parseDevto, parseMastodonStatuses } from "../../src/lib/collectors/sources.ts";
import { computeDailyStats, groupByStatDate, keywordSeries, recentKstDates, statDate, summarizeRange, type StatItem } from "../../src/lib/stats/compute.ts";
import { splitPeriods, trendDelta } from "../../src/lib/trends/compute.ts";
import { describeTrendScope, parseTrendParams, trendCacheKey } from "../../src/lib/trends/params.ts";
import { BATCH_SIZE, buildBatchMetaPrompt } from "../../src/lib/ai/prompts.ts";
import { mockBatchMeta, mockTrendInsight } from "../../src/lib/ai/mock.ts";
import { TASK_SCHEMAS } from "../../src/lib/ai/schemas.ts";

describe("새 소스 파서", () => {
  test("dev.to: canonical URL, 반응·댓글 지표, 태그", () => {
    const [a] = parseDevto([
      { title: "Build agents", url: "https://dev.to/x/build", canonical_url: "https://blog.example.com/build", description: "<b>How</b> to", user: { name: "Kim" }, published_at: "2026-11-09T00:00:00Z", positive_reactions_count: 42, comments_count: 0, tag_list: ["ai", "llm"] },
      { title: "", url: "https://dev.to/x/empty" },
    ]);
    assert.equal(a.url, "https://blog.example.com/build");
    assert.deepEqual(a.popularity, { likes: 42 });
    assert.equal(a.summary, "How to");
    assert.deepEqual(a.tags, ["ai", "llm"]);
    assert.throws(() => parseDevto({}));
  });

  test("HN 검색(Algolia): URL 없으면 토론 페이지, 잘못된 id 제외", () => {
    const items = parseAlgoliaHits({
      hits: [
        { objectID: "123", title: "Show HN: RAG", url: null, points: 50, num_comments: 7, created_at: "2026-11-09T00:00:00Z", author: "pg" },
        { objectID: "../x", title: "bad" },
      ],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].url, "https://news.ycombinator.com/item?id=123");
    assert.deepEqual(items[0].popularity, { points: 50, comments: 7 });
  });

  test("Mastodon: 공개 게시물만, 부스트·민감 제외, HTML 제거, 언어", () => {
    const base = { url: "https://mastodon.social/@a/1", content: "<p>New <b>LLM</b> release is out. More soon</p>", visibility: "public", account: { acct: "a" }, created_at: "2026-11-09T00:00:00Z", favourites_count: 3, replies_count: 1, tags: [{ name: "llm" }], language: "en" };
    const items = parseMastodonStatuses([base, { ...base, url: "https://m/2", visibility: "unlisted" }, { ...base, url: "https://m/3", reblog: {} }, { ...base, url: "https://m/4", sensitive: true }]);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "New LLM release is out.");
    assert.equal(items[0].language, "en");
    assert.deepEqual(items[0].popularity, { likes: 3, comments: 1 });
    assert.deepEqual(items[0].tags, ["llm"]);
  });

  test("Bluesky: 프로필 URL 핸들 추출·검증, 리포스트 제외, 게시글 URL 생성", () => {
    assert.equal(blueskyHandleFromUrl("https://bsky.app/profile/Alice.bsky.social"), "alice.bsky.social");
    assert.equal(blueskyHandleFromUrl("https://bsky.app/profile/a/post/1"), null);
    assert.equal(blueskyHandleFromUrl("http://bsky.app/profile/alice.bsky.social"), null);
    assert.equal(blueskyHandleFromUrl("https://evil.example/profile/alice.bsky.social"), null);
    assert.equal(blueskyHandleFromUrl("https://bsky.app/profile/..%2F..%2Fx"), null);
    const items = parseBlueskyFeed({
      feed: [
        { post: { uri: "at://did:plc:x/app.bsky.feed.post/3abc", author: { handle: "alice.bsky.social" }, record: { text: "Agents are here", createdAt: "2026-11-09T00:00:00Z", langs: ["ko"] }, likeCount: 5 } },
        { post: { uri: "at://did:plc:x/app.bsky.feed.post/3def", author: { handle: "alice.bsky.social" }, record: { text: "repost" } }, reason: { $type: "repost" } },
      ],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].url, "https://bsky.app/profile/alice.bsky.social/post/3abc");
    assert.equal(items[0].language, "ko");
  });
});

describe("일자별 통계", () => {
  let n = 0;
  const item = (published: string | null, over: Partial<StatItem> = {}): StatItem => ({
    id: `s${++n}`,
    title: `t${n}`,
    original_url: `https://x.example/${n}`,
    source_name: "GitHub",
    source_id: "src-1",
    published_at: published,
    collected_at: "2026-11-10T03:00:00.000Z",
    language: "en",
    content_type: "repository",
    keywords: ["llm"],
    popularity: { stars: n },
    provenance: "collected",
    topic_ids: ["t1"],
    source: { slug: "github" },
    ...over,
  });

  test("기준 날짜: 게시일(없으면 수집일)의 KST 날짜", () => {
    assert.equal(statDate(item("2026-11-09T15:30:00.000Z")), "2026-11-10"); // KST 00:30
    assert.equal(statDate(item("2026-11-09T14:59:00.000Z")), "2026-11-09");
    assert.equal(statDate(item(null)), "2026-11-10");
  });

  test("집계: 출처·주제·언어·유형·키워드·인기 TOP", () => {
    const items = [
      item("2026-11-10T01:00:00Z"),
      item("2026-11-10T02:00:00Z", { source_name: "Hacker News", source: { slug: "hacker-news" }, popularity: { points: 10 }, language: "ko", keywords: ["llm", "ai agents"], topic_ids: [] }),
      item("2026-11-10T03:00:00Z", { provenance: "demo" }),
    ];
    const d = computeDailyStats(items, [{ id: "t1", name: "Agentic AI" }, { id: "t2", name: "빈 주제" }]);
    assert.equal(d.total, 3);
    assert.equal(d.demo, 1);
    assert.deepEqual(d.by_source.map((s) => [s.key, s.count]), [["github", 2], ["hacker-news", 1]]);
    assert.deepEqual(d.by_topic, [{ id: "t1", name: "Agentic AI", count: 2 }]);
    assert.deepEqual(d.by_language, { en: 2, ko: 1 });
    assert.equal(d.keywords[0].keyword, "llm");
    assert.equal(d.top_items.length, 3);
    assert.ok(d.top_items.every((t) => !("summary" in t)), "원문(요약) 미저장");
  });

  test("날짜 묶기·최근 날짜 목록·기간 합계·키워드 추이", () => {
    const dates = recentKstDates(3, new Date("2026-11-10T03:00:00Z"));
    assert.deepEqual(dates, ["2026-11-08", "2026-11-09", "2026-11-10"]);
    const g = groupByStatDate([item("2026-11-09T01:00:00Z"), item("2026-11-01T01:00:00Z")], dates);
    assert.equal(g.get("2026-11-09")?.length, 1);
    assert.equal(g.get("2026-11-08")?.length, 0);
    const rows = dates.slice(1).map((d) => ({ stat_date: d, data: computeDailyStats([item(`${d}T01:00:00Z`)], []) }));
    const sum = summarizeRange(rows);
    assert.equal(sum.total, 2);
    assert.equal(sum.sources[0].count, 2);
    const series = keywordSeries(rows, dates, ["llm"]);
    assert.deepEqual(series.map((p) => p.llm), [0, 1, 1]);
  });
});

describe("트렌드 시사점 (집계)", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  const mk = (daysAgo: number, keywords: string[], topic?: { id: string; name: string }) => ({
    keywords,
    published_at: new Date(now - daysAgo * 86400000).toISOString(),
    collected_at: new Date(now).toISOString(),
    topic_links: topic ? [{ topic }] : [],
  });
  const rag = { id: "r", name: "RAG" };
  const items = [mk(1, ["rag", "llm"], rag), mk(2, ["rag"], rag), mk(3, ["mcp"]), mk(4, ["mcp"]), mk(9, ["llm"], rag), mk(10, ["llm"]), mk(20, ["old"])];

  test("현재·직전 기간 분리", () => {
    const { current, previous } = splitPeriods(items, 7, now);
    assert.equal(current.length, 4);
    assert.equal(previous.length, 2);
  });

  test("급상승·새 키워드·주제 증감", () => {
    const { current, previous } = splitPeriods(items, 7, now);
    const d = trendDelta(current, previous);
    assert.deepEqual(d.rising.map((k) => [k.keyword, k.delta]), [["mcp", 2], ["rag", 2]]);
    assert.deepEqual(d.new_keywords.map((k) => k.keyword), ["mcp", "rag"]);
    assert.deepEqual(d.topics, [{ id: "r", name: "RAG", count: 2, delta: 1 }]);
  });

  test("조건 파싱: 허용 값만, 잘못된 주제 id·필터 주입 차단, 캐시 키는 정렬·개수 제외", () => {
    const p = parseTrendParams({ period: "monthly", limit: "50", type: "paper", lang: "xx", sort: "latest", topic: "1,2)", kw: "CS.AI" });
    assert.deepEqual(p, { period: "monthly", limit: 50, type: "paper", lang: "", sort: "latest", topic: "", kw: "ai", cat: "" });
    // 카테고리: 허용 slug 만, 미지정 시 기존 캐시 키와 동일, 지정 시 키·범위 설명에 반영
    assert.equal(parseTrendParams({ cat: "agent" }).cat, "agent");
    assert.equal(parseTrendParams({ cat: "x),or(" }).cat, "");
    assert.equal(trendCacheKey(p), JSON.stringify({ period: "monthly", type: "paper", lang: "", topic: "", kw: "ai" }));
    assert.notEqual(trendCacheKey({ ...p, cat: "agent" }), trendCacheKey(p));
    assert.match(describeTrendScope({ ...p, cat: "agent" }), /카테고리: 에이전트/);
    const id = "00000000-0000-4000-8000-000000000001";
    assert.equal(parseTrendParams({ topic: id }, []).topic, "");
    assert.equal(parseTrendParams({ topic: id }, [id]).topic, id);
    assert.equal(trendCacheKey({ ...p, sort: "popular", limit: 10 }), trendCacheKey(p));
    assert.match(describeTrendScope(p, "RAG"), /Monthly · 논문 · 주제: RAG · 키워드: #ai/);
  });
});

describe("일괄 번역·한 줄 시사점", () => {
  const c = (title: string, language: string) => ({ title, summary: "s", source_name: "TC", content_type: "article", published_at: null, language });

  test("프롬프트: 언어 표시, 최대 10건, 한국어 출력 지시", () => {
    const p = buildBatchMetaPrompt(Array.from({ length: 15 }, (_, i) => c(`t${i}`, i % 2 ? "ko" : "en")));
    assert.equal((p.user.match(/<item /g) ?? []).length, BATCH_SIZE);
    assert.match(p.user, /<item lang="foreign" id="1">/);
    assert.match(p.user, /<item lang="ko" id="2">/);
    assert.match(p.system, /한국어/);
  });

  test("모의 출력: 스키마 통과, 한국어 콘텐츠는 번역하지 않고 시사점만", () => {
    const out = mockBatchMeta([c("Agents", "en"), c("에이전트", "ko")]);
    assert.equal(TASK_SCHEMAS.batch_meta.safeParse(out).success, true);
    assert.match(out.items[0].title_ko, /DEMO 번역/);
    assert.equal(out.items[1].title_ko, "");
    assert.ok(out.items[1].implication_ko.length > 0);
    assert.equal(TASK_SCHEMAS.briefing_insight.safeParse(mockTrendInsight([c("a", "en")])).success, true);
  });
});
