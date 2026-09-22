import { Info } from "lucide-react";
import { type ComponentProps, type ReactNode, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

type InfoTooltipProps = {
  /** 트리거의 접근성 이름. 예: `카메라 권한 안내` */
  label: string;
  /** 툴팁 본문 */
  children: ReactNode;
  iconSize?: number;
  side?: ComponentProps<typeof TooltipContent>["side"];
  align?: ComponentProps<typeof TooltipContent>["align"];
};

/** 키보드로 온 포커스만 툴팁을 연다. 지원하지 않는 환경(jsdom)은 포커스를 전부 키보드로 본다. */
function isKeyboardFocus(element: HTMLElement): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * ⓘ 아이콘 하나로 여닫는 안내 툴팁. 트리거는 아이콘이 작아도 44px 히트 영역을 갖고, 세로 음수
 * 마진으로 행 높이는 늘리지 않는다.
 *
 * Radix Tooltip은 터치에서 열리지 않는다. hover·focus로만 열고 탭은 닫기로 처리해서, 웹뷰에서
 * ⓘ를 눌러도 아무것도 안 뜬다. 그래서 열림을 직접 들고 탭으로 토글하고, 라이브러리에는 닫는
 * 요청만 받는다. 여는 요청까지 받으면 마우스가 얹힐 때 열렸다가 곧바로 온 클릭이 토글로 닫아
 * 깜빡인다. 키보드 포커스는 예외로 연다. 포인터 탭은 pointerdown을 막아 포커스가 오지 않으므로
 * 키보드로 온 포커스만 남는다.
 *
 * 열린 상태에서 아이콘을 다시 탭하면 닫혀야 한다. Radix는 pointerdown 시점에 두 경로로 먼저
 * 닫는다. 트리거 자체의 pointerdown 처리와, 콘텐츠 바깥 pointerdown 감지(트리거도 바깥이다)다.
 * 둘 다 막지 않으면 뒤따르는 click 토글이 다시 열어 아이콘 탭으로는 영영 못 닫는다. 앞은
 * 트리거 이벤트의 기본 동작을 막아 건너뛰게 하고, 뒤는 바깥 pointerdown의 대상이 트리거면
 * 무시하게 한다.
 *
 * 색은 전역 토큰으로 덮는다. `TooltipContent` 기본색은 세션 서브트리 변수라 홈·설정에는 없다.
 */
export function InfoTooltip({
  label,
  children,
  iconSize = 16,
  side = "bottom",
  align = "start",
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <TooltipProvider>
      <Tooltip
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      >
        <TooltipTrigger
          ref={triggerRef}
          aria-label={label}
          onPointerDown={(event) => event.preventDefault()}
          onFocus={(event) => {
            if (isKeyboardFocus(event.currentTarget)) setOpen(true);
          }}
          onClick={() => setOpen((prev) => !prev)}
          className="-my-3 flex size-11 items-center justify-center rounded-full text-text-tertiary focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:outline-none"
        >
          <Info size={iconSize} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className="bg-foreground text-background"
          onPointerDownOutside={(event) => {
            if (triggerRef.current?.contains(event.target as Node)) {
              event.preventDefault();
            }
          }}
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
