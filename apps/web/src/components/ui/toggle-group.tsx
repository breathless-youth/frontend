import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

import { cn } from "@/lib/utils";

/**
 * shadcn `ToggleGroup` — 프로필 목표 카테고리 칩에 쓴다.
 *
 * Radix 가 roving tabindex, 방향키 이동, `aria-pressed`, 단일 선택 시 재클릭 해제를 맡는다.
 * `type="single"` 은 선택된 값을 다시 누르면 빈 문자열로 되돌린다 — 카테고리는 선택 항목이라
 * 이 동작이 필요하다(호출부에서 빈 문자열을 null 로 바꾼다).
 */
const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    // 세로 간격 12는 아이템 히트 영역(before -inset-y-1.5, 위아래 6씩)이 다음 줄과 겹치지
    // 않게 하는 최소값이다. 가로는 시안대로 8.
    className={cn("flex flex-wrap gap-x-2 gap-y-3", className)}
    {...props}
  />
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

/**
 * 칩 하나. 시안 pill 은 시각 높이 32라 터치 타겟 44 를 `before` 히트 영역으로 채운다
 * (focusmakers-design 규칙 — 시각 크기가 작으면 `before:-inset` 로 넓힌다).
 */
const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      "relative inline-flex h-8 items-center rounded-full border border-border bg-muted px-3.5 text-[13px] font-medium text-muted-foreground",
      "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
      "transition-colors motion-reduce:transition-none",
      "data-[state=on]:border-transparent data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)]",
      className,
    )}
    {...props}
  >
    {children}
  </ToggleGroupPrimitive.Item>
));
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
