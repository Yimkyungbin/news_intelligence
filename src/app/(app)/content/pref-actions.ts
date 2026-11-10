"use server";

import { revalidatePath } from "next/cache";
import { authedClient } from "@/lib/auth";
import type { ActionState } from "@/lib/types";

/** "한국어로 보기" 설정 저장 (사용자별) */
export async function setTranslatePreference(on: boolean): Promise<ActionState> {
  if (typeof on !== "boolean") return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("profiles").update({ translate_ko: on }).eq("id", userId);
  if (error) return { ok: false, message: "설정을 저장하지 못했습니다." };
  revalidatePath("/", "layout");
  return { ok: true };
}
