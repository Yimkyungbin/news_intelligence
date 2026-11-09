import { Check, Minus, Power, Trash2 } from "lucide-react";
import { ActionButton, ConfirmButton } from "@/components/confirm-button";
import { AddFeedForm, CollectNowButton } from "./collect-forms";
import { deleteUserFeed, setUserFeedActive } from "./collect-actions";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasAdminKey } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";
import { SourceBadge } from "@/components/sources/source-badge";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { DangerZone, ProfileForm } from "./settings-forms";
import { AI_MODELS } from "@/lib/types";
import type { DataSource, PermissionStatus } from "@/lib/types";

export const metadata = { title: "Settings" };
// "지금 수집" Server Action 실행 시간 상한
export const maxDuration = 300;

const PERMISSION_VARIANT: Record<PermissionStatus, "success" | "warning" | "destructive" | "outline"> = {
  AVAILABLE: "success",
  CONDITIONAL: "warning",
  UNAVAILABLE: "destructive",
  NOT_VERIFIED: "outline",
};
const LOG_LABEL: Record<string, string> = { running: "진행 중", success: "성공", partial: "일부 성공", failed: "실패" };
const LOG_VARIANT: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  running: "outline",
  success: "success",
  partial: "warning",
  failed: "destructive",
};
const CONNECTION_LABEL: Record<string, string> = {
  connected: "연결됨",
  not_configured: "미설정",
  disconnected: "연결 해제",
  error: "오류",
  disabled: "비활성",
};

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={on ? "text-success" : "text-muted-foreground"} title={`${label}: ${on ? "허용" : "미허용"}`}>
      {on ? <Check className="inline h-3.5 w-3.5" aria-hidden="true" /> : <Minus className="inline h-3.5 w-3.5" aria-hidden="true" />}
      <span className="sr-only">{on ? "허용" : "미허용"}</span>
    </span>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: allSources }, { data: logs }] = await Promise.all([
    supabase.from("profiles").select("name,email,language,timezone,briefing_time,ai_model,notify_email").eq("id", user.id).single(),
    supabase.from("data_sources").select("*").order("source_type").order("name"),
    supabase
      .from("collection_logs")
      .select("id,started_at,completed_at,status,collected_count,attempt,error_message,user_id,source:data_sources(name,source_type,logo_key,homepage_url,brand_color)")
      .eq("job_type", "collect")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);
  const sources = ((allSources ?? []) as DataSource[]).filter((s) => s.user_id === null);
  const myFeeds = ((allSources ?? []) as DataSource[]).filter((s) => s.user_id === user.id);
  type LogRow = {
    id: string;
    started_at: string;
    completed_at: string | null;
    status: string;
    collected_count: number;
    attempt: number;
    error_message: string | null;
    user_id: string | null;
    source: Pick<DataSource, "name" | "source_type" | "logo_key" | "homepage_url" | "brand_color"> | null;
  };
  const logRows = (logs ?? []) as unknown as LogRow[];

  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);

  return (
    <>
      <PageHeader title="Settings" description="프로필, 데이터 소스, AI, 개인정보 설정" />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>사용자 프로필 · 환경</CardTitle>
          </CardHeader>
          <CardContent>{profile ? <ProfileForm profile={profile} models={AI_MODELS} /> : null}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>데이터 소스 관리</CardTitle>
            <CardDescription>
              수집처별 로고·권한 상태·허용 처리 범위. 상태 기준은 docs/api-feasibility-matrix.md (AVAILABLE / CONDITIONAL / UNAVAILABLE / NOT_VERIFIED)
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2 font-medium">소스</th>
                  <th className="py-2 pr-2 font-medium">권한 상태</th>
                  <th className="py-2 pr-2 font-medium">연결</th>
                  <th className="py-2 pr-2 text-center font-medium">저장</th>
                  <th className="py-2 pr-2 text-center font-medium">표시</th>
                  <th className="py-2 pr-2 text-center font-medium">AI 처리</th>
                  <th className="py-2 pr-2 text-center font-medium">외부 LLM</th>
                  <th className="py-2 pr-2 font-medium">보관</th>
                  <th className="py-2 font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-b align-top last:border-0">
                    <td className="py-2 pr-2">
                      <SourceBadge
                        name={s.name}
                        sourceType={s.source_type}
                        logoKey={s.logo_key}
                        homepageUrl={s.homepage_url}
                        brandColor={s.brand_color}
                        size="md"
                      />
                      {s.last_collected_at ? <p className="mt-0.5 text-[11px] text-muted-foreground">마지막 수집 {formatDateTime(s.last_collected_at)}</p> : null}
                    </td>
                    <td className="py-2 pr-2">
                      <Badge variant={PERMISSION_VARIANT[s.permission_status]}>{s.permission_status}</Badge>
                    </td>
                    <td className="py-2 pr-2">{CONNECTION_LABEL[s.connection_status] ?? s.connection_status}</td>
                    <td className="py-2 pr-2 text-center"><Flag on={s.storage_allowed} label="저장" /></td>
                    <td className="py-2 pr-2 text-center"><Flag on={s.display_allowed} label="표시" /></td>
                    <td className="py-2 pr-2 text-center"><Flag on={s.ai_processing_allowed} label="AI 처리" /></td>
                    <td className="py-2 pr-2 text-center"><Flag on={s.external_llm_allowed} label="외부 LLM" /></td>
                    <td className="py-2 pr-2 whitespace-nowrap">{s.retention_days ? `${s.retention_days}일` : "-"}</td>
                    <td className="max-w-72 py-2 text-muted-foreground">
                      {s.policy_note}
                      {s.terms_url ? (
                        <>
                          {" "}
                          <a href={s.terms_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            약관
                          </a>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>콘텐츠 수집</CardTitle>
              <CardDescription>매일 06:00 KST 자동 수집 · 수동 수집은 10분에 한 번 · 관심 주제와 일치하는 콘텐츠만 저장</CardDescription>
            </div>
            <CollectNowButton />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {logRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">수집 이력이 없습니다.</p>
            ) : (
              <table className="w-full min-w-[640px] text-left text-xs" aria-label="최근 수집 이력">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-2 font-medium">소스</th>
                    <th className="py-2 pr-2 font-medium">시작</th>
                    <th className="py-2 pr-2 font-medium">상태</th>
                    <th className="py-2 pr-2 text-right font-medium">저장</th>
                    <th className="py-2 pr-2 font-medium">실행</th>
                    <th className="py-2 font-medium">오류</th>
                  </tr>
                </thead>
                <tbody>
                  {logRows.map((l) => (
                    <tr key={l.id} className="border-b align-top last:border-0">
                      <td className="py-2 pr-2">
                        {l.source ? (
                          <SourceBadge
                            name={l.source.name}
                            sourceType={l.source.source_type}
                            logoKey={l.source.logo_key}
                            homepageUrl={l.source.homepage_url}
                            brandColor={l.source.brand_color}
                            size="xs"
                            showType={false}
                          />
                        ) : (
                          "삭제된 소스"
                        )}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">{formatDateTime(l.started_at)}</td>
                      <td className="py-2 pr-2">
                        <Badge variant={LOG_VARIANT[l.status] ?? "outline"}>{LOG_LABEL[l.status] ?? l.status}</Badge>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{l.collected_count}</td>
                      <td className="py-2 pr-2 whitespace-nowrap text-muted-foreground">
                        {l.user_id ? "수동" : "자동"}
                        {l.attempt > 1 ? ` · ${l.attempt}회 시도` : ""}
                      </td>
                      <td className="max-w-72 py-2 text-muted-foreground">{l.error_message ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>내 RSS 피드</CardTitle>
            <CardDescription>인플루언서 개인 블로그·뉴스레터 피드를 추가합니다. AI 처리는 기본 차단되며 콘텐츠는 본인에게만 저장됩니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <AddFeedForm />
            {myFeeds.length ? (
              <ul className="flex flex-col divide-y rounded-md border" aria-label="내 RSS 피드 목록">
                {myFeeds.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <SourceBadge name={f.name} sourceType={f.source_type} homepageUrl={f.homepage_url} size="sm" showType={false} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{f.source_url}</span>
                    <Badge variant={f.is_active ? (f.connection_status === "error" ? "destructive" : "success") : "outline"}>
                      {f.is_active ? (f.connection_status === "error" ? "오류" : "수집 중") : "중지"}
                    </Badge>
                    <ActionButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={f.is_active ? `${f.name} 비활성화` : `${f.name} 활성화`}
                      title={f.is_active ? "비활성화" : "활성화"}
                      action={setUserFeedActive.bind(null, f.id, !f.is_active)}
                    >
                      <Power />
                    </ActionButton>
                    <ConfirmButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${f.name} 삭제`}
                      confirmText={`'${f.name}' 피드를 삭제할까요? 이미 수집된 콘텐츠는 유지됩니다.`}
                      action={deleteUserFeed.bind(null, f.id)}
                    >
                      <Trash2 className="text-destructive" />
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API 연결 상태</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>Supabase</span>
              <Badge variant="success">연결됨</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>OpenAI (Phase 3)</span>
              <Badge variant={openaiConfigured ? "success" : "outline"}>{openaiConfigured ? "키 설정됨" : "미설정"}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>LinkedIn API</span>
              <Badge variant="destructive">UNAVAILABLE</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>개인정보 및 데이터 삭제</CardTitle>
            <CardDescription>사용자·제3자 콘텐츠는 AI 모델 학습에 사용하지 않습니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <DangerZone canDeleteAccount={hasAdminKey()} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
