import { type VariantProps, cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn 스타일 배지 — 2026-09-14(BY-560) 결과 화면의 두 알약(집중률 · 최고 집중 시간)을 하나로
 * 묶었다. 둘 다 배경색 알약에 브랜드색 글자이고, 테두리를 그림자로 그리느냐 선으로 그리느냐만
 * 다르다. 라딕스 Slot 없이 `span` 하나다.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const badgeVariants = cva(
  "inline-flex items-center gap-[6px] rounded-full bg-background font-semibold whitespace-nowrap text-primary tabular-nums",
  {
    variants: {
      variant: {
        /** 집중률 배지(히어로) — 1px 안쪽 테두리 + 브랜드색 그림자(BY-557 시안). */
        elevated:
          "px-3 py-[6px] text-[12px] leading-[14px] shadow-[inset_0_0_0_1px_var(--color-border),0_2px_8px_color-mix(in_srgb,var(--color-primary)_12%,transparent)]",
        /** 최고 집중 배지(타임라인) — 브랜드색 1.5px 선 테두리(3차 시안 이미지). */
        outline: "border-[1.5px] border-primary px-3 py-[4px] text-[13px] leading-[16px] font-bold",
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
