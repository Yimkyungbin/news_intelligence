"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateContentSummary, setAIConsent } from "@/app/(app)/ai/actions";
import type { ContentDetail } from "@/app/(app)/content/actions";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

const INSIGHT_LABELS: [keyof NonNullable<ContentDetail["insight"]>["insights"], string][] = [
  ["core", "핵심 인사이트"],
  ["technical_meaning", "기술적 의미"],
  ["business_impact", "산업·비즈니스 영향"],
  ["practical_use", "실무 적용 가능성"],
  ["related_tech", "관련 기술과의 연관성"],
];

/** 상세 패널의 AI 요약·인사이트 영역 (요구사항 4.1, 4.2 / 3.4 권한) */
export function ContentAISection({ d, onChanged }: { d: ContentDetail; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [agree, setAgree] = useState(false);
  const consentable = d.provenance === "user_provided";
  const insight = d.insight;

  const run = (fn: () => Promise<{ ok: boolean; message?: string } | null>) =>
    start(async () => {
      const res = await fn();
      if (res?.ok) toast.success(res.message);
      else if (res) toast.error(res.message);
      onChanged();
    });

  return (
    <section className="flex flex-col gap-2" aria-labelledby="ai-section-title">
      <h3 id="ai-section-title" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI 요약·인사이트
        {insight?.is_demo ? <Badge variant="demo">DEMO 모의 AI</Badge> : null}
      </h3>

      {insight?.summary ? (
        <div className="flex flex-col gap-3 rounded-md border bg-primary/5 p-3 text-sm">
          <p className="whitespace-pre-wrap leading-relaxed">{insight.summary}</p>
          {insight.key_points.length ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">핵심 주장</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {insight.key_points.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {insight.insights.technologies?.length ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-semibold text-muted-foreground">주요 기술·개념</span>
              {insight.insights.technologies.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
          <dl className="flex flex-col gap-2">
            {INSIGHT_LABELS.map(([key, label]) =>
              insight.insights[key] ? (
                <div key={key}>
                  <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
                  <dd className="leading-relaxed">{insight.insights[key]}</dd>
                </div>
              ) : null,
            )}
          </dl>
          <p className="text-[11px] text-muted-foreground">
            {insight.model_name} · {formatDateTime(insight.processed_at)} · AI 생성 결과는 부정확할 수 있으니 원문을 확인하세요.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {d.ai_processing_allowed
            ? d.ai_processing_status === "failed"
              ? "이전 AI 처리에 실패했습니다. 다시 생성해 보세요."
              : "AI 처리가 허용된 콘텐츠입니다. 아직 요약이 생성되지 않았습니다."
            : consentable
              ? "직접 등록한 콘텐츠는 권리를 확인한 경우에만 AI로 처리합니다."
              : "이 콘텐츠는 출처의 AI 처리 권한이 확인되지 않아 AI 요약을 실행하지 않습니다. 외부 AI로 전송되지 않습니다."}
        </p>
      )}

      {d.ai_processing_allowed ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => generateContentSummary(d.id))}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {insight ? "AI 요약 다시 생성" : "AI 요약 생성"}
          </Button>
          {consentable ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setAIConsent(d.id, false))}>
              AI 처리 허용 철회
            </Button>
          ) : null}
        </div>
      ) : consentable ? (
        <div className="flex flex-col gap-2 rounded-md border p-3 text-xs">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[var(--primary)]" />
            <span>
              이 콘텐츠를 외부 AI(OpenAI)로 보내 요약할 권리가 있음을 확인했습니다. 제목과 직접 작성한 요약만 전송되며, AI 학습에 사용되지 않고 언제든 철회할 수 있습니다.
            </span>
          </label>
          <Button size="sm" className="self-start" disabled={!agree || pending} onClick={() => run(() => setAIConsent(d.id, true))}>
            AI 처리 허용
          </Button>
        </div>
      ) : null}
    </section>
  );
}
