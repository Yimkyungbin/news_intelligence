"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { TopicForm } from "./topic-form";
import { createTopic, deleteTopic, setTopicActive, updateTopic } from "./actions";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActionButton, ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@/lib/utils";
import type { Topic } from "@/lib/types";

const LANG = { all: "전체", ko: "한국어", en: "영어" } as const;

export function TopicList({ topics, counts }: { topics: Topic[]; counts: Record<string, number> }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          <Plus /> 주제 추가
        </Button>
      </div>

      {adding ? (
        <Card>
          <CardContent className="p-4">
            <TopicForm action={createTopic} submitLabel="추가" onDone={() => setAdding(false)} />
          </CardContent>
        </Card>
      ) : null}

      {topics.length === 0 ? (
        <EmptyState title="등록된 주제가 없습니다" description="관심 주제를 추가하면 관련 콘텐츠를 수집·분류합니다." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {topics.map((t) =>
            editing === t.id ? (
              <Card key={t.id} className="md:col-span-2">
                <CardContent className="p-4">
                  <TopicForm action={updateTopic.bind(null, t.id)} topic={t} submitLabel="저장" onDone={() => setEditing(null)} />
                </CardContent>
              </Card>
            ) : (
              <Card key={t.id} className={t.is_active ? "" : "opacity-60"}>
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/topics/${t.id}`} className="text-sm font-semibold hover:text-primary">
                        {t.name}
                      </Link>
                      {t.description ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Badge variant="outline">P{t.priority}</Badge>
                      <Badge variant={t.is_active ? "success" : "outline"}>{t.is_active ? "수집 중" : "중지"}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.keywords.slice(0, 6).map((k) => (
                      <Badge key={k} variant="secondary">
                        {k}
                      </Badge>
                    ))}
                    {t.keywords.length > 6 ? <Badge variant="outline">+{t.keywords.length - 6}</Badge> : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {LANG[t.language]} · 콘텐츠 {counts[t.id] ?? 0}건 · 마지막 수집 {t.last_collected_at ? formatDate(t.last_collected_at) : "없음"}
                    </span>
                    <div className="flex">
                      <ActionButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.is_active ? "수집 비활성화" : "수집 활성화"}
                        title={t.is_active ? "수집 비활성화" : "수집 활성화"}
                        action={() => setTopicActive(t.id, !t.is_active)}
                      >
                        <Power />
                      </ActionButton>
                      <Button variant="ghost" size="icon-sm" aria-label="수정" title="수정" onClick={() => setEditing(t.id)}>
                        <Pencil />
                      </Button>
                      <ConfirmButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="삭제"
                        title="삭제"
                        confirmText={`'${t.name}' 주제를 삭제할까요? 주제-콘텐츠 연결도 함께 삭제됩니다.`}
                        action={() => deleteTopic(t.id)}
                      >
                        <Trash2 className="text-destructive" />
                      </ConfirmButton>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      )}
    </div>
  );
}
