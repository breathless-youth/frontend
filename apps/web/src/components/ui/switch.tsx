import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * shadcn `Switch`. 색과 탭 영역만 바꿨다.
 *
 * 트랙은 shadcn 기본값인 44×24 로 두되, 보이지 않는 `after` 를 위아래 10px 씩 덧대 실제로
 * 눌리는 영역을 44×44 로 만든다. 부모 줄에 높이를 주는 것으로는 버튼 자신의 탭 영역이
 * 넓어지지 않아 접근성 기준을 못 맞춘다.
 *
 * `settings` 크기는 설정 목록의 iOS형 51×31 토글이다.
 * 기본 크기의 꺼짐 색은 어두운 세션 시트 전용이라 밝은 설정 카드에서는 테마 토큰을 쓴다.
 */
type SwitchSize = "default" | "settings";

const ROOT_SIZE: Record<SwitchSize, string> = {
  default:
    "h-6 w-11 after:-inset-y-2.5 data-[state=checked]:bg-[var(--state-focus)] data-[state=unchecked]:bg-white/25",
  settings:
    "h-[31px] w-[51px] after:-inset-y-[6.5px] data-[state=checked]:bg-primary data-[state=unchecked]:bg-bg-layer-2",
};

const THUMB_SIZE: Record<SwitchSize, string> = {
  default: "size-5 shadow-lg",
  settings: "size-[27px] shadow-[0_2px_3px_0_rgba(0,0,0,0.15)]",
};

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & { size?: SwitchSize }
>(({ className, size = "default", ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      "peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
      "after:absolute after:inset-x-0 after:content-['']",
      "transition-colors duration-200 motion-reduce:transition-none",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      ROOT_SIZE[size],
      className,
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block rounded-full bg-white ring-0",
        "transition-transform duration-200 motion-reduce:transition-none",
        // 두 크기 모두 트랙 안쪽 폭에서 노브 지름을 뺀 거리가 20px이다.
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
        THUMB_SIZE[size],
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
