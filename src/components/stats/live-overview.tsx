import Link from "next/link";
import { Brain, FileText, Hash, Sparkles, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { countContent, listContent } from "@/lib/queries";
import { dailyBuckets, topKeywords } from "@/lib/content";
import { daysAgoIso, startOfTodayKstIso } from "@/lib/utils";
import { CollectionChart } from "@/components/dashboard/collection-chart";
import { SourceBadge } from "@/components/sources/source-badge";
import { InfoTip } from "@/components/info-tip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import type { ContentItem } from "@/lib/types";

/* 메인에서 옮겨 온 실시간 요약 지표 (항목 설명은 InfoTip) */
const HELP = {
  total: ["내 계정에 저장된 모든 콘텐츠 수입니다.", "자동 수집과 URL 직접 등록 콘텐츠를 모두 포함합니다. 끈 소스는 제외합니다."],
  today: ["오늘(KST 00:00 이후) 새로 수집되거나 등록된 콘텐츠 수입니다.", "게시일이 아니라 이 서비스에 들어온 시각 기준입니다."],
  topics: ["최근 7일 콘텐츠가 관심 주제에 연결된 횟수의 합입니다.", "한 콘텐츠가 여러 주제와 일치하면 주제마다 셉니다."],
  following: ["My Following에 등록한 인물의 최근 7일 콘텐츠 링크 수입니다.", "LinkedIn에서 자동으로 가져오지 않습니다."],
  intelligence: [
    "최근 7일 콘텐츠에 가장 많이 등장한 키워드 순위입니다. 콘텐츠 하나당 한 번만 셉니다.",
    "키워드는 관심 주제와 일치한 단어와 출처가 붙인 태그를 정리한 것입니다. AI 분석 결과가 아닙니다.",
    "키워드를 누르면 그 키워드가 포함된 콘텐츠만 Trending에서 볼 수 있습니다.",
  ],
  chart: ["콘텐츠가 실제로 게시된 날짜별 개수입니다. 출처가 게시일을 주지 않은 콘텐츠는 수집일로 셉니다.", "아래 로고는 최근 7일 출처별 건수입니다."],
} as const;

function Help({ label, lines, align }: { label: string; lines: readonly string[]; align?: "left" | "right" }) {
  return (
    <InfoTip label={label} align={align}>
      {lines.map((l) => (
        <span key={l} className="block">
          {l}
        </span>
      ))}
    </InfoTip>
  );
}

function Stat({ icon: Icon, label, value, hint, help, align }: { icon: typeof FileText; label: string; value: string | number; hint?: string; help: readonly string[]; align?: "left" | "right" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {label} <Help label={label} lines={help} align={align} />
          </p>
          <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
          {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export async function LiveOverview({ userId }: { userId: string }) {
  const supabase = await createClient();
  const weekIso = daysAgoIso(7);
  const [total, newToday, weekItems, followingRes] = await Promise.all([
    countContent(userId),
    countContent(userId, startOfTodayKstIso()),
    listContent(userId, { sinceIso: weekIso, limit: 500 }),
    supabase.from("influencer_links").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", weekIso),
  ]);
  const topicLinks = weekItems.reduce((n, i) => n + (i.topic_links ?? []).filter((l) => l.topic).length, 0);
  const keywords = topKeywords(weekItems);
  const chart = dailyBuckets(weekItems, 7);
  const sourceCounts = new Map<string, { item: ContentItem; count: number }>();
  for (const it of weekItems) {
    const k = it.source?.slug ?? it.source_name;
    const cur = sourceCounts.get(k);
    if (cur) cur.count += 1;
    else sourceCounts.set(k, { item: it, count: 1 });
  }
  const sources = [...sourceCounts.values()].sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="요약 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={FileText} label="전체 콘텐츠" value={total.toLocaleString("ko-KR")} help={HELP.total} />
        <Stat icon={Sparkles} label="오늘 신규 콘텐츠" value={newToday.toLocaleString("ko-KR")} hint="KST 00:00 이후 수집" help={HELP.today} />
        <Stat icon={Hash} label="관심 주제 업데이트" value={topicLinks.toLocaleString("ko-KR")} hint="최근 7일" help={HELP.topics} align="right" />
        <Stat icon={UserCheck} label="팔로잉 업데이트" value={followingRes.count ?? 0} hint="최근 7일 등록 링크" help={HELP.following} align="right" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Brain className="h-4 w-4 text-primary" aria-hidden="true" /> Today&apos;s Intelligence
            <Help label="Today's Intelligence" lines={HELP.intelligence} />
          </CardTitle>
          <CardDescription>최근 7일 콘텐츠 키워드 빈도 · AI 분석 아님 · 키워드를 누르면 관련 콘텐츠로 이동</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            {keywords.length === 0 ? (
              <p className="text-xs text-muted-foreground">집계할 키워드가 없습니다.</p>
            ) : (
              <ol className="flex flex-col gap-0.5" aria-label="최근 7일 키워드 순위">
                {keywords.map((k, i) => (
                  <li key={k.keyword}>
                    <Link href={`/trending?period=weekly&limit=50&kw=${encodeURIComponent(k.keyword)}`} className="flex items-center justify-between rounded-md px-1 py-0.5 text-sm hover:bg-accent">
                      <span>
                        <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}</span>#{k.keyword}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">{k.count}건</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              최근 7일 콘텐츠 (게시일 기준) <Help label="일자별 콘텐츠 차트" lines={HELP.chart} align="right" />
            </p>
            <CollectionChart data={chart} />
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5" aria-label="최근 7일 출처별 건수">
              {sources.map(({ item, count }) => (
                <span key={item.source?.slug ?? item.source_name} className="inline-flex items-center gap-1">
                  <SourceBadge name={item.source_name} sourceType={item.source_type} logoKey={item.source?.logo_key} url={item.original_url} provenance={item.provenance} size="xs" showType={false} />
                  <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
