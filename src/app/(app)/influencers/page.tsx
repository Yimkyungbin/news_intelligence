import Form from "next/form";
import { requireUser } from "@/lib/auth";
import { linkedinLogo, listPeople } from "@/lib/people";
import { INFLUENCER_CATEGORIES } from "@/lib/types";
import { EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { AddPerson } from "../following/add-person";
import { PersonCard } from "../following/person-card";

export const metadata = { title: "Influencers" };

export default async function InfluencersPage({ searchParams }: PageProps<"/influencers">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const categoryParam = typeof sp.category === "string" ? sp.category : "";
  const category = (INFLUENCER_CATEGORIES as readonly string[]).includes(categoryParam) ? categoryParam : "";

  const user = await requireUser();
  const { people, linksByPerson } = await listPeople(user.id, { q, category });
  const logo = linkedinLogo();

  return (
    <>
      <PageHeader
        title="Influencers"
        description="전문가·인플루언서를 등록하고 분야별로 관리합니다. 팔로워 수·영향력 점수는 검증 가능한 데이터가 없어 표시하지 않습니다."
      />
      <Form action="/influencers" className="mb-4 flex flex-wrap gap-2" role="search">
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
        <AddPerson isFollowing={false} label="인플루언서 등록" />
        {people.length === 0 ? (
          <EmptyState title={q || category ? "검색 결과가 없습니다" : "등록된 인물이 없습니다"} />
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
