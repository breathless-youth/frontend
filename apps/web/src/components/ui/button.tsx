import { type VariantProps, cva } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        outline: "border border-border bg-transparent hover:bg-muted",
        ghost: "hover:bg-muted",
        subtle: "bg-brand-subtle text-primary hover:opacity-90",
        /** 보조 CTA(결과 화면 `홈으로`) — `bg/layer-2` 위 기본 글자색. */
        secondary: "bg-bg-layer-2 text-foreground hover:opacity-90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-12 px-6",
        /** 화면 하단 고정 CTA(Figma `Button / CTA` XL 56px, r16). 폭은 호출부의 flex가 정하므로 패딩 없음. */
        xl: "h-14 rounded-2xl text-[16px] leading-[19px] font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
