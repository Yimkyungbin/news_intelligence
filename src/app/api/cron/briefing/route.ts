import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runBriefingCron } from "@/lib/briefing/service";

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron: 매일 22:00 UTC (07:00 KST) 전체 사용자 Daily Briefing */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "CRON_SECRET 미설정" }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runBriefingCron()) });
  } catch (e) {
    console.error("[cron/briefing] failed", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ ok: false, error: "브리핑 실행 실패" }, { status: 500 });
  }
}
