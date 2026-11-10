// 소스별 수집 어댑터: data_sources 행 → CollectedItem[]
import { fetchJson, mapLimit, safeFetch } from "./http.ts";
import { parseFeed } from "./rss.ts";
import {
  blueskyHandleFromUrl,
  parseAlgoliaHits,
  parseArxiv,
  parseBlueskyFeed,
  parseDevto,
  parseGithubSearch,
  parseHackerNewsItem,
  parseHfModels,
  parseMastodonStatuses,
} from "./sources.ts";
import type { CollectedItem } from "./types.ts";

export type SourceRow = {
  id: string;
  user_id: string | null;
  slug: string;
  name: string;
  source_type: string;
  source_url: string | null;
};

export type AdapterResult = { items: CollectedItem[]; skipped: number };
/** 실행 맥락: 대상 사용자들의 관심 주제 검색 쿼리 (HN 검색용) */
export type AdapterContext = { queries: string[] };

const HN_LIMIT = 60;
const GITHUB_TOPICS = ["llm", "ai-agents", "rag"];

async function hackerNews(): Promise<AdapterResult> {
  const ids = (await fetchJson("https://hacker-news.firebaseio.com/v0/topstories.json")) as unknown;
  if (!Array.isArray(ids)) throw new Error("Hacker News 응답 형식이 올바르지 않습니다.");
  let skipped = 0;
  const items = await mapLimit(ids.slice(0, HN_LIMIT).filter((n) => Number.isInteger(n)), 6, async (id) => {
    try {
      return parseHackerNewsItem(await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`));
    } catch {
      skipped++;
      return null;
    }
  });
  return { items: items.filter((i): i is CollectedItem => i !== null), skipped };
}

async function github(): Promise<AdapterResult> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const seen = new Set<string>();
  const items: CollectedItem[] = [];
  // 비인증 검색 API 한도(분당 10회)를 고려해 토픽 3개만 순차 조회
  for (const topic of GITHUB_TOPICS) {
    const q = encodeURIComponent(`topic:${topic} created:>${since}`);
    const raw = await fetchJson(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=20`, {
      accept: "application/vnd.github+json",
      headers,
    });
    for (const it of parseGithubSearch(raw)) {
      if (!seen.has(it.url)) {
        seen.add(it.url);
        items.push(it);
      }
    }
  }
  return { items, skipped: 0 };
}

async function arxiv(): Promise<AdapterResult> {
  const q = encodeURIComponent("cat:cs.AI OR cat:cs.CL OR cat:cs.LG");
  const { text } = await safeFetch(`https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=50`, {
    accept: "application/atom+xml",
  });
  return { items: parseArxiv(text), skipped: 0 };
}

async function huggingFace(): Promise<AdapterResult> {
  const raw = await fetchJson("https://huggingface.co/api/models?sort=trendingScore&limit=30");
  return { items: parseHfModels(raw), skipped: 0 };
}

const DEVTO_TAGS = ["ai", "llm", "machinelearning"];
const MASTODON_TAGS = ["ai", "llm", "machinelearning", "generativeai"];

/** 여러 요청 결과를 URL 기준 중복 제거하며 합침. 일부 실패는 skipped 로 집계 */
async function gather(tasks: (() => Promise<CollectedItem[]>)[], concurrency = 3): Promise<AdapterResult> {
  let skipped = 0;
  const lists = await mapLimit(tasks, concurrency, async (t) => {
    try {
      return await t();
    } catch {
      skipped++;
      return [];
    }
  });
  if (tasks.length > 0 && skipped === tasks.length) throw new Error("모든 요청이 실패했습니다.");
  const seen = new Set<string>();
  const items = lists.flat().filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
  return { items, skipped };
}

async function devto(): Promise<AdapterResult> {
  return gather(DEVTO_TAGS.map((tag) => async () => parseDevto(await fetchJson(`https://dev.to/api/articles?tag=${tag}&top=7&per_page=30`))));
}

async function hnSearch(ctx: AdapterContext): Promise<AdapterResult> {
  if (ctx.queries.length === 0) return { items: [], skipped: 0 };
  const since = Math.floor((Date.now() - 7 * 86400000) / 1000);
  return gather(
    ctx.queries.map((q) => async () =>
      parseAlgoliaHits(
        await fetchJson(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q.slice(0, 200))}&tags=story&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}&hitsPerPage=20`,
        ),
      ),
    ),
  );
}

async function mastodonTags(): Promise<AdapterResult> {
  return gather(MASTODON_TAGS.map((tag) => async () => parseMastodonStatuses(await fetchJson(`https://mastodon.social/api/v1/timelines/tag/${tag}?limit=40`))));
}

async function bluesky(handle: string): Promise<AdapterResult> {
  const raw = await fetchJson(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=50&filter=posts_no_replies`,
  );
  return { items: parseBlueskyFeed(raw), skipped: 0 };
}

async function rss(source: SourceRow): Promise<AdapterResult> {
  if (!source.source_url) throw new Error("피드 URL이 없습니다.");
  const { text } = await safeFetch(source.source_url, {
    // 사용자가 추가한 소스는 신뢰하지 않음 → SSRF 검사
    untrusted: source.user_id !== null,
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
  });
  return { items: parseFeed(text), skipped: 0 };
}

export function adapterFor(source: SourceRow, ctx: AdapterContext = { queries: [] }): (() => Promise<AdapterResult>) | null {
  switch (source.slug) {
    case "devto":
      return devto;
    case "hn-search":
      return () => hnSearch(ctx);
    case "mastodon-tags":
      return mastodonTags;
    case "hacker-news":
      return hackerNews;
    case "github":
      return github;
    case "arxiv":
      return arxiv;
    case "hugging-face":
      return huggingFace;
  }
  // 사용자 피드: Bluesky 프로필 URL 은 공개 API 로 수집 (고정 호스트)
  const handle = source.source_url ? blueskyHandleFromUrl(source.source_url) : null;
  if (handle) return () => bluesky(handle);
  if (["official_blog", "rss", "news"].includes(source.source_type) && source.source_url) return () => rss(source);
  return null;
}
