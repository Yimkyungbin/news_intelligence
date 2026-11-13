import Form from "next/form";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { linkedinLogo, listPeople } from "@/lib/people";
import { INFLUENCER_CATEGORIES } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { AddPerson } from "./add-person";
import { PersonCard } from "./person-card";

export const metadata = { title: "Influencers" };

/** 탭: 전체 / 팔로우 중 (기존 My Following) / 팔로우 후보 (기존 Recommended Influencers) */
const TABS = {
  all: { label: "전체", following: undefined },
  following: { label: "팔로우 중", following: true },
  candidates: { label: "팔로우 후보", following: false },
} as const;
type Tab = keyof typeof TABS;

const EMPTY: Record<Tab, { title: string; description: string }> = {
  all: { title: "등록된 인물이 없습니다", description: "이름, 직책, 회사, LinkedIn 프로필 URL을 등록하세요." },
  following: { title: "팔로우 중인 인물이 없습니다", description: "인물 카드의 팔로우 버튼을 누르거나, 이 탭에서 인물을 추가하면 팔로우 상태로 등록됩니다." },
  candidates: { title: "팔로우 후보가 없습니다", description: "등록했지만 아직 팔로우하지 않은 인물이 여기에 표시됩니다." },
};

export default async function InfluencersPage({ searchParams }: PageProps<"/influencers">) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === "following" || sp.tab === "candidates" ? sp.tab : "all";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const categoryParam = typeof sp.category === "string" ? sp.category : "";
  const category = (INFLUENCER_CATEGORIES as readonly string[]).includes(categoryParam) ? categoryParam : "";

  const user = await requireUser();
  // 탭 건수는 검색 조건과 무관하게 전체 기준
  const [{ people, linksByPerson }, { people: everyone }] = await Promise.all([
    listPeople(user.id, { q, category, following: TABS[tab].following }),
    listPeople(user.id),
  ]);
  const counts: Record<Tab, number> = {
    all: everyone.length,
    following: everyone.filter((p) => p.is_following).length,
    candidates: everyone.filter((p) => !p.is_following).length,
  };
  const logo = linkedinLogo();
  const href = (t: Tab) => {
    const u = new URLSearchParams(Object.entries({ tab: t === "all" ? "" : t, q, category }).filter(([, v]) => v) as [string, string][]);
    const s = u.toString();
    return s ? `/influencers?${s}` : "/influencers";
  };

  return (
    <>
      <PageHeader
        title="Influencers"
        description="전문가·인플루언서와 게시글 링크를 직접 관리합니다. 팔로우한 인물의 링크는 Dashboard와 브리핑에 표시됩니다. LinkedIn 계정 연동·자동 수집은 하지 않으며, 팔로워 수·영향력 점수는 검증 가능한 데이터가 없어 표시하지 않습니다."
      />

      <div className="mb-3 flex gap-1 border-b" role="tablist" aria-label="인물 보기">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            role="tab"
            aria-selected={tab === t}
            href={href(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-1.5 text-sm",
              tab === t ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TABS[t].label} <span className="tabular-nums text-xs text-muted-foreground">{counts[t]}</span>
          </Link>
        ))}
      </div>

      <Form action="/influencers" className="mb-4 flex flex-wrap gap-2" role="search">
        {tab !== "all" ? <input type="hidden" name="tab" value={tab} /> : null}
        <label htmlFor="inf-q" className="sr-only">
          이름 또는 소속 검색
        </label>
        <Input id="inf-q" name="q" defaultValue={q} placeholder="이름 또는 소속 검색" className="max-w-xs" maxLength={100} />
        <label htmlFor="inf-cat" className="sr-only">
          분야
        </label>
        <Select id="inf-cat" name="category" defaultValue={category} className="max-w-56">
          <option value="">전체 분야</option>
          {INFLUENCER_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          검색
        </Button>
      </Form>

      <div className="flex flex-col gap-4">
        {/* 팔로우 중 탭에서 추가하면 팔로우 상태로 등록 */}
        <AddPerson isFollowing={tab === "following"} label={tab === "following" ? "팔로우할 인물 추가" : "인물 추가"} />
        {people.length === 0 ? (
          <EmptyState title={q || category ? "검색 결과가 없습니다" : EMPTY[tab].title} description={q || category ? undefined : EMPTY[tab].description} />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {people.map((p) => (
              <PersonCard key={p.id} person={p} links={linksByPerson[p.id] ?? []} linkedinLogo={logo} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
