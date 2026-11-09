// RSS 2.0 / Atom 피드 파서
import { XMLParser } from "fast-xml-parser";
import { cleanText, normalizeUrl, toIsoDate } from "./text.ts";
import type { CollectedItem } from "./types.ts";

export const SUMMARY_MAX = 500;
const MAX_ITEMS = 50;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: false,
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => ["item", "entry", "link", "category", "author"].includes(name),
});

function textOf(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o["#text"] != null) return String(o["#text"]);
    if (o.name != null) return textOf(o.name);
  }
  return null;
}

function atomLink(links: unknown): string | null {
  if (!Array.isArray(links)) return textOf(links);
  const pick =
    links.find((l) => typeof l === "object" && l && ((l as Record<string, unknown>)["@_rel"] ?? "alternate") === "alternate") ??
    links[0];
  if (typeof pick === "string") return pick;
  return pick && typeof pick === "object" ? ((pick as Record<string, string>)["@_href"] ?? null) : null;
}

function categories(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => (typeof c === "object" && c ? ((c as Record<string, string>)["@_term"] ?? textOf(c)) : textOf(c)))
    .filter((c): c is string => Boolean(c))
    .map((c) => c.trim().slice(0, 60))
    .slice(0, 10);
}

/** 엔티티 확장 공격(billion laughs) 방지: DOCTYPE 내부 엔티티 선언이 있으면 거부 */
function assertSafeXml(xml: string) {
  if (/<!ENTITY/i.test(xml)) throw new Error("XML 엔티티 선언이 포함된 피드는 처리하지 않습니다.");
}

export function parseFeed(xml: string, opts: { contentType?: CollectedItem["contentType"] } = {}): CollectedItem[] {
  assertSafeXml(xml);
  const doc = parser.parse(xml) as Record<string, unknown>;
  const contentType = opts.contentType ?? "article";

  // RSS 2.0
  const channel = (doc.rss as Record<string, unknown> | undefined)?.channel as Record<string, unknown> | undefined;
  if (channel) {
    const base = textOf(channel.link) ?? undefined;
    const items = (channel.item as Record<string, unknown>[] | undefined) ?? [];
    return items.slice(0, MAX_ITEMS).flatMap((it) => {
      const title = cleanText(textOf(it.title), 500);
      const url = normalizeUrl(textOf(it.link) ?? textOf(it.guid), base);
      if (!title || !url) return [];
      return [
        {
          title,
          url,
          summary: cleanText(textOf(it.description) ?? textOf(it["content:encoded"]), SUMMARY_MAX),
          author: cleanText(textOf(it["dc:creator"]) ?? textOf(it.author), 200),
          publishedAt: toIsoDate(textOf(it.pubDate) ?? textOf(it["dc:date"])),
          contentType,
          popularity: {},
          tags: categories(it.category),
          language: null,
        } satisfies CollectedItem,
      ];
    });
  }

  // Atom
  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed) {
    const entries = (feed.entry as Record<string, unknown>[] | undefined) ?? [];
    return entries.slice(0, MAX_ITEMS).flatMap((e) => {
      const title = cleanText(textOf(e.title), 500);
      const url = normalizeUrl(atomLink(e.link) ?? textOf(e.id));
      if (!title || !url) return [];
      return [
        {
          title,
          url,
          summary: cleanText(textOf(e.summary) ?? textOf(e.content), SUMMARY_MAX),
          author: cleanText(textOf(e.author), 200),
          publishedAt: toIsoDate(textOf(e.published) ?? textOf(e.updated)),
          contentType,
          popularity: {},
          tags: categories(e.category),
          language: null,
        } satisfies CollectedItem,
      ];
    });
  }

  throw new Error("RSS 또는 Atom 형식이 아닙니다.");
}
