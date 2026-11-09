import { Check, Minus } from "lucide-react";
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

const PERMISSION_VARIANT: Record<PermissionStatus, "success" | "warning" | "destructive" | "outline"> = {
  AVAILABLE: "success",
  CONDITIONAL: "warning",
  UNAVAILABLE: "destructive",
  NOT_VERIFIED: "outline",
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
  const [{ data: profile }, { data: sources }] = await Promise.all([
    supabase.from("profiles").select("name,email,language,timezone,briefing_time,ai_model,notify_email").eq("id", user.id).single(),
    supabase.from("data_sources").select("*").order("source_type").order("name"),
  ]);

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
                {((sources ?? []) as DataSource[]).map((s) => (
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
