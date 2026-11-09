"use client";

import { useEffect, useRef, useState } from "react";
import Form from "next/form";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Bell, LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { MobileSidebar } from "./sidebar";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(auth)/actions";

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return ref;
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const order = ["light", "dark", "system"] as const;
  const next = order[(order.indexOf((theme as (typeof order)[number]) ?? "system") + 1) % order.length];
  const label = { light: "라이트", dark: "다크", system: "시스템" };
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`테마 변경 (다음: ${label[next]})`}
      title={`테마: ${label[(theme as keyof typeof label) ?? "system"] ?? "시스템"}`}
    >
      <Sun className="dark:hidden" aria-hidden="true" />
      <Moon className="hidden dark:block" aria-hidden="true" />
    </Button>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" aria-label="알림" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell aria-hidden="true" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border bg-popover p-3 text-sm shadow-lg">
          <p className="font-medium">알림</p>
          <p className="mt-2 text-xs text-muted-foreground">새 알림이 없습니다. 알림 기능은 Phase 4에서 제공됩니다.</p>
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const initial = (name || email || "?").slice(0, 1).toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="사용자 메뉴"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary hover:bg-primary/25"
      >
        {initial}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-60 rounded-lg border bg-popover p-1 text-sm shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <div className="my-1 h-px bg-border" />
          <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-md px-3 py-1.5 hover:bg-accent">
            설정
          </Link>
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-accent">
              <LogOut className="h-4 w-4" aria-hidden="true" /> 로그아웃
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function Topbar({ name, email }: { name: string; email: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="메뉴 열기" onClick={() => setMenuOpen(true)}>
        <Menu aria-hidden="true" />
      </Button>
      <MobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <Form action="/search" className="relative w-full max-w-md" role="search">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          name="q"
          type="search"
          placeholder="콘텐츠, 주제, 인물 검색"
          aria-label="전역 검색"
          maxLength={100}
          className="h-9 w-full rounded-md border border-input bg-muted/50 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Form>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <Notifications />
        <UserMenu name={name} email={email} />
      </div>
    </header>
  );
}
