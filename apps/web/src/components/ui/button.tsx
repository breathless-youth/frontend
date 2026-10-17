import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-[scale,opacity,background-color] duration-150 ease-out active:scale-[0.99] active:opacity-85 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        outline: "border border-border bg-transparent hover:bg-muted",
        ghost: "hover:bg-muted",
        subtle: "bg-brand-subtle text-primary hover:opacity-90",
        raised:
          "border border-primary/35 bg-brand-subtle font-bold text-primary shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:opacity-90",
        secondary: "bg-bg-layer-2 text-foreground hover:opacity-90",
        "outline-primary":
          "border border-primary bg-transparent text-primary hover:bg-brand-subtle",
        link: "bg-transparent font-bold text-primary underline underline-offset-2 hover:opacity-90",
        "outline-destructive":
          "border border-feedback-danger bg-transparent text-feedback-danger hover:opacity-90",
        /** 배경·hover까지 호출부가 자체 cva로 100% 책임지는 경우(세션 컨트롤 바처럼 로컬 색 체계가 있는 화면) */
        unstyled: "",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-12 px-6",
        xl: "h-14 rounded-2xl text-[16px] leading-4.75 font-semibold",
        icon: "h-13.5 w-13.5 rounded-full p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
