import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * shadcn `Switch`. 색과 탭 영역만 바꿨다.
 *
 * 트랙은 shadcn 기본값인 44×24 로 두되, 보이지 않는 `after` 를 위아래 10px 씩 덧대 실제로
 * 눌리는 영역을 44×44 로 만든다. 부모 줄에 높이를 주는 것으로는 버튼 자신의 탭 영역이
 * 넓어지지 않아 접근성 기준을 못 맞춘다.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
      "after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-['']",
      "transition-colors duration-200 motion-reduce:transition-none",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-[var(--state-focus)] data-[state=unchecked]:bg-white/25",
      className,
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block size-5 rounded-full bg-white shadow-lg ring-0",
        "transition-transform duration-200 motion-reduce:transition-none",
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
