import { type VariantProps, cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn 스타일 배지 — 결과 화면의 두 알약(집중률 · 최고 집중 시간)을 하나로 묶었다. 둘 다
 * 브랜드색 글자이고, 배경을 옅은 브랜드색으로 채우느냐 선 테두리로 그리느냐만 다르다. 라딕스
 * Slot 없이 `span` 하나다.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const badgeVariants = cva(
  "inline-flex items-center gap-[6px] rounded-full font-semibold whitespace-nowrap text-primary tabular-nums",
  {
    variants: {
      variant: {
        /** 집중률 배지(히어로) — 옅은 브랜드색 배경에 브랜드색 글자(V2 시안 pill). */
        elevated: "bg-brand-subtle px-[11px] py-[5px] text-[12px] leading-[15px] font-bold",
        /** 최고 집중 배지(타임라인) — 카드색 배경에 브랜드색 1.5px 선 테두리(3차 시안 이미지). */
        outline:
          "border-[1.5px] border-primary bg-muted px-3 py-[4px] text-[13px] leading-[16px] font-bold",
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
