import { Sparkles } from "lucide-react";
import { BRAND } from "@/lib/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-semibold">
            {BRAND.name} <span className="text-sm font-normal text-muted-foreground">{BRAND.nameKo}</span>
          </h1>
          <p className="text-xs text-muted-foreground">{BRAND.tagline}</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">{children}</div>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          LinkedIn과 제휴하거나 LinkedIn이 보증하는 서비스가 아닙니다.
        </p>
      </div>
    </main>
  );
}
