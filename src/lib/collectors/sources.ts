// 공개 API 응답 파서: Hacker News, GitHub, arXiv, Hugging Face
import { parseFeed, SUMMARY_MAX } from "./rss.ts";
import { cleanPostTitle, cleanText, normalizeUrl, toIsoDate } from "./text.ts";
import type { CollectedItem } from "./types.ts";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** 출처가 제공한 0보다 큰 지표만 남김 */
function metrics(m: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, num(v)]).filter(([, v]) => (v as number) > 0));
}

/* ---------- Hacker News (Firebase API item) ---------- */
export function parseHackerNewsItem(raw: unknown): CollectedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Record<string, unknown>;
  if (it.type !== "story" || it.dead || it.deleted) return null;
  const title = cleanText(it.title, 500);
  if (!title || typeof it.id !== "number") return null;
  const discussion = `https://news.ycombinator.com/item?id=${it.id}`;
  return {
    title,
    url: normalizeUrl(it.url) ?? discussion,
    summary: cleanText(it.text, SUMMARY_MAX),
    author: cleanText(it.by, 100),
    publishedAt: typeof it.time === "number" ? new Date(it.time * 1000).toISOString() : null,
    contentType: "discussion",
    popularity: metrics({ points: it.score, comments: it.descendants }),
    tags: [],
    language: null,
  };
}

/* ---------- GitHub (search/repositories) ---------- */
export function parseGithubSearch(raw: unknown): CollectedItem[] {
  const items = (raw as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) throw new Error("GitHub 검색 응답 형식이 올바르지 않습니다.");
  return items.flatMap((r) => {
    const repo = r as Record<string, unknown>;
    const title = cleanText(repo.full_name, 200);
    const url = normalizeUrl(repo.html_url);
    if (!title || !url) return [];
    const topics = Array.isArray(repo.topics) ? repo.topics.filter((t): t is string => typeof t === "string").slice(0, 10) : [];
    return [
      {
        title,
        url,
        summary: cleanText(repo.description, SUMMARY_MAX),
        author: cleanText((repo.owner as Record<string, unknown> | undefined)?.login, 100),
        publishedAt: toIsoDate(repo.created_at),
        contentType: "repository",
        popularity: metrics({ stars: repo.stargazers_count }),
        tags: topics,
        language: null,
      } satisfies CollectedItem,
    ];
  });
}

/* ---------- arXiv (Atom) ---------- */
export function parseArxiv(xml: string): CollectedItem[] {
  return parseFeed(xml, { contentType: "paper" }).map((it) => ({
    ...it,
    // arXiv id 링크는 http 로 오는 경우가 있어 https 로 통일
    url: it.url.replace(/^http:\/\/arxiv\.org\//, "https://arxiv.org/"),
    language: "en",
  }));
}

/* ---------- Hugging Face (api/models) ---------- */
export function parseHfModels(raw: unknown): CollectedItem[] {
  if (!Array.isArray(raw)) throw new Error("Hugging Face 응답 형식이 올바르지 않습니다.");
  return raw.flatMap((m) => {
    const model = m as Record<string, unknown>;
    const id = typeof model.id === "string" && /^[\w.-]+\/[\w.-]+$/.test(model.id) ? model.id : null;
    if (!id) return [];
    const pipeline = typeof model.pipeline_tag === "string" ? model.pipeline_tag : null;
    return [
      {
        title: id,
        url: `https://huggingface.co/${id}`,
        summary: pipeline ? `Hugging Face trending model · ${pipeline}` : "Hugging Face trending model",
        author: id.split("/")[0],
        publishedAt: toIsoDate(model.createdAt ?? model.lastModified),
        contentType: "model",
        popularity: metrics({ likes: model.likes, downloads: model.downloads }),
        tags: [pipeline, ...(Array.isArray(model.tags) ? model.tags : [])]
          .filter((t): t is string => typeof t === "string" && !t.includes(":"))
          .slice(0, 10),
        language: null,
      } satisfies CollectedItem,
    ];
  });
}

/* ---------- dev.to (api/articles) ---------- */
export function parseDevto(raw: unknown): CollectedItem[] {
  if (!Array.isArray(raw)) throw new Error("dev.to 응답 형식이 올바르지 않습니다.");
  return raw.flatMap((a) => {
    const it = a as Record<string, unknown>;
    const title = cleanText(it.title, 500);
    const url = normalizeUrl(it.canonical_url) ?? normalizeUrl(it.url);
    if (!title || !url) return [];
    const tags = Array.isArray(it.tag_list) ? it.tag_list.filter((t): t is string => typeof t === "string").slice(0, 10) : [];
    return [
      {
        title,
        url,
        summary: cleanText(it.description, SUMMARY_MAX),
        author: cleanText((it.user as Record<string, unknown> | undefined)?.name, 100),
        publishedAt: toIsoDate(it.published_at),
        contentType: "article",
        popularity: metrics({ likes: it.positive_reactions_count, comments: it.comments_count }),
        tags,
        language: null,
      } satisfies CollectedItem,
    ];
  });
}

/* ---------- Hacker News 검색 (Algolia search) ---------- */
export function parseAlgoliaHits(raw: unknown): CollectedItem[] {
  const hits = (raw as { hits?: unknown[] } | null)?.hits;
  if (!Array.isArray(hits)) throw new Error("HN 검색 응답 형식이 올바르지 않습니다.");
  return hits.flatMap((h) => {
    const it = h as Record<string, unknown>;
    const title = cleanText(it.title, 500);
    const id = typeof it.objectID === "string" && /^\d+$/.test(it.objectID) ? it.objectID : null;
    if (!title || !id) return [];
    return [
      {
        title,
        url: normalizeUrl(it.url) ?? `https://news.ycombinator.com/item?id=${id}`,
        summary: cleanText(it.story_text, SUMMARY_MAX),
        author: cleanText(it.author, 100),
        publishedAt: toIsoDate(it.created_at),
        contentType: "discussion",
        popularity: metrics({ points: it.points, comments: it.num_comments }),
        tags: [],
        language: null,
      } satisfies CollectedItem,
    ];
  });
}

/** SNS 게시글 제목: URL·멘션을 뺀 본문 첫 문장(최대 120자) */
function postTitle(text: string): string {
  const first = text.split(/(?<=[.!?。])\s|\n/)[0] || text;
  return cleanPostTitle(first, text);
}

const lang = (v: unknown): "ko" | "en" | null => (v === "ko" ? "ko" : v === "en" ? "en" : null);

/* ---------- Mastodon (timelines/tag) ---------- */
export function parseMastodonStatuses(raw: unknown): CollectedItem[] {
  if (!Array.isArray(raw)) throw new Error("Mastodon 응답 형식이 올바르지 않습니다.");
  return raw.flatMap((s) => {
    const st = s as Record<string, unknown>;
    // 공개 게시물만, 부스트·민감 표시 게시물 제외
    if (st.visibility !== "public" || st.reblog || st.sensitive) return [];
    const text = cleanText(st.content, 2000);
    const url = normalizeUrl(st.url);
    if (!text || !url) return [];
    const account = (st.account as Record<string, unknown> | undefined) ?? {};
    const tags = Array.isArray(st.tags)
      ? st.tags.map((t) => (t as Record<string, unknown>).name).filter((t): t is string => typeof t === "string").slice(0, 10)
      : [];
    return [
      {
        title: postTitle(text),
        url,
        summary: cleanText(text, SUMMARY_MAX),
        author: cleanText(account.acct, 100),
        publishedAt: toIsoDate(st.created_at),
        contentType: "post",
        popularity: metrics({ likes: st.favourites_count, comments: st.replies_count }),
        tags,
        language: lang(st.language),
      } satisfies CollectedItem,
    ];
  });
}

/* ---------- Bluesky (app.bsky.feed.getAuthorFeed) ---------- */
export const BLUESKY_HANDLE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/** https://bsky.app/profile/<handle> → handle. 아니면 null */
export function blueskyHandleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "bsky.app") return null;
    const m = u.pathname.match(/^\/profile\/([^/]+)\/?$/);
    const handle = m ? decodeURIComponent(m[1]).toLowerCase() : null;
    return handle && BLUESKY_HANDLE.test(handle) ? handle : null;
  } catch {
    return null;
  }
}

export function parseBlueskyFeed(raw: unknown): CollectedItem[] {
  const feed = (raw as { feed?: unknown[] } | null)?.feed;
  if (!Array.isArray(feed)) throw new Error("Bluesky 응답 형식이 올바르지 않습니다.");
  return feed.flatMap((f) => {
    const entry = f as Record<string, unknown>;
    if (entry.reason) return []; // 리포스트 제외
    const post = (entry.post as Record<string, unknown> | undefined) ?? {};
    const author = (post.author as Record<string, unknown> | undefined) ?? {};
    const record = (post.record as Record<string, unknown> | undefined) ?? {};
    const handle = typeof author.handle === "string" && BLUESKY_HANDLE.test(author.handle) ? author.handle : null;
    const rkey = typeof post.uri === "string" ? post.uri.split("/").pop() : null;
    const text = cleanText(record.text, 2000);
    if (!handle || !rkey || !/^[a-z0-9]+$/i.test(rkey) || !text) return [];
    const langs = Array.isArray(record.langs) ? record.langs : [];
    return [
      {
        title: postTitle(text),
        url: `https://bsky.app/profile/${handle}/post/${rkey}`,
        summary: cleanText(text, SUMMARY_MAX),
        author: handle,
        publishedAt: toIsoDate(record.createdAt),
        contentType: "post",
        popularity: metrics({ likes: post.likeCount, comments: post.replyCount }),
        tags: [],
        language: lang(langs[0]),
      } satisfies CollectedItem,
    ];
  });
}

/* ---------- Hugging Face Daily Papers (api/daily_papers) ---------- */
const ARXIV_ID = /^\d{4}\.\d{4,5}(v\d+)?$/;

export function parseHfDailyPapers(raw: unknown): CollectedItem[] {
  if (!Array.isArray(raw)) throw new Error("Hugging Face Daily Papers 응답 형식이 올바르지 않습니다.");
  return raw.flatMap((e) => {
    const entry = e as Record<string, unknown>;
    const paper = (entry.paper as Record<string, unknown> | undefined) ?? {};
    const id = typeof paper.id === "string" && ARXIV_ID.test(paper.id) ? paper.id : null;
    const title = cleanText(paper.title ?? entry.title, 500);
    if (!id || !title) return [];
    const authors = Array.isArray(paper.authors)
      ? paper.authors.map((a) => (a as Record<string, unknown>).name).filter((n): n is string => typeof n === "string")
      : [];
    const keywords = Array.isArray(paper.ai_keywords) ? paper.ai_keywords.filter((k): k is string => typeof k === "string").slice(0, 10) : [];
    return [
      {
        title,
        // 같은 논문의 arXiv 수집분과 구분되도록 HF 논문 페이지(추천·토론 포함)를 원문으로 사용
        url: `https://huggingface.co/papers/${id}`,
        summary: cleanText(paper.ai_summary, SUMMARY_MAX) ?? cleanText(paper.summary ?? entry.summary, SUMMARY_MAX),
        author: authors.length ? cleanText(authors.length > 1 ? `${authors[0]} 외 ${authors.length - 1}명` : authors[0], 100) : null,
        publishedAt: toIsoDate(paper.publishedAt ?? entry.publishedAt),
        contentType: "paper",
        popularity: metrics({ upvotes: paper.upvotes, comments: entry.numComments }),
        tags: keywords,
        language: "en",
      } satisfies CollectedItem,
    ];
  });
}

/* ---------- OpenAlex (works) ---------- */
/** OpenAlex 초록은 역색인({단어: [위치...]}) 형태로 제공 → 문장으로 복원 */
export function openAlexAbstract(index: unknown): string | null {
  if (!index || typeof index !== "object") return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) if (Number.isInteger(p) && p >= 0 && p < 5000) words[p as number] = word;
  }
  const text = words.filter(Boolean).join(" ");
  return text ? cleanText(text, SUMMARY_MAX) : null;
}

export function parseOpenAlexWorks(raw: unknown): CollectedItem[] {
  const results = (raw as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) throw new Error("OpenAlex 응답 형식이 올바르지 않습니다.");
  return results.flatMap((w) => {
    const work = w as Record<string, unknown>;
    const title = cleanText(work.display_name ?? work.title, 500);
    const loc = (work.primary_location as Record<string, unknown> | null) ?? {};
    const url = normalizeUrl(work.doi) ?? normalizeUrl(loc.landing_page_url) ?? normalizeUrl(work.id);
    if (!title || !url) return [];
    const authorships = Array.isArray(work.authorships) ? work.authorships : [];
    const first = cleanText(((authorships[0] as Record<string, unknown> | undefined)?.author as Record<string, unknown> | undefined)?.display_name, 80);
    const venue = cleanText((loc.source as Record<string, unknown> | null | undefined)?.display_name, 120);
    const keywords = Array.isArray(work.keywords)
      ? work.keywords.map((k) => (k as Record<string, unknown>).display_name).filter((k): k is string => typeof k === "string")
      : [];
    const topic = cleanText((work.primary_topic as Record<string, unknown> | null | undefined)?.display_name, 120);
    const abstract = openAlexAbstract(work.abstract_inverted_index);
    return [
      {
        title,
        url,
        summary: abstract ?? (venue ? `${venue} 게재 논문` : null),
        author: first ? (authorships.length > 1 ? `${first} 외 ${authorships.length - 1}명` : first) : null,
        publishedAt: toIsoDate(work.publication_date),
        contentType: "paper",
        popularity: metrics({ citations: work.cited_by_count }),
        tags: [...(topic ? [topic] : []), ...keywords].slice(0, 10),
        language: lang(work.language),
      } satisfies CollectedItem,
    ];
  });
}
