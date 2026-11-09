"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PersonForm } from "./person-form";
import { createPerson } from "./actions";
import { Card, CardContent } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export function AddPerson({ isFollowing, label }: { isFollowing: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Plus /> {label}
        </Button>
      </div>
      {open ? (
        <Card>
          <CardContent className="p-4">
            <PersonForm action={createPerson.bind(null, isFollowing)} submitLabel="추가" onDone={() => setOpen(false)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
