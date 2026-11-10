import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BriefingContent } from "@/lib/briefing/compose";
import { BriefingFull } from "@/components/briefing/briefing-view";
import { GenerateBriefingButton } from "@/components/briefing/ai-buttons";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Daily Briefing" };
export const maxDuration = 300;

const LOG_LABEL: Record<string, string> = { running: "진행 중", success: "성공", partial: "일부 성공", failed: "실패" };
const LOG_VARIANT: Record<string, "success" | "warning" | "destructive" | "outline"> = { running: "outline", success: "success", partial: "warning", failed: "destructive" };

export default async function BriefingPage({ searchParams }: PageProps<"/briefing">) {
  const sp = await searchParams;
  const dateParam = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && z.iso.date().safeParse(sp.date).success ? sp.date : null;
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: list }, { data: logs }] = await Promise.all([
    supabase.from("daily_briefings").select("briefing_date,generated_at,is_demo,model_name,content").eq("user_id", user.id).order("briefing_date", { ascending: false }).limit(14),
    supabase
      .from("collection_logs")
      .select("id,started_at,status,attempt,error_message,details")
      .eq("user_id", user.id)
      .eq("job_type", "briefing")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);
  const briefings = list ?? [];
  const current = (dateParam ? briefings.find((b) => b.briefing_date === dateParam) : briefings[0]) ?? null;

  return (
    <>
      <Link href="/" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Dashboard
      </Link>
      <PageHeader
        title="Daily Briefing"
        description="매일 07:00 KST에 최근 24시간 콘텐츠를 정리합니다. 1~4, 6번은 집계 결과이고 5번만 AI 처리가 허용된 콘텐츠로 AI가 생성합니다."
        actions={<GenerateBriefingButton />}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {current ? `${formatDate(current.briefing_date)} 브리핑` : "브리핑"}
              {current?.is_demo ? <Badge variant="demo">DEMO</Badge> : null}
            </CardTitle>
            {current ? <CardDescription>생성 {formatDateTime(current.generated_at)}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            {current ? (
              <BriefingFull b={current.content as BriefingContent} />
            ) : (
              <EmptyState title="생성된 브리핑이 없습니다" description="'지금 생성'을 누르거나 다음 자동 생성(07:00 KST)을 기다려 주세요." />
            )}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>지난 브리핑</CardTitle>
            </CardHeader>
            <CardContent>
              {briefings.length === 0 ? (
                <p className="text-xs text-muted-foreground">없음</p>
              ) : (
                <ul className="flex flex-col gap-0.5 text-sm" aria-label="지난 브리핑 목록">
                  {briefings.map((b) => (
                    <li key={b.briefing_date}>
                      <Link
                        href={`/briefing?date=${b.briefing_date}`}
                        aria-current={current?.briefing_date === b.briefing_date ? "page" : undefined}
                        className={cn("block rounded-md px-2 py-1 hover:bg-accent", current?.briefing_date === b.briefing_date && "bg-accent font-medium")}
                      >
                        {formatDate(b.briefing_date)}
                        {b.is_demo ? <span className="ml-1 text-[11px] text-amber-600">DEMO</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>실행 이력</CardTitle>
              <CardDescription>실패 시 최대 3회 재시도</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1.5 text-xs" aria-label="브리핑 실행 이력">
                {(logs ?? []).map((l) => (
                  <li key={l.id} className="flex flex-col">
                    <span className="flex items-center justify-between gap-2">
                      <span>{formatDateTime(l.started_at)}</span>
                      <Badge variant={LOG_VARIANT[l.status] ?? "outline"}>{LOG_LABEL[l.status] ?? l.status}</Badge>
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {(l.details as { trigger?: string })?.trigger === "cron" ? "자동" : "수동"}
                      {l.attempt > 1 ? ` · ${l.attempt}회 시도` : ""}
                      {l.error_message ? ` · ${l.error_message}` : ""}
                    </span>
                  </li>
                ))}
                {(logs ?? []).length === 0 ? <li className="text-muted-foreground">없음</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
