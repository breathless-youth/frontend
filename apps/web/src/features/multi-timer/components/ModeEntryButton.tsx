import { forwardRef } from "react";

import {
  controlButtonVariants,
  SESSION_SYMBOL_SCALE,
} from "@/features/study-session/components/controlButtonVariants";
import { useNativeControl } from "@/lib/nativeControls";

import { PomodoroIcon, TimerIcon } from "../icons";
import type { ModeKind } from "../multiTimerMachine";

export interface ModeEntryButtonProps {
  kind: ModeKind;
  /** 모드 화면 개폐 상태 */
  expanded: boolean;
  /** 간단 모드에서 앱 버튼을 흐리게 감춘다. */
  faded: boolean;
  onClick: () => void;
}

// 뽀모도로는 맞는 SF Symbol이 없어 앱에 넣은 웹 아이콘 그림으로 그리고, 그 그림이 없는 이전 앱은 비슷한 심벌로 그린다.
const MODE_ENTRY = {
  timer: {
    label: "타이머",
    id: "session-timer",
    systemImage: "timer",
    image: null,
    Icon: TimerIcon,
  },
  pomodoro: {
    label: "뽀모도로",
    id: "session-pomodoro",
    systemImage: "chart.pie",
    image: "pomodoro",
    Icon: PomodoroIcon,
  },
} as const;

/**
 * 세션 화면 오른쪽 위의 타이머·뽀모도로 진입 버튼
 *
 * 켜진 모드는 모드 화면이 측정 화면을 덮고 있어서 버튼에 켜짐 색을 따로 두지 않는다.
 * 세션 레이어가 `pointer-events-none`이라 클릭을 받으려면 스스로 `pointer-events-auto`여야 한다.
 */
export const ModeEntryButton = forwardRef<HTMLButtonElement, ModeEntryButtonProps>(
  function ModeEntryButton({ kind, expanded, faded, onClick }, ref) {
    const { label, id, systemImage, image, Icon } = MODE_ENTRY[kind];
    const native = useNativeControl<HTMLButtonElement>(
      {
        id,
        kind: "button",
        title: null,
        systemImage,
        image,
        shape: "circle",
        disabled: false,
        accessibilityLabel: label,
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
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onClick={onClick}
        className={controlButtonVariants()}
      >
        <Icon className="size-7 regular:size-8.25 short-side-lg:size-10.25" />
      </button>
    );
  },
);
