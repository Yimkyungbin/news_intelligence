"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { NAV_ITEMS } from "./nav";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="주 메뉴" className="flex flex-col gap-0.5 p-2">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-4 py-3.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold leading-tight">
        {BRAND.primary}
        <br />
        <span className="text-muted-foreground">{BRAND.secondary}</span>
      </span>
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
      <Brand />
      <SidebarNav />
      <div className="mt-auto p-4 text-[11px] leading-relaxed text-muted-foreground">
        LinkedIn과 제휴하지 않은 독립 서비스입니다. 모든 콘텐츠는 출처와 권한 정보를 함께 표시합니다.
      </div>
    </aside>
  );
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="메뉴">
      <button className="absolute inset-0 bg-black/40" aria-label="메뉴 닫기" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar shadow-xl">
        <div className="flex items-center justify-between pr-2">
          <Brand />
          <button onClick={onClose} className="rounded-md p-2 hover:bg-accent" aria-label="메뉴 닫기">
            <X className="h-4 w-4" />
          </button>
        </div>
        <SidebarNav onNavigate={onClose} />
      </div>
    </div>
  );
}
