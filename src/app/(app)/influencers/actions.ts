"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { failure, linkSchema, parseInfluencerForm } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

const uuid = z.uuid();
const refresh = () => revalidatePath("/", "layout");

export async function createPerson(isFollowing: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseInfluencerForm(fd);
  if (!parsed.success) return failure("입력값을 확인하세요.", fd, parsed.error);
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("influencers").insert({ ...parsed.data, user_id: userId, is_following: isFollowing });
  if (error) return failure("인물을 추가하지 못했습니다.", fd);
  refresh();
  return { ok: true, message: "인물을 추가했습니다." };
}

export async function updatePerson(personId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(personId);
  const parsed = parseInfluencerForm(fd);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  if (!parsed.success) return failure("입력값을 확인하세요.", fd, parsed.error);
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("influencers").update(parsed.data).eq("id", id.data).eq("user_id", userId);
  if (error) return failure("수정하지 못했습니다.", fd);
  refresh();
  return { ok: true, message: "수정했습니다." };
}

export async function setPersonFlag(personId: string, flag: "is_active" | "is_following", value: boolean): Promise<ActionState> {
  const id = uuid.safeParse(personId);
  if (!id.success || (flag !== "is_active" && flag !== "is_following")) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("influencers").update({ [flag]: value }).eq("id", id.data).eq("user_id", userId);
  if (error) return { ok: false, message: "변경하지 못했습니다." };
  refresh();
  const msg = flag === "is_active" ? (value ? "활성화했습니다." : "비활성화했습니다.") : value ? "팔로우했습니다." : "팔로우를 해제했습니다.";
  return { ok: true, message: msg };
}

export async function deletePerson(personId: string): Promise<ActionState> {
  const id = uuid.safeParse(personId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("influencers").delete().eq("id", id.data).eq("user_id", userId);
  if (error) return { ok: false, message: "삭제하지 못했습니다." };
  refresh();
  return { ok: true, message: "삭제했습니다." };
}

export async function addPersonLink(personId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(personId);
  const parsed = linkSchema.safeParse({
    url: fd.get("url") ?? "",
    title: fd.get("title") ?? "",
    note: fd.get("note") ?? "",
    posted_at: fd.get("posted_at") ?? "",
  });
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  if (!parsed.success) return failure("입력값을 확인하세요.", fd, parsed.error);
  const { supabase, userId } = await authedClient();
  // 소유권은 DB 트리거(assert_same_owner)에서도 검증
  const { error } = await supabase.from("influencer_links").insert({ ...parsed.data, influencer_id: id.data, user_id: userId });
  if (error) return failure("링크를 추가하지 못했습니다.", fd);
  refresh();
  return { ok: true, message: "링크를 추가했습니다." };
}

export async function deletePersonLink(linkId: string): Promise<ActionState> {
  const id = uuid.safeParse(linkId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("influencer_links").delete().eq("id", id.data).eq("user_id", userId);
  if (error) return { ok: false, message: "링크를 삭제하지 못했습니다." };
  refresh();
  return { ok: true, message: "링크를 삭제했습니다." };
}
