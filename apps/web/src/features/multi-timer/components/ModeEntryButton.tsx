import { forwardRef } from "react";

import {
  controlButtonVariants,
  SESSION_SYMBOL_SCALE,
} from "@/features/study-session/components/controlButtonVariants";
import { useNativeControl } from "@/lib/nativeControls";

import { TimerIcon } from "../icons";

export interface ModeEntryButtonProps {
  /** 모드 화면 개폐 상태 */
  expanded: boolean;
  /** 간단 모드에서 앱 버튼을 흐리게 감춘다. */
  faded: boolean;
  onClick: () => void;
}

/**
 * 세션 화면 오른쪽 위의 타이머 진입 버튼
 *
 * 뽀모도로는 모드 화면 안의 토글로 고른다.
 * 켜진 모드는 모드 화면이 측정 화면을 덮고 있어서 버튼에 켜짐 색을 따로 두지 않는다.
 * 세션 레이어가 `pointer-events-none`이라 클릭을 받으려면 스스로 `pointer-events-auto`여야 한다.
 */
export const ModeEntryButton = forwardRef<HTMLButtonElement, ModeEntryButtonProps>(
  function ModeEntryButton({ expanded, faded, onClick }, ref) {
    const native = useNativeControl<HTMLButtonElement>(
      {
        id: "session-timer",
        kind: "button",
        title: null,
        systemImage: "timer",
        image: null,
        shape: "circle",
        disabled: false,
        accessibilityLabel: "타이머",
        tone: "default",
        faded,
      },
      onClick,
      { measureIcon: true, iconScale: SESSION_SYMBOL_SCALE },
    );
    return (
      <button
        // 모드를 끈 뒤 포커스를 돌려줄 ref와 앱 부품 등록이 같은 요소를 받는다.
        ref={(node) => {
          native.ref(node);
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        type="button"
        aria-label="타이머"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onClick={onClick}
        className={controlButtonVariants()}
      >
        <TimerIcon className="size-7 regular:size-8.25 short-side-lg:size-10.25" />
      </button>
    );
  },
);
