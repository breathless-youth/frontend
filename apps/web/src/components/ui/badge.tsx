import { type VariantProps, cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn 스타일 배지
 *
 * — 결과 화면의 두 알약(집중률 · 최대 집중 시간)을 하나로 묶었다.
 * 둘 다 브랜드색 글자이고, 배경을 옅은 브랜드색으로 채우느냐 선 테두리로 그리느냐만 다르다.
 */
/** 세션 상태 필 공통 */
const SESSION_PILL_BASE =
  // 테두리 두께만큼 여백을 줄여야 Figma 안쪽 선과 같은 높이가 나온다.
  // 테두리를 바꾸면 여백도 같이 바꾼다.
  "border-[1.5px] px-[14.5px] py-[7.5px] text-[14px] leading-4.5 font-medium text-white backdrop-blur-[5px] transition-colors duration-200 motion-reduce:transition-none";

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap text-primary tabular-nums",
  {
    variants: {
      variant: {
        /** 집중률 배지(히어로) — 옅은 브랜드색 배경에 브랜드색 글자. */
        elevated: "bg-brand-subtle px-2.75 py-1.25 text-[12px] leading-3.75 font-bold",
        /** 최대 집중 배지(타임라인) — 카드색 배경에 브랜드색 1.5px 선 테두리. */
        outline: "border-[1.5px] border-primary bg-muted px-3 py-1 text-[13px] leading-4 font-bold",
        /** 안내 칩(준비 중 등) — 옅은 회색 배경에 보조 글자색. */
        neutral:
          "bg-bg-layer-2 px-2 py-[4.5px] text-[11px] leading-3.25 font-medium text-muted-foreground",
        /** 공부 세션 상태 필 — 측정 중. 세션 로컬 변수는 sessionTheme.ts가 준다. */
        "session-focus": `bg-(--session-pill-bg) border-(--session-pill-border-focus) ${SESSION_PILL_BASE}`,
        /** 상태 필 — 비집중(휴대폰 사용 등). */
        "session-distract": `bg-(--session-pill-bg-distract) border-(--session-pill-border-distract) ${SESSION_PILL_BASE}`,
        /** 상태 필 — 일시정지. */
        "session-paused": `bg-(--session-pill-bg-paused) border-(--session-pill-border-paused) ${SESSION_PILL_BASE}`,
      },
    },
    defaultVariants: { variant: "elevated" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
