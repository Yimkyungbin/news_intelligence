// 공개 API 응답 파서: Hacker News, GitHub, arXiv, Hugging Face
import { parseFeed, SUMMARY_MAX } from "./rss.ts";
import { cleanText, normalizeUrl, toIsoDate } from "./text.ts";
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
