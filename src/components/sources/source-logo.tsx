"use client";

import { useState } from "react";
import type { SourceLogo as Logo } from "@/lib/sources/registry";
import { cn } from "@/lib/utils";

const SIZES = { xs: 16, sm: 20, md: 28, lg: 36 } as const;

/** 밝은 브랜드 컬러(예: Hugging Face 노랑)에서 대비가 충분한 글자색 */
function textOn(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? "#111827" : "#FFFFFF";
}

/** 검정 계열 아이콘(GitHub, X 등)이 다크 모드에서 사라지지 않도록 처리 */
function isNearBlack(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255) < 120;
}

export function SourceLogo({
  logo,
  size = "sm",
  className,
}: {
  logo: Logo;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  const [faviconFailed, setFaviconFailed] = useState(false);
  const common = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[22%] ring-1 ring-black/5 dark:ring-white/10",
    className,
  );

  if (logo.kind === "icon") {
    // 아이콘은 항상 흰 배경 타일 위에 표시 → 검정 아이콘도 다크 모드에서 식별 가능
    const fill = isNearBlack(logo.color) ? "#111111" : logo.color;
    return (
      <span
        role="img"
        aria-label={`${logo.label} 로고`}
        title={logo.label}
        className={cn(common, "bg-white")}
        style={{ width: px, height: px }}
      >
        <svg viewBox="0 0 24 24" width={px * 0.66} height={px * 0.66} aria-hidden="true" fill={fill}>
          <path d={logo.path} />
        </svg>
      </span>
    );
  }

  if (logo.kind === "favicon" && !faviconFailed) {
    return (
      <span
        title={logo.label}
        className={cn(common, "bg-white")}
        style={{ width: px, height: px }}
      >
        {/* 외부 favicon: next/image 최적화 대상 아님 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo.url}
          alt={`${logo.label} 로고`}
          width={px * 0.75}
          height={px * 0.75}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFaviconFailed(true)}
        />
      </span>
    );
  }

  // 모노그램 또는 favicon 로드 실패 시 대체 표시
  const text = logo.text;
  return (
    <span
      role="img"
      aria-label={`${logo.label} 로고`}
      title={logo.label}
      className={common}
      style={{
        width: px,
        height: px,
        backgroundColor: logo.color,
        color: textOn(logo.color),
        fontSize: Math.max(8, Math.round(px * (text.length > 2 ? 0.32 : 0.42))),
      }}
    >
      <span className="font-bold leading-none tracking-tight">{text}</span>
    </span>
  );
}
