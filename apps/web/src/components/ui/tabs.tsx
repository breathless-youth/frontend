import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * shadcn `Tabs`. 원본의 알약형 대신 밑줄형으로 둔다. 세션 시트처럼 어두운 면 위에 올릴 때
 * 알약 배경이 한 겹 더 쌓여 답답해 보이기 때문이다.
 *
 * 포털을 쓰지 않는 구조라 CSS 변수를 서브트리에만 주입하는 곳에서도 색이 풀린다.
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("flex items-end gap-2 border-b border-white/10", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // 밑줄이 목록 경계선 위에 겹치도록 -1px 내린다.
      "-mb-px flex min-h-11 items-center gap-1.5 border-b-2 border-transparent whitespace-nowrap",
      "text-[15px] leading-[22px] font-medium transition-colors duration-200 motion-reduce:transition-none",
      "focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:outline-none",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
