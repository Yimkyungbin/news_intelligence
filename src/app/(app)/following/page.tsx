import { requireUser } from "@/lib/auth";
import { linkedinLogo, listPeople } from "@/lib/people";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { AddPerson } from "./add-person";
import { PersonCard } from "./person-card";

export const metadata = { title: "My Following" };

export default async function FollowingPage() {
  const user = await requireUser();
  const { people, linksByPerson } = await listPeople(user.id, { following: true });
  const logo = linkedinLogo();

  return (
    <>
      <PageHeader
        title="My Following"
        description="LinkedIn 계정 연동 없이 인물과 게시글 링크를 직접 관리합니다. 공식 API 승인 시에만 자동 동기화를 추가합니다."
      />
      <div className="flex flex-col gap-4">
        <AddPerson isFollowing label="인물 추가" />
        {people.length === 0 ? (
          <EmptyState title="팔로우 중인 인물이 없습니다" description="이름, 직책, 회사, LinkedIn 프로필 URL을 등록하세요." />
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
