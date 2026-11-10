"use client";

import { useActionState } from "react";
import { deleteAccount, deleteMyContent, updateProfile } from "./actions";
import { Field, Input, Select, Switch } from "@/components/ui/primitives";
import { FormMessage, SubmitButton, useActionToast } from "@/components/forms";
import { ConfirmButton } from "@/components/confirm-button";

type Profile = {
  name: string | null;
  email: string;
  language: string;
  timezone: string;
  briefing_time: string;
  ai_model: string;
  notify_email: boolean;
};

export function ProfileForm({ profile, models }: { profile: Profile; models: { value: string; label: string }[] }) {
  const [state, action] = useActionState(updateProfile, null);
  useActionToast(state);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <Field label="이름" htmlFor="s-name">
        <Input id="s-name" name="name" required maxLength={60} defaultValue={profile.name ?? ""} />
      </Field>
      <Field label="이메일" htmlFor="s-email" hint="이메일 변경은 지원하지 않습니다.">
        <Input id="s-email" value={profile.email} disabled readOnly />
      </Field>
      <Field label="언어" htmlFor="s-lang">
        <Select id="s-lang" name="language" defaultValue={profile.language}>
          <option value="ko">한국어</option>
          <option value="en">English</option>
        </Select>
      </Field>
      <Field label="시간대" htmlFor="s-tz">
        <Select id="s-tz" name="timezone" defaultValue={profile.timezone}>
          {["Asia/Seoul", "UTC", "America/Los_Angeles", "America/New_York", "Europe/London"].map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Daily Briefing 시간" htmlFor="s-bt" hint="현재 자동 생성은 모든 사용자 07:00 KST 고정 (사용자별 시간은 시간 단위 Cron 지원 후 적용)">
        <Input id="s-bt" name="briefing_time" type="time" required defaultValue={profile.briefing_time.slice(0, 5)} />
      </Field>
      <Field label="AI 모델" htmlFor="s-model" hint="AI 요약·주제 인사이트·브리핑에 사용 (OpenAI 키가 없으면 로컬은 DEMO 모의 AI)">
        <Select id="s-model" name="ai_model" defaultValue={profile.ai_model}>
          {models.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-center justify-between md:col-span-2">
        <Switch id="s-notify" name="notify_email" defaultChecked={profile.notify_email} label="이메일 알림 (Phase 4)" />
        <SubmitButton size="sm" pendingText="저장 중...">
          저장
        </SubmitButton>
      </div>
    </form>
  );
}

export function DangerZone({ canDeleteAccount }: { canDeleteAccount: boolean }) {
  const [state, action] = useActionState(deleteAccount, null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">콘텐츠 데이터 삭제</p>
          <p className="text-xs text-muted-foreground">수집·입력 콘텐츠, 저장 목록, 브리핑을 삭제합니다. 주제와 인물은 유지됩니다.</p>
        </div>
        <ConfirmButton variant="outline" size="sm" confirmText="모든 콘텐츠 데이터를 삭제할까요? 되돌릴 수 없습니다." action={deleteMyContent}>
          콘텐츠 삭제
        </ConfirmButton>
      </div>
      <form action={action} className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
        <p className="text-sm font-medium text-destructive">계정 삭제</p>
        <p className="text-xs text-muted-foreground">계정과 모든 데이터(주제, 인물, 콘텐츠, 저장, 브리핑)를 영구 삭제합니다.</p>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="del-confirm" className="sr-only">
            확인 문구
          </label>
          <Input id="del-confirm" name="confirm" placeholder="DELETE 입력" className="max-w-40" autoComplete="off" disabled={!canDeleteAccount} />
          <SubmitButton variant="destructive" size="sm" disabled={!canDeleteAccount} pendingText="삭제 중...">
            계정 영구 삭제
          </SubmitButton>
        </div>
        {!canDeleteAccount ? <p className="text-[11px] text-muted-foreground">서버에 SUPABASE_SERVICE_ROLE_KEY 설정 후 사용할 수 있습니다.</p> : null}
        <FormMessage state={state} />
      </form>
    </div>
  );
}
