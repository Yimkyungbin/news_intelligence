import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runCollection } from "@/lib/collectors/pipeline";
import { refreshAllStats } from "@/lib/stats/service";
import { processSystemAI } from "@/lib/ai/system";

// 수집은 외부 요청이 많아 실행 시간 상한을 늘림
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron: 매일 21:00 UTC (06:00 KST) 전체 사용자 수집 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET 미설정" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runCollection({ trigger: "cron" });
    // 수집 후 일자별 통계(최근 3일) 갱신 + 2년 지난 통계 삭제
    const stats = await refreshAllStats();
    // 운영자가 허용한 출처의 번역·한 줄 시사점 생성 (하루 100회 한도)
    const ai = await processSystemAI({ skipMock: true });
    return NextResponse.json({ ok: true, ...summary, stats, ai: { processed: ai.processed, calls: ai.calls } });
  } catch (e) {
    console.error("[cron/collect] failed", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ ok: false, error: "수집 실행 실패" }, { status: 500 });
  }
}
