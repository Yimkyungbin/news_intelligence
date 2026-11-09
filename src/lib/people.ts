import "server-only";
import { createClient } from "@/lib/supabase/server";
import { LOGO_REGISTRY, resolveSourceLogo } from "@/lib/sources/registry";
import type { Influencer, InfluencerLink } from "@/lib/types";
import type { LinkWithLogo } from "@/app/(app)/following/person-card";

const PERSON_SELECT = "id,name,company,job_title,linkedin_url,category,notes,is_following,is_active,created_at";

/** 인물 목록 + 링크(각 링크 도메인 로고 해석 포함) */
export async function listPeople(
  userId: string,
  opts: { following?: boolean; q?: string; category?: string } = {},
): Promise<{ people: Influencer[]; linksByPerson: Record<string, LinkWithLogo[]> }> {
  const supabase = await createClient();
  let query = supabase.from("influencers").select(PERSON_SELECT).eq("user_id", userId).order("is_active", { ascending: false }).order("name");
  if (opts.following !== undefined) query = query.eq("is_following", opts.following);
  if (opts.category) query = query.contains("category", [opts.category]);
  if (opts.q) {
    // PostgREST or() 구문 주입 방지: 특수문자 제거
    const term = opts.q.replace(/[,()*%\\]/g, " ").trim().slice(0, 100);
    if (term) query = query.or(`name.ilike.%${term}%,company.ilike.%${term}%`);
  }
  const { data: people, error } = await query;
  if (error) throw new Error("인물 목록을 불러오지 못했습니다.");

  const ids = (people ?? []).map((p) => p.id);
  const linksByPerson: Record<string, LinkWithLogo[]> = {};
  if (ids.length) {
    const { data: links } = await supabase
      .from("influencer_links")
      .select("id,influencer_id,url,title,note,posted_at,created_at")
      .eq("user_id", userId)
      .in("influencer_id", ids)
      .order("created_at", { ascending: false });
    for (const l of (links ?? []) as InfluencerLink[]) {
      (linksByPerson[l.influencer_id] ??= []).push({ ...l, logo: resolveSourceLogo({ url: l.url, name: "" }) });
    }
  }
  return { people: (people ?? []) as Influencer[], linksByPerson };
}

export const linkedinLogo = () => resolveSourceLogo({ logoKey: "linkedin", name: LOGO_REGISTRY.linkedin.label });
