import { redirect } from "next/navigation";
import { getPublicEnv } from "@/lib/env";

export const metadata = { title: "초기 설정 필요" };
// 환경변수 설정 여부를 요청 시점에 판단
export const dynamic = "force-dynamic";

/** Supabase 환경변수 미설정 시 표시되는 안내 화면 (비밀값은 표시하지 않음) */
export default function SetupPage() {
  if (getPublicEnv().configured) redirect("/");
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">Supabase 연결 설정이 필요합니다</h1>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Supabase 프로젝트를 생성합니다.</li>
        <li>
          <code>supabase/migrations</code> 의 SQL을 적용합니다.
        </li>
        <li>
          <code>.env.example</code> 을 참고해 <code>.env.local</code>(로컬) 또는 Vercel 환경변수를 설정합니다.
        </li>
        <li>서버를 재시작합니다.</li>
      </ol>
      <p className="mt-6 text-xs text-muted-foreground">자세한 내용은 README.md 를 참고하세요.</p>
    </main>
  );
}
