"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { failure, parseTopicForm } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

const uuid = z.uuid();

export async function createTopic(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseTopicForm(fd);
  if (!parsed.success) return failure("입력값을 확인하세요.", fd, parsed.error);
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("topics").insert({ ...parsed.data, user_id: userId });
  if (error) {
    return failure(error.code === "23505" ? "같은 이름의 주제가 이미 있습니다." : "주제를 추가하지 못했습니다.", fd);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "주제를 추가했습니다." };
}

export async function updateTopic(topicId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(topicId);
  const parsed = parseTopicForm(fd);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  if (!parsed.success) return failure("입력값을 확인하세요.", fd, parsed.error);
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("topics").update(parsed.data).eq("id", id.data).eq("user_id", userId);
  if (error) {
    return failure(error.code === "23505" ? "같은 이름의 주제가 이미 있습니다." : "주제를 수정하지 못했습니다.", fd);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "주제를 수정했습니다." };
}

export async function setTopicActive(topicId: string, active: boolean): Promise<ActionState> {
  const id = uuid.safeParse(topicId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("topics").update({ is_active: active }).eq("id", id.data).eq("user_id", userId);
  if (error) return { ok: false, message: "상태를 변경하지 못했습니다." };
  revalidatePath("/", "layout");
  return { ok: true, message: active ? "수집을 활성화했습니다." : "수집을 비활성화했습니다." };
}

export async function deleteTopic(topicId: string, redirectTo?: string): Promise<ActionState> {
  const id = uuid.safeParse(topicId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("topics").delete().eq("id", id.data).eq("user_id", userId);
  if (error) return { ok: false, message: "주제를 삭제하지 못했습니다." };
  revalidatePath("/", "layout");
  if (redirectTo === "/topics") redirect("/topics");
  return { ok: true, message: "주제를 삭제했습니다." };
}
