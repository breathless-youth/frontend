import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * shadcn `Tooltip`. 색만 서비스 토큰으로 바꿨다.
 *
 * 원본과 달리 포털을 쓰지 않는다. 세션 화면처럼 CSS 변수를 서브트리에만 주입하는 곳에서
 * `document.body` 로 나가면 색이 통째로 빠지기 때문이다(`ui/sheet.tsx` 의 `container` 와 같은
 * 이유). 툴팁은 작고 조상의 `overflow` 에 잘릴 일이 없어 제자리에 그려도 된다.
 */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 max-w-[220px] rounded-lg bg-[var(--session-dialog-cancel-bg)] px-3 py-2 text-[13px] leading-5 text-white shadow-lg",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
