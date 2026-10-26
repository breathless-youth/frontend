import { forwardRef, type PointerEventHandler } from "react";
import { Music } from "lucide-react";

import {
  controlButtonVariants,
  SESSION_SYMBOL_SCALE,
} from "@/features/study-session/components/controlButtonVariants";
import { useNativeControl } from "@/lib/nativeControls";
import { cn } from "@/lib/utils";

export interface AmbientSoundButtonProps {
  /** 켜진 소리 여부 */
  on: boolean;
  /** 페이지 개폐 상태 */
  expanded: boolean;
  onClick: () => void;
  /** 간단 모드에서 앱 버튼을 흐리게 감춘다. */
  faded?: boolean;
  /**
   * 앱 glass 버튼 id
   *
   * 싱글룸과 소셜룸이 같은 id를 쓰지 않게 놓인 화면이 정한다.
   */
  nativeId?: string;
  /**
   * 버튼을 보인 채 앱 버튼의 누름만 막는 잠금
   *
   * 웹 버튼은 놓인 자리가 누름을 막지만 앱 버튼은 웹 위 다른 층에 그려져 그 잠금이 닿지 않는다.
   */
  inactive?: boolean;
  /**
   * 세션 유리 모양 대신 쓰는 바깥 모양
   *
   * 유리 클래스와 섞으면 바탕·그림자·pointer-events-auto가 남아 놓인 자리의 버튼과 달라 보이고 그 자리의 누름 잠금도 뚫는다.
   */
  className?: string;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  /** 제출 중처럼 조작이 안전하지 않은 구간의 잠금 */
  disabled?: boolean;
}

/**
 * 세션 화면의 배경음 진입 버튼
 *
 * 기본 모양은 다른 세션 버튼과 같은 `controlButtonVariants`라 싱글룸 버튼 줄에 섞여도 같아 보인다.
 * 기본 모양에는 `pointer-events-auto`가 들어 있어 `pointer-events-none`인 세션 레이어 위에서도 눌린다.
 * 아이콘은 Figma 자산이 없어 lucide 음표를 자리 표시로 둔다.
 */
export const AmbientSoundButton = forwardRef<HTMLButtonElement, AmbientSoundButtonProps>(
  function AmbientSoundButton(
    {
      on,
      expanded,
      onClick,
      faded = false,
      nativeId = "session-ambient",
      inactive = false,
      className = controlButtonVariants(),
      onPointerDown,
      disabled = false,
    },
    ref,
  ) {
    const label = on ? "배경음 켜짐" : "배경음";
    const control = useNativeControl<HTMLButtonElement>(
      {
        id: nativeId,
        kind: "button",
        title: null,
        systemImage: "music.note",
        shape: "circle",
        disabled: disabled || inactive,
        accessibilityLabel: label,
        tone: on ? "active" : "default",
        faded,
      },
      onClick,
      { measureIcon: true, iconScale: SESSION_SYMBOL_SCALE },
    );
    return (
      <button
        // 페이지를 닫은 뒤 포커스를 돌려줄 ref와 앱 부품 등록이 같은 요소를 받는다.
        ref={(node) => {
          control.ref(node);
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        type="button"
        // 이 버튼은 소리를 켜고 끄지 않고 페이지를 연다. aria-pressed 를 달면 보조기기에 토글로
        // 읽혀 실제 동작과 어긋난다. 재생 여부는 이름으로 전한다.
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        data-on={on}
        disabled={disabled}
        onClick={onClick}
        onPointerDown={onPointerDown}
        className={cn(className, "data-[on=true]:text-(--state-focus)")}
      >
        <Music aria-hidden="true" className="size-5.75 regular:size-6.75 short-side-lg:size-8.5" />
      </button>
    );
  },
);
