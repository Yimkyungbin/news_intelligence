/**
 * 수집처(Source) 로고 레지스트리
 *
 * 로고 해석 우선순위
 *  1) logo_key 로 레지스트리 조회
 *  2) 원문 URL 호스트명으로 레지스트리 조회 (예: linkedin.com → linkedin)
 *  3) 등록되지 않은 도메인 → 해당 사이트 favicon (로드 실패 시 모노그램)
 *
 * 브랜드 아이콘은 simple-icons(CC0) 사용. 상표권은 각 소유자에게 있으며,
 * 출처 식별 목적으로만 표시한다. simple-icons 에서 제외된 브랜드(LinkedIn, OpenAI,
 * Microsoft, AWS)는 공식 로고를 복제하지 않고 브랜드 컬러 모노그램으로 표시한다.
 */
import {
  siAnthropic,
  siArstechnica,
  siArxiv,
  siBluesky,
  siDeepmind,
  siDevdotto,
  siGithub,
  siGoogle,
  siHuggingface,
  siKakao,
  siKaggle,
  siLobsters,
  siMastodon,
  siMedium,
  siMeta,
  siNaver,
  siNvidia,
  siReddit,
  siRss,
  siSubstack,
  siTechcrunch,
  siX,
  siYcombinator,
} from "simple-icons";

export type SourceLogo =
  | { kind: "icon"; path: string; color: string; label: string }
  | { kind: "monogram"; text: string; color: string; label: string }
  | { kind: "favicon"; url: string; text: string; color: string; label: string };

type RegistryEntry =
  | { kind: "icon"; icon: { path: string; hex: string }; label: string; color?: string }
  | { kind: "monogram"; text: string; color: string; label: string };

const icon = (i: { path: string; hex: string }, label: string, color?: string): RegistryEntry => ({
  kind: "icon",
  icon: i,
  label,
  color,
});
const mono = (text: string, color: string, label: string): RegistryEntry => ({
  kind: "monogram",
  text,
  color,
  label,
});

export const LOGO_REGISTRY: Record<string, RegistryEntry> = {
  linkedin: mono("in", "#0A66C2", "LinkedIn"),
  hackernews: icon(siYcombinator, "Hacker News"),
  github: icon(siGithub, "GitHub"),
  arxiv: icon(siArxiv, "arXiv"),
  huggingface: icon(siHuggingface, "Hugging Face"),
  reddit: icon(siReddit, "Reddit"),
  x: icon(siX, "X"),
  rss: icon(siRss, "RSS"),
  openai: mono("AI", "#10A37F", "OpenAI"),
  anthropic: icon(siAnthropic, "Anthropic"),
  google: icon(siGoogle, "Google"),
  deepmind: icon(siDeepmind, "Google DeepMind"),
  nvidia: icon(siNvidia, "NVIDIA"),
  meta: icon(siMeta, "Meta"),
  aws: mono("aws", "#FF9900", "AWS"),
  microsoft: mono("MS", "#0078D4", "Microsoft"),
  mastodon: icon(siMastodon, "Mastodon"),
  bluesky: icon(siBluesky, "Bluesky"),
  substack: icon(siSubstack, "Substack"),
  medium: icon(siMedium, "Medium"),
  devto: icon(siDevdotto, "dev.to"),
  kaggle: icon(siKaggle, "Kaggle"),
  openalex: mono("OA", "#C12D2E", "OpenAlex"),
  // 국내 IT 뉴스·커뮤니티
  geeknews: mono("GN", "#2E7D32", "GeekNews"),
  yozm: mono("요", "#5A2FE0", "요즘IT"),
  zdnet: mono("ZD", "#D32F2F", "ZDNet Korea"),
  etnews: mono("전", "#0B4EA2", "전자신문"),
  aitimes: mono("AI", "#1A237E", "AI타임스"),
  // 국내 기업 기술 블로그
  kakao: icon(siKakao, "카카오"),
  woowahan: mono("우", "#2AC1BC", "우아한형제들"),
  naver: icon(siNaver, "네이버"),
  toss: mono("T", "#0064FF", "토스"),
  daangn: mono("당", "#FF6F0F", "당근"),
  // 해외 IT 미디어
  techcrunch: icon(siTechcrunch, "TechCrunch"),
  theverge: mono("V", "#5200FF", "The Verge"),
  mittr: mono("TR", "#111111", "MIT Technology Review"),
  arstechnica: icon(siArstechnica, "Ars Technica"),
  // 뉴스레터·블로그·커뮤니티
  latentspace: mono("LS", "#7C3AED", "Latent Space"),
  simonw: mono("SW", "#334155", "Simon Willison"),
  lobsters: icon(siLobsters, "Lobsters"),
  user: mono("ME", "#64748B", "직접 입력"),
  demo: mono("DE", "#D97706", "DEMO DATA"),
};

/** 호스트명 → 레지스트리 키 (서브도메인 포함 접미사 매칭) */
const HOST_MAP: Array<[string, string]> = [
  ["linkedin.com", "linkedin"],
  ["lnkd.in", "linkedin"],
  ["news.ycombinator.com", "hackernews"],
  ["github.com", "github"],
  ["github.blog", "github"],
  ["arxiv.org", "arxiv"],
  ["huggingface.co", "huggingface"],
  ["reddit.com", "reddit"],
  ["redd.it", "reddit"],
  ["x.com", "x"],
  ["twitter.com", "x"],
  ["openai.com", "openai"],
  ["anthropic.com", "anthropic"],
  ["claude.com", "anthropic"],
  ["deepmind.google", "deepmind"],
  ["deepmind.com", "deepmind"],
  ["blog.google", "google"],
  ["research.google", "google"],
  ["google.com", "google"],
  ["nvidia.com", "nvidia"],
  ["meta.com", "meta"],
  ["fb.com", "meta"],
  ["aws.amazon.com", "aws"],
  ["amazon.science", "aws"],
  ["microsoft.com", "microsoft"],
  ["mastodon.social", "mastodon"],
  ["bsky.app", "bluesky"],
  ["substack.com", "substack"],
  ["medium.com", "medium"],
  ["dev.to", "devto"],
  ["kaggle.com", "kaggle"],
  ["openalex.org", "openalex"],
  ["news.hada.io", "geeknews"],
  ["yozm.wishket.com", "yozm"],
  ["zdnet.co.kr", "zdnet"],
  ["etnews.com", "etnews"],
  ["aitimes.com", "aitimes"],
  ["kakao.com", "kakao"],
  ["techblog.woowahan.com", "woowahan"],
  ["naver.com", "naver"],
  ["toss.tech", "toss"],
  ["techcrunch.com", "techcrunch"],
  ["theverge.com", "theverge"],
  ["technologyreview.com", "mittr"],
  ["arstechnica.com", "arstechnica"],
  ["latent.space", "latentspace"],
  ["simonwillison.net", "simonw"],
  ["lobste.rs", "lobsters"],
];

export function logoKeyForHost(host: string | null): string | null {
  if (!host) return null;
  for (const [suffix, key] of HOST_MAP) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return key;
  }
  return null;
}

function fromEntry(e: RegistryEntry): SourceLogo {
  if (e.kind === "icon") {
    return { kind: "icon", path: e.icon.path, color: e.color ?? `#${e.icon.hex}`, label: e.label };
  }
  return { kind: "monogram", text: e.text, color: e.color, label: e.label };
}

/** 이름 기반 모노그램용 결정적 색상 */
function hashColor(seed: string) {
  const palette = ["#2563EB", "#7C3AED", "#DB2777", "#059669", "#D97706", "#0891B2", "#4F46E5", "#DC2626"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function initials(name: string) {
  const words = name.replace(/^www\./, "").split(/[\s.\-_/]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function safeHost(url: string | null | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * 콘텐츠/소스 정보로 표시할 로고를 결정한다.
 * - provenance 가 demo 이면 항상 DEMO 로고
 * - user_provided 인 경우 원문 URL 도메인 로고를 우선 (예: LinkedIn 게시글 링크 → LinkedIn)
 */
export function resolveSourceLogo(input: {
  logoKey?: string | null;
  url?: string | null;
  homepageUrl?: string | null;
  name: string;
  brandColor?: string | null;
  isDemo?: boolean;
}): SourceLogo {
  if (input.isDemo) return fromEntry(LOGO_REGISTRY.demo);

  const host = safeHost(input.url) ?? safeHost(input.homepageUrl);
  const keyFromHost = logoKeyForHost(host);
  const preferHost = input.logoKey === "user" || !input.logoKey;
  const key = preferHost ? (keyFromHost ?? input.logoKey) : input.logoKey;

  if (key && LOGO_REGISTRY[key]) return fromEntry(LOGO_REGISTRY[key]);

  const label = input.name || host || "Unknown";
  const color = input.brandColor ?? hashColor(host ?? label);
  if (host) {
    return {
      kind: "favicon",
      url: `https://${host}/favicon.ico`,
      text: initials(host),
      color,
      label: host,
    };
  }
  return { kind: "monogram", text: initials(label), color, label };
}
