"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { text } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_MODELS, type ActionState } from "@/lib/types";

const profileSchema = z.object({
  name: text().min(1).max(60),
  language: z.enum(["ko", "en"]),
  timezone: z.enum(["Asia/Seoul", "UTC", "America/Los_Angeles", "America/New_York", "Europe/London"]),
  briefing_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  ai_model: z.enum(AI_MODELS),
  notify_email: z.boolean(),
});

export async function updateProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse({
    name: fd.get("name"),
    language: fd.get("language"),
    timezone: fd.get("timezone"),
    briefing_time: fd.get("briefing_time"),
    ai_model: fd.get("ai_model"),
    notify_email: fd.get("notify_email") === "on",
  });
  if (!parsed.success) return { ok: false, message: "입력값을 확인하세요." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", userId);
  if (error) return { ok: false, message: "설정을 저장하지 못했습니다." };
  revalidatePath("/", "layout");
  return { ok: true, message: "설정을 저장했습니다." };
}

/** 수집 콘텐츠·저장·브리핑 삭제 (계정·주제·인물은 유지) */
export async function deleteMyContent(): Promise<ActionState> {
  const { supabase, userId } = await authedClient();
  const tables = ["saved_posts", "daily_briefings", "content_items"] as const;
  for (const t of tables) {
    const { error } = await supabase.from(t).delete().eq("user_id", userId);
    if (error) return { ok: false, message: "일부 데이터를 삭제하지 못했습니다." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "콘텐츠 데이터를 삭제했습니다." };
}

/** 계정 삭제: auth.users 삭제 → FK cascade 로 모든 사용자 데이터 삭제 */
export async function deleteAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  if (fd.get("confirm") !== "DELETE") return { ok: false, message: "확인 문구로 DELETE 를 입력하세요." };
  const { supabase, userId } = await authedClient();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "서버에 SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않아 계정을 삭제할 수 없습니다." };

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, message: "계정을 삭제하지 못했습니다." };
  await supabase.auth.signOut();
  redirect("/login?notice=deleted");
}
