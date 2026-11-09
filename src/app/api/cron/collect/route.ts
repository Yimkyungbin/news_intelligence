import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runCollection } from "@/lib/collectors/pipeline";

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
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[cron/collect] failed", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ ok: false, error: "수집 실행 실패" }, { status: 500 });
  }
}
