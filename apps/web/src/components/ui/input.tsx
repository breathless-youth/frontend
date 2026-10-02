import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn `Input`. 높이·반경·색을 저장소 토큰에 맞췄다
 * — shadcn 기본값(h-9·ring-ring·rounded-md)을 그대로 쓰지 않는다.
 * 시안 실측은 높이 52·radius xl(20).
 * `.theme-soft-blue` 안에서는 `bg-muted`가 흰색, 밖에서는 기존 layer-1 값을 따른다.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-[52px] w-full rounded-xl border border-border bg-muted px-4 text-[15px] text-foreground",
        "placeholder:text-text-tertiary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)]",
        "aria-[invalid=true]:border-state-distract",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
