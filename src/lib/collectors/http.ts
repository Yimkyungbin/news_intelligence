// 외부 요청 안전 계층: 타임아웃, 응답 크기 제한, User-Agent, (신뢰하지 않는 URL) SSRF 차단
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicAddress } from "./net.ts";

export const USER_AGENT = "LinkedInIntelligenceHub/0.2 (+https://github.com/Yimkyungbin/news_intelligence)";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export type SafeFetchOptions = {
  /** 사용자 입력 URL: https 강제 + 내부 주소 차단 */
  untrusted?: boolean;
  accept?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
};

/** 로그·오류 메시지용: 쿼리·인증정보를 제외한 호스트+경로 */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(invalid url)";
  }
}

async function assertAllowed(url: URL, untrusted: boolean) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchError("허용되지 않는 URL 스킴입니다.", null, false);
  if (!untrusted) return;
  if (url.protocol !== "https:") throw new FetchError("https URL만 허용됩니다.", null, false);
  if (url.username || url.password) throw new FetchError("인증 정보가 포함된 URL은 허용되지 않습니다.", null, false);
  if (url.port && url.port !== "443") throw new FetchError("기본 포트(443)만 허용됩니다.", null, false);

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new FetchError("호스트를 찾을 수 없습니다.", null, false);
  if (!addresses.every(isPublicAddress)) throw new FetchError("허용되지 않는 주소입니다 (내부 네트워크).", null, false);
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new FetchError("응답이 너무 큽니다.", res.status, false);
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchError("응답이 너무 큽니다.", res.status, false);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(buf);
}

/**
 * 안전한 GET 요청. 리다이렉트는 수동으로 따라가며 매번 주소를 재검사한다.
 * 한계: DNS 검사와 실제 연결 사이의 재해석(DNS rebinding)은 완전히 막지 못한다.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<{ status: number; text: string; url: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FetchError("올바른 URL이 아닙니다.", null, false);
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertAllowed(url, Boolean(opts.untrusted));
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, Accept: opts.accept ?? "*/*", ...opts.headers },
        cache: "no-store",
      });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new FetchError(timeout ? "요청 시간이 초과되었습니다." : "네트워크 오류가 발생했습니다.", null, true);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new FetchError("리다이렉트 위치가 없습니다.", res.status, false);
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      throw new FetchError(`HTTP ${res.status}`, res.status, retryable);
    }
    return { status: res.status, text: await readLimited(res, opts.maxBytes ?? DEFAULT_MAX_BYTES), url: url.toString() };
  }
  throw new FetchError("리다이렉트가 너무 많습니다.", null, false);
}

export async function fetchJson(url: string, opts: SafeFetchOptions = {}): Promise<unknown> {
  const { text } = await safeFetch(url, { accept: "application/json", ...opts });
  try {
    return JSON.parse(text);
  } catch {
    throw new FetchError("JSON 응답을 해석할 수 없습니다.", null, false);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 재시도 가능한 오류만 최대 retries 회 재시도 (지수 백오프 1s, 3s) */
export async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseMs = 1000): Promise<{ value: T; attempts: number }> {
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return { value: await fn(), attempts: attempt };
    } catch (e) {
      const retryable = e instanceof FetchError ? e.retryable : false;
      if (!retryable || attempt > retries) throw Object.assign(e as Error, { attempts: attempt });
      await sleep(baseMs * (attempt === 1 ? 1 : 3));
    }
  }
}

/** 동시 실행 수 제한 map */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
