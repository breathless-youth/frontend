import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn `Progress`. 색·높이만 서비스 토큰으로 바꿨다 — 트랙 `bg/layer-2`, 채움은 브랜드색
 * 반투명에서 불투명으로 가는 그라디언트(홈 순공 게이지, Figma `gauge-fill`). 채움 이동은
 * 모션 축소 환경에서 끈다.
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-bg-layer-2", className)}
    value={value}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full rounded-full bg-gradient-to-r from-primary/50 to-primary transition-transform motion-reduce:transition-none"
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
