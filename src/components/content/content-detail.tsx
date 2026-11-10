"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, Minus, X } from "lucide-react";
import { getContentDetail, type ContentDetail } from "@/app/(app)/content/actions";
import { SourceBadge } from "@/components/sources/source-badge";
import { Badge } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { SaveButton } from "./save-button";
import { ContentAISection } from "./content-ai";
import { METRIC_HELP, popularityEntries } from "@/lib/content";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

type Ctx = { open: (contentId: string) => void };
const DetailContext = createContext<Ctx | null>(null);

const LANGUAGE: Record<string, string> = { ko: "한국어", en: "영어" };
const CONTENT_TYPE: Record<string, string> = {
  article: "아티클",
  post: "게시글",
  paper: "논문",
  repository: "저장소",
  model: "모델",
  discussion: "토론",
  video: "영상",
  other: "기타",
};
const PERMISSION_VARIANT = { AVAILABLE: "success", CONDITIONAL: "warning", UNAVAILABLE: "destructive", NOT_VERIFIED: "outline" } as const;
const PERMISSION_HELP: Record<string, string> = {
  AVAILABLE: "이용 조건이 검증되었습니다.",
  CONDITIONAL: "추가 승인이나 조건 확인이 필요합니다.",
  UNAVAILABLE: "현재 사용할 수 없는 출처입니다.",
  NOT_VERIFIED: "출처 약관을 아직 검증하지 않았습니다. 제목·링크·짧은 요약만 저장·표시합니다.",
};

function summaryLabel(d: ContentDetail) {
  if (d.provenance === "demo") return "요약 (DEMO 예시)";
  if (d.provenance === "user_provided") return "요약 (직접 작성)";
  return "요약 (출처 제공 원문 일부)";
}

function PermissionRow({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span>{label}</span>
      <span className={on ? "inline-flex items-center gap-1 text-success" : "inline-flex items-center gap-1 text-muted-foreground"}>
        {on ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}
        {on ? "허용" : "미허용"}
      </span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function DetailBody({ d, onNavigate, onRefresh }: { d: ContentDetail; onNavigate: () => void; onRefresh: () => void }) {
  const metrics = popularityEntries(d.popularity);
  const authorMeta = [d.author_title, d.author_company].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SourceBadge
          name={d.source_name}
          sourceType={d.source_type}
          logoKey={d.source?.logo_key}
          url={d.original_url}
          homepageUrl={d.source?.homepage_url}
          brandColor={d.source?.brand_color}
          provenance={d.provenance}
          size="md"
        />
        <h2 id="content-detail-title" className="text-lg font-semibold leading-snug">
          {d.title}
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {d.author ? (
            <>
              <dt className="text-muted-foreground">작성자</dt>
              <dd>
                {d.author}
                {authorMeta ? <span className="text-muted-foreground"> ({authorMeta})</span> : null}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">게시일</dt>
          <dd>{d.published_at ? formatDateTime(d.published_at) : "출처 미제공"}</dd>
          <dt className="text-muted-foreground">수집일</dt>
          <dd>{formatDateTime(d.collected_at)}</dd>
          <dt className="text-muted-foreground">유형·언어</dt>
          <dd>
            {CONTENT_TYPE[d.content_type] ?? d.content_type} · {LANGUAGE[d.language] ?? d.language}
          </dd>
        </dl>
        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href={d.original_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <ExternalLink aria-hidden="true" /> 원문 열기
          </a>
          <span className="inline-flex items-center gap-1 rounded-md border px-1 text-xs">
            <SaveButton contentId={d.id} saved={d.saved !== null} />
            <span className="pr-1.5">{d.saved ? "저장됨" : "저장"}</span>
          </span>
        </div>
      </div>

      <Section title={summaryLabel(d)}>
        {d.summary ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{d.summary}</p>
        ) : (
          <p className="text-sm text-muted-foreground">출처가 요약을 제공하지 않았습니다. 원문에서 내용을 확인하세요.</p>
        )}
      </Section>

      {d.ai_meta && (d.ai_meta.title_ko || d.ai_meta.summary_ko || d.ai_meta.implication_ko) ? (
        <Section title={`한국어 번역·시사점 (AI${d.ai_meta.is_demo ? " · DEMO" : ""})`}>
          <div className="flex flex-col gap-1.5 rounded-md border bg-amber-500/5 p-3 text-sm">
            {d.ai_meta.title_ko ? <p className="font-medium">{d.ai_meta.title_ko}</p> : null}
            {d.ai_meta.summary_ko ? <p className="leading-relaxed text-muted-foreground">{d.ai_meta.summary_ko}</p> : null}
            {d.ai_meta.implication_ko ? (
              <p>
                <span className="font-semibold">시사점</span> {d.ai_meta.implication_ko}
              </p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">{d.ai_meta.model_name} · 운영자가 허용한 출처의 제목·요약만 AI로 처리했습니다.</p>
          </div>
        </Section>
      ) : null}

      <ContentAISection d={d} onChanged={onRefresh} />

      {metrics.length ? (
        <Section title="인기 지표 (출처 제공)">
          <ul className="flex flex-col gap-1 text-sm">
            {metrics.map((m) => (
              <li key={m.key} className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">{METRIC_HELP[m.key] ?? m.label}</span>
                <span className="font-medium tabular-nums">
                  {m.value.toLocaleString("ko-KR")} {m.label}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="연결된 관심 주제">
        {d.topics.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {d.topics.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <Link href={`/topics/${t.id}`} onClick={onNavigate} className="hover:text-primary hover:underline">
                  {t.name}
                </Link>
                <span className="text-xs tabular-nums text-muted-foreground" title="일치한 키워드 비율">
                  관련도 {Math.round(t.relevance * 100)}%
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">연결된 주제가 없습니다.</p>
        )}
      </Section>

      {d.keywords.length ? (
        <Section title="키워드">
          <div className="flex flex-wrap gap-1">
            {d.keywords.map((k) => (
              <Link
                key={k}
                href={`/trending?period=monthly&limit=50&kw=${encodeURIComponent(k)}`}
                onClick={onNavigate}
                className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] hover:bg-accent"
              >
                #{k}
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {d.saved && (d.saved.notes || d.saved.tags.length) ? (
        <Section title="내 메모">
          {d.saved.notes ? <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-2 text-sm">{d.saved.notes}</p> : null}
          {d.saved.tags.length ? (
            <div className="flex flex-wrap gap-1">
              {d.saved.tags.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title="데이터 권한">
        <div className="flex items-start gap-2 text-xs">
          <Badge variant={PERMISSION_VARIANT[d.permission_status]}>{d.permission_status}</Badge>
          <span className="text-muted-foreground">{PERMISSION_HELP[d.permission_status]}</span>
        </div>
        <ul className="flex flex-col gap-1 rounded-md border p-2 text-xs">
          <PermissionRow label="저장" on={d.storage_allowed} />
          <PermissionRow label="화면 표시" on={d.display_allowed} />
          <PermissionRow label="AI 처리" on={d.ai_processing_allowed} />
          <PermissionRow label="외부 LLM 전송" on={d.external_llm_allowed} />
          <li className="flex items-center justify-between">
            <span>보관 기한</span>
            <span className="text-muted-foreground">{d.retention_until ? `${formatDate(d.retention_until)}까지` : "기한 없음 (직접 삭제 시까지)"}</span>
          </li>
        </ul>
        {d.source?.policy_note ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            출처 정책: {d.source.policy_note}
            {d.source.terms_url ? (
              <>
                {" "}
                <a href={d.source.terms_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  약관
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </Section>
    </div>
  );
}

/** 상세 보기 패널 제공자: (app) 레이아웃에 한 번 배치 */
export function ContentDetailProvider({ children }: { children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef(0);
  const [state, setState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; detail: ContentDetail }
  >({ status: "idle" });

  const close = useCallback(() => dialogRef.current?.close(), []);

  const load = useCallback((contentId: string, showLoading: boolean) => {
    const req = ++requestRef.current;
    if (showLoading) setState({ status: "loading" });
    getContentDetail(contentId)
      .then((res) => {
        if (req !== requestRef.current) return; // 더 최근 요청이 있으면 무시
        setState(res.ok ? { status: "ready", detail: res.detail } : { status: "error", message: res.message });
      })
      .catch(() => {
        if (req === requestRef.current) setState({ status: "error", message: "콘텐츠를 불러오지 못했습니다." });
      });
  }, []);

  const open = useCallback(
    (contentId: string) => {
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
      load(contentId, true);
    },
    [load],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      requestRef.current++;
      setState({ status: "idle" });
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  return (
    <DetailContext value={{ open }}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="content-detail-title"
        onClick={(e) => {
          // 배경(backdrop) 클릭 시 닫기
          if (e.target === dialogRef.current) close();
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-xl overflow-y-auto border-l bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-5 py-3 backdrop-blur">
          <span className="text-sm font-semibold">콘텐츠 상세</span>
          <button
            type="button"
            onClick={close}
            aria-label="상세 보기 닫기"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">
          {state.status === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> 불러오는 중...
            </p>
          ) : state.status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : state.status === "ready" ? (
            <DetailBody d={state.detail} onNavigate={close} onRefresh={() => load(state.detail.id, false)} />
          ) : null}
          {state.status !== "ready" ? (
            <h2 id="content-detail-title" className="sr-only">
              콘텐츠 상세
            </h2>
          ) : null}
        </div>
      </dialog>
    </DetailContext>
  );
}

/** 제목 등을 감싸 클릭 시 상세 보기 패널을 연다 */
export function OpenDetailButton({ contentId, children, className }: { contentId: string; children: React.ReactNode; className?: string }) {
  const ctx = useContext(DetailContext);
  if (!ctx) throw new Error("OpenDetailButton 은 ContentDetailProvider 안에서 사용해야 합니다.");
  return (
    <button type="button" onClick={() => ctx.open(contentId)} className={cn("cursor-pointer text-left", className)}>
      {children}
    </button>
  );
}
