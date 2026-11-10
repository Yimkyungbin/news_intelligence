"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedClient } from "@/lib/auth";
import { failure, manualContentSchema, savedPostSchema, text } from "@/lib/validation";
import { splitList } from "@/lib/utils";
import { detectLanguage } from "@/lib/language";
import { classify } from "@/lib/collectors/classify";
import type { TopicForClassify } from "@/lib/collectors/types";
import type { ActionState } from "@/lib/types";

const uuid = z.uuid();

function refresh() {
  revalidatePath("/", "layout");
}

/** 콘텐츠 북마크 토글 */
export async function toggleSave(contentId: string, save: boolean): Promise<ActionState> {
  const id = uuid.safeParse(contentId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();

  if (save) {
    const { error } = await supabase
      .from("saved_posts")
      .upsert({ user_id: userId, content_id: id.data }, { onConflict: "user_id,content_id", ignoreDuplicates: true });
    if (error) return { ok: false, message: "저장하지 못했습니다." };
  } else {
    const { error } = await supabase.from("saved_posts").delete().eq("content_id", id.data).eq("user_id", userId);
    if (error) return { ok: false, message: "저장 해제하지 못했습니다." };
  }
  refresh();
  return { ok: true, message: save ? "저장했습니다." : "저장을 해제했습니다." };
}

/** 사용자가 URL을 직접 등록하고 바로 저장 (Source C: User-Provided) */
export async function addManualContent(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = manualContentSchema.safeParse({
    url: fd.get("url") ?? "",
    title: fd.get("title") ?? "",
    summary: fd.get("summary") ?? "",
    author: fd.get("author") ?? "",
    notes: fd.get("notes") ?? "",
    tags: splitList(fd.get("tags"), 20),
    folder_id: fd.get("folder_id") ?? "",
  });
  if (!parsed.success) return failure("입력값을 확인하세요.", fd, parsed.error);
  const v = parsed.data;
  const { supabase, userId } = await authedClient();

  const { data: source } = await supabase
    .from("data_sources")
    .select("id")
    .eq("slug", "user-provided")
    .is("user_id", null)
    .maybeSingle();

  const host = new URL(v.url).hostname.replace(/^www\./, "");
  const isLinkedIn = host === "linkedin.com" || host.endsWith(".linkedin.com");

  const { data: content, error } = await supabase
    .from("content_items")
    .upsert(
      {
        user_id: userId,
        source_id: source?.id ?? null,
        title: v.title,
        summary: v.summary,
        original_url: v.url,
        author: v.author,
        source_name: host,
        source_type: "user_provided",
        content_type: isLinkedIn ? "post" : "article",
        language: detectLanguage(v.title, v.summary),
        provenance: "user_provided",
        // 사용자 입력 콘텐츠: 저장·표시는 본인 용도로 허용, AI 처리는 기본 차단
        permission_status: "CONDITIONAL",
        storage_allowed: true,
        display_allowed: true,
        retention_policy: isLinkedIn ? "user_link_only" : "user_managed",
      },
      { onConflict: "user_id,original_url" },
    )
    .select("id")
    .single();
  if (error || !content) return failure("콘텐츠를 등록하지 못했습니다.", fd);

  // 관심 주제 자동 연결 (수집 콘텐츠와 동일한 분류 규칙)
  const { data: topics } = await supabase.from("topics").select("id,keywords,language").eq("user_id", userId).eq("is_active", true);
  const matches = classify(
    { title: v.title, url: v.url, summary: v.summary, author: v.author, publishedAt: null, contentType: "article", popularity: {}, tags: v.tags, language: null },
    (topics ?? []) as TopicForClassify[],
  );
  if (matches.length) {
    await supabase
      .from("content_topics")
      .upsert(matches.map((m) => ({ content_id: content.id, topic_id: m.topicId, relevance_score: m.relevance })), { onConflict: "content_id,topic_id" });
  }

  const { error: saveErr } = await supabase.from("saved_posts").upsert(
    { user_id: userId, content_id: content.id, notes: v.notes, tags: v.tags, folder_id: v.folder_id },
    { onConflict: "user_id,content_id" },
  );
  if (saveErr) return { ok: false, message: "저장하지 못했습니다." };

  refresh();
  return { ok: true, message: "등록하고 저장했습니다." };
}

export async function updateSavedPost(savedId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(savedId);
  const parsed = savedPostSchema.safeParse({
    notes: fd.get("notes") ?? "",
    tags: splitList(fd.get("tags"), 20),
    folder_id: fd.get("folder_id") ?? "",
  });
  if (!id.success || !parsed.success) return failure("입력값을 확인하세요.", fd, parsed.error);
  const { supabase, userId } = await authedClient();
  const { error } = await supabase
    .from("saved_posts")
    .update({ ...parsed.data, in_knowledge_base: fd.get("in_knowledge_base") === "on" })
    .eq("id", id.data)
    .eq("user_id", userId);
  if (error) return { ok: false, message: "수정하지 못했습니다." };
  refresh();
  return { ok: true, message: "저장했습니다." };
}

export async function deleteSavedPost(savedId: string): Promise<ActionState> {
  const id = uuid.safeParse(savedId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("saved_posts").delete().eq("id", id.data).eq("user_id", userId);
  if (error) return { ok: false, message: "삭제하지 못했습니다." };
  refresh();
  return { ok: true, message: "삭제했습니다." };
}

export async function createFolder(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = text().min(1).max(60).safeParse(fd.get("name"));
  if (!name.success) return { ok: false, message: "폴더명은 1~60자로 입력하세요." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("saved_folders").insert({ user_id: userId, name: name.data });
  if (error) return { ok: false, message: error.code === "23505" ? "같은 이름의 폴더가 있습니다." : "폴더를 만들지 못했습니다." };
  refresh();
  return { ok: true, message: "폴더를 만들었습니다." };
}

export async function deleteFolder(folderId: string): Promise<ActionState> {
  const id = uuid.safeParse(folderId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const { supabase, userId } = await authedClient();
  const { error } = await supabase.from("saved_folders").delete().eq("id", id.data).eq("user_id", userId);
  if (error) return { ok: false, message: "폴더를 삭제하지 못했습니다." };
  refresh();
  return { ok: true, message: "폴더를 삭제했습니다. (게시글은 유지됩니다)" };
}
