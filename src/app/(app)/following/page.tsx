import { redirect } from "next/navigation";

/** My Following 은 Influencers 의 '팔로우 중' 탭으로 통합됨 (기존 링크·북마크 호환) */
export default function FollowingPage() {
  redirect("/influencers?tab=following");
}
