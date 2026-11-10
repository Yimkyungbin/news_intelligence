import type { TopicInsight } from "@/lib/ai/schemas";
import { OpenDetailButton } from "@/components/content/content-detail";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { GenerateTopicInsightButton } from "./ai-buttons";
import { formatDateTime } from "@/lib/utils";

type Stored = TopicInsight & { refs?: { id: string; title: string }[]; excluded?: number };

const SECTIONS: [keyof TopicInsight, string][] = [
  ["recent_trends", "최근 주요 기술 동향"],
  ["new_technologies", "새롭게 등장한 기술·프레임워크"],
  ["company_moves", "주요 기업 동향"],
  ["expert_claims", "전문가들의 주요 주장"],
  ["common_issues", "공통적으로 언급되는 이슈"],
  ["watch_next", "향후 주목할 기술"],
];

/** 주제별 AI 인사이트 (요구사항 4.3 Topic Intelligence) */
export function TopicInsightCard({
  topicId,
  insight,
  allowedCount,
  totalCount,
}: {
  topicId: string;
  insight: { content: unknown; model_name: string; is_demo: boolean; generated_at: string } | null;
  allowedCount: number;
  totalCount: number;
}) {
  const c = insight?.content as Stored | undefined;
  const refs = c?.refs ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          AI 인사이트 {insight?.is_demo ? <Badge variant="demo">DEMO 모의 AI</Badge> : null}
        </CardTitle>
        <CardDescription>
          최근 14일 콘텐츠 중 AI 처리 허용 콘텐츠만 분석 · 현재 목록 {totalCount}건 중 허용 {allowedCount}건
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {c ? (
          <>
            <p className="leading-relaxed">{c.overview}</p>
            {SECTIONS.map(([key, label]) => {
              const points = c[key] as { point: string; content_refs: number[] }[];
              if (!Array.isArray(points) || points.length === 0) return null;
              return (
                <div key={key}>
                  <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{label}</p>
                  <ul className="flex flex-col gap-1">
                    {points.map((pt) => (
                      <li key={pt.point} className="text-xs leading-relaxed">
                        • {pt.point}
                        {pt.content_refs
                          .filter((n) => n >= 1 && n <= refs.length)
                          .map((n) => (
                            <OpenDetailButton key={n} contentId={refs[n - 1].id} className="ml-1 rounded bg-secondary px-1 text-[10px] hover:bg-accent">
                              [{n}]
                            </OpenDetailButton>
                          ))}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground">
              {insight?.model_name} · {insight ? formatDateTime(insight.generated_at) : ""} · 분석 {refs.length}건
              {c.excluded ? ` · AI 미허용 ${c.excluded}건 제외` : ""}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {allowedCount === 0
              ? "AI 처리가 허용된 콘텐츠가 없어 분석할 수 없습니다. 직접 등록한 콘텐츠의 상세 보기에서 AI 처리를 허용할 수 있습니다."
              : "아직 생성된 인사이트가 없습니다."}
          </p>
        )}
        <div className="self-start">
          <GenerateTopicInsightButton topicId={topicId} hasInsight={Boolean(c)} />
        </div>
      </CardContent>
    </Card>
  );
}
