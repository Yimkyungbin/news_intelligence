"use client";

import { useState } from "react";
import { ExternalLink, Pencil, Power, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import { PersonForm } from "./person-form";
import { LinkForm } from "./link-form";
import { deletePerson, deletePersonLink, setPersonFlag, updatePerson } from "./actions";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActionButton, ConfirmButton } from "@/components/confirm-button";
import { SourceLogo } from "@/components/sources/source-logo";
import { cn, formatDate } from "@/lib/utils";
import type { Influencer, InfluencerLink } from "@/lib/types";
import type { SourceLogo as Logo } from "@/lib/sources/registry";

export type LinkWithLogo = InfluencerLink & { logo: Logo };

export function PersonCard({ person, links, linkedinLogo }: { person: Influencer; links: LinkWithLogo[]; linkedinLogo: Logo }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card>
        <CardContent className="p-4">
          <PersonForm action={updatePerson.bind(null, person.id)} person={person} submitLabel="저장" onDone={() => setEditing(false)} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(!person.is_active && "opacity-60")}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{person.name}</h3>
              {person.linkedin_url ? (
                <a
                  href={person.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  aria-label={`${person.name} LinkedIn 프로필 열기 (새 탭)`}
                >
                  <SourceLogo logo={linkedinLogo} size="xs" /> 프로필 <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
              {!person.is_active ? <Badge variant="outline">비활성</Badge> : null}
              {person.is_following ? <Badge variant="default">Following</Badge> : null}
            </div>
            <p className="text-xs text-muted-foreground">{[person.job_title, person.company].filter(Boolean).join(" · ") || "직책/소속 미입력"}</p>
          </div>
          <div className="flex shrink-0">
            <ActionButton
              variant="ghost"
              size="icon-sm"
              aria-label={person.is_following ? "팔로우 해제" : "팔로우"}
              title={person.is_following ? "팔로우 해제" : "팔로우"}
              action={() => setPersonFlag(person.id, "is_following", !person.is_following)}
            >
              {person.is_following ? <UserMinus /> : <UserPlus />}
            </ActionButton>
            <ActionButton
              variant="ghost"
              size="icon-sm"
              aria-label={person.is_active ? "비활성화" : "활성화"}
              title={person.is_active ? "비활성화" : "활성화"}
              action={() => setPersonFlag(person.id, "is_active", !person.is_active)}
            >
              <Power />
            </ActionButton>
            <Button variant="ghost" size="icon-sm" aria-label="수정" title="수정" onClick={() => setEditing(true)}>
              <Pencil />
            </Button>
            <ConfirmButton
              variant="ghost"
              size="icon-sm"
              aria-label="삭제"
              title="삭제"
              confirmText={`'${person.name}'과(와) 등록된 링크를 모두 삭제할까요?`}
              action={() => deletePerson(person.id)}
            >
              <Trash2 className="text-destructive" />
            </ConfirmButton>
          </div>
        </div>

        {person.category.length ? (
          <div className="flex flex-wrap gap-1">
            {person.category.map((c) => (
              <Badge key={c} variant="secondary">
                {c}
              </Badge>
            ))}
          </div>
        ) : null}
        {person.notes ? <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-2 text-xs">{person.notes}</p> : null}

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">콘텐츠 링크 ({links.length})</p>
          {links.length ? (
            <ul className="flex flex-col divide-y rounded-md border">
              {links.map((l) => (
                <li key={l.id} className="flex items-center gap-2 px-2 py-1.5">
                  <SourceLogo logo={l.logo} size="xs" />
                  <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 truncate text-xs hover:text-primary">
                    {l.title ?? l.url}
                  </a>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(l.posted_at ?? l.created_at)}</span>
                  <ConfirmButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label="링크 삭제"
                    confirmText="이 링크를 삭제할까요?"
                    action={() => deletePersonLink(l.id)}
                  >
                    <X />
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          ) : null}
          <LinkForm personId={person.id} />
        </div>
      </CardContent>
    </Card>
  );
}
