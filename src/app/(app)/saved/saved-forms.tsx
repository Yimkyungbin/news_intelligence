"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { addManualContent, createFolder, deleteSavedPost, updateSavedPost } from "./actions";
import { Card, CardContent, Field, Input, Select, Switch, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { FieldError, SubmitButton, useActionToast } from "@/components/forms";
import { ConfirmButton } from "@/components/confirm-button";
import type { Folder } from "@/lib/types";
import { pickValue } from "@/lib/utils";

function FolderSelect({ id, folders, defaultValue }: { id: string; folders: Folder[]; defaultValue?: string | null }) {
  return (
    <Select id={id} name="folder_id" defaultValue={defaultValue ?? ""}>
      <option value="">폴더 없음</option>
      {folders.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </Select>
  );
}

export function AddManualContent({ folders }: { folders: Folder[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(addManualContent, null);
  const close = useCallback(() => setOpen(false), []);
  useActionToast(state, close);
  const v = state?.ok ? undefined : state?.values;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Plus /> URL 직접 등록
        </Button>
      </div>
      {open ? (
        <Card>
          <CardContent className="p-4">
            <form action={action} className="grid gap-3 md:grid-cols-2">
              <Field label="원문 URL *" htmlFor="m-url" className="md:col-span-2" hint="LinkedIn 게시글 URL은 링크로만 저장하며 내용을 가져오지 않습니다.">
                <Input id="m-url" name="url" type="url" required placeholder="https://..." defaultValue={pickValue(v, "url", "")} />
                <FieldError errors={state?.errors} name="url" />
              </Field>
              <Field label="제목 *" htmlFor="m-title">
                <Input id="m-title" name="title" required maxLength={500} defaultValue={pickValue(v, "title", "")} />
                <FieldError errors={state?.errors} name="title" />
              </Field>
              <Field label="작성자" htmlFor="m-author">
                <Input id="m-author" name="author" maxLength={200} defaultValue={pickValue(v, "author", "")} />
              </Field>
              <Field label="요약 (직접 작성)" htmlFor="m-summary" className="md:col-span-2">
                <Textarea id="m-summary" name="summary" rows={2} maxLength={5000} defaultValue={pickValue(v, "summary", "")} />
              </Field>
              <Field label="개인 메모" htmlFor="m-notes">
                <Textarea id="m-notes" name="notes" rows={2} maxLength={4000} defaultValue={pickValue(v, "notes", "")} />
              </Field>
              <div className="flex flex-col gap-3">
                <Field label="태그" htmlFor="m-tags" hint="쉼표로 구분">
                  <Input id="m-tags" name="tags" placeholder="rag, 아키텍처" defaultValue={pickValue(v, "tags", "")} />
                </Field>
                <Field label="폴더" htmlFor="m-folder">
                  <FolderSelect id="m-folder" folders={folders} defaultValue={pickValue(v, "folder_id", "")} />
                </Field>
              </div>
              <div className="flex justify-end gap-2 md:col-span-2">
                <Button variant="ghost" size="sm" onClick={close}>
                  취소
                </Button>
                <SubmitButton size="sm" pendingText="등록 중...">
                  등록 및 저장
                </SubmitButton>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function NewFolderForm() {
  const [state, action] = useActionState(createFolder, null);
  const ref = useRef<HTMLFormElement>(null);
  useActionToast(state, () => ref.current?.reset());
  return (
    <form ref={ref} action={action} className="flex gap-1">
      <label htmlFor="folder-name" className="sr-only">
        새 폴더 이름
      </label>
      <Input id="folder-name" name="name" required maxLength={60} placeholder="새 폴더" className="h-8 text-xs" />
      <SubmitButton size="icon-sm" variant="secondary" aria-label="폴더 만들기">
        <FolderPlus />
      </SubmitButton>
    </form>
  );
}

export function SavedPostEditor({
  savedId,
  notes,
  tags,
  folderId,
  inKnowledgeBase,
  folders,
}: {
  savedId: string;
  notes: string | null;
  tags: string[];
  folderId: string | null;
  inKnowledgeBase: boolean;
  folders: Folder[];
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(updateSavedPost.bind(null, savedId), null);
  const close = useCallback(() => setEditing(false), []);
  useActionToast(state, close);

  if (!editing) {
    return (
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          {notes ? <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-2 text-xs">{notes}</p> : null}
          {tags.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.map((t) => (
                <a key={t} href={`/saved?tag=${encodeURIComponent(t)}`} className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/20">
                  {t}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0">
          <Button variant="ghost" size="icon-sm" aria-label="메모·태그 편집" title="메모·태그 편집" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <ConfirmButton
            variant="ghost"
            size="icon-sm"
            aria-label="저장 삭제"
            title="저장 삭제"
            confirmText="저장 목록에서 삭제할까요?"
            action={() => deleteSavedPost(savedId)}
          >
            <Trash2 className="text-destructive" />
          </ConfirmButton>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="mt-2 grid gap-2 rounded-md border p-3 md:grid-cols-2">
      <Field label="개인 메모" htmlFor={`n-${savedId}`} className="md:col-span-2">
        <Textarea id={`n-${savedId}`} name="notes" rows={3} maxLength={4000} defaultValue={notes ?? ""} />
      </Field>
      <Field label="태그" htmlFor={`t-${savedId}`} hint="쉼표로 구분">
        <Input id={`t-${savedId}`} name="tags" defaultValue={tags.join(", ")} />
      </Field>
      <Field label="폴더" htmlFor={`f-${savedId}`}>
        <FolderSelect id={`f-${savedId}`} folders={folders} defaultValue={folderId} />
      </Field>
      <div className="flex items-center justify-between md:col-span-2">
        <Switch id={`kb-${savedId}`} name="in_knowledge_base" defaultChecked={inKnowledgeBase} label="Knowledge Base에 추가" />
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            취소
          </Button>
          <SubmitButton size="sm">저장</SubmitButton>
        </div>
      </div>
    </form>
  );
}
